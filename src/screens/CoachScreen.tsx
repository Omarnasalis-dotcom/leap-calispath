// AI Coach — Claude-powered, tool-use backed (supabase/functions/ai-coach).
// The system prompt and per-request context (tier, PBs, program, logs) all
// live server-side now — this screen just relays the conversation and
// renders the reply.
//
// Redesigned per assets/design_handoff_leap_coach_chat/ (README.md +
// Leap Coach FAB.dc.html). The ai-coach edge function now streams over SSE
// (event: stage / event: final / event: error) instead of returning one
// JSON blob — see callAiCoach below for the stream consumption, and
// src/components/coach/ActivityBubble.tsx for what renders it. Real risk
// flagged in the implementation plan and accepted for this pass: React
// Native's fetch-stream support hasn't been separately verified before
// building this — if streaming doesn't work on-device, `loading` still
// falls back to a plain disabled-composer state, just without live stages.
import { router } from 'expo-router';
import React, { useState, useRef, useEffect } from 'react';
import { View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Easing,
  Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LeapLogo } from '../components/LeapLogo';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { ActivityBubble, Stage } from '../components/coach/ActivityBubble';
import { ResponseBlockView, ResponseBlock } from '../components/coach/RichBlocks';
import { COACH_COLORS, CoachPalette } from '../components/coach/coachTokens';

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/functions-js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  blocks?: ResponseBlock[];
}

interface Recommendation {
  world: 'strength_trial' | 'power' | 'static' | 'one_min_max';
  reason: string;
}

// Mirrors the shape ai-coach's index.ts builds from a propose_new_program/
// propose_end_program/propose_delete_week/propose_program_from_workouts
// tool call. None of these ever write anything server-side — the actual
// RPC only fires from handleConfirmProgramAction below, gated on an
// explicit tap, never from the AI's own judgment mid-conversation.
interface ProgramAction {
  type: 'create' | 'end' | 'delete_week' | 'create_from_workouts';
  reason: string;
  payload:
    | { name: string; description: string; blocks: unknown[] }
    | { name: string; workoutIds: string[]; dayTitles: string[] }
    | null;
  warriorProgramId: string | null;
  currentProgramIsAiOwned: boolean;
  weekNumber: number | null;
}

const RECOMMENDATION_ROUTES: Record<Recommendation['world'], string> = {
  strength_trial: '/trial',
  power: '/power-world',
  static: '/static-world',
  one_min_max: '/one-min-max',
};

const RECOMMENDATION_LABELS: Record<Recommendation['world'], string> = {
  strength_trial: 'Try the Strength Trial',
  power: 'Try Power World',
  static: 'Try Static World',
  one_min_max: 'Try 1-Minute Max',
};

// Real, verified RAISE EXCEPTION text from every RPC handleConfirmProgramAction
// calls (ai_coach_create_program, ai_coach_create_program_from_workouts,
// ai_coach_delete_week, ai_coach_end_program) — mapped to short, reusable
// human copy instead of showing the athlete raw technical text like
// "RATE_LIMIT: CREATE_PROGRAM DAILY LIMIT REACHED" verbatim.
function friendlyActionError(message: string): string {
  if (message.startsWith('RATE_LIMIT')) {
    return "You've hit today's limit for this — try again tomorrow.";
  }
  if (message.includes('already has logged workout history')) {
    return "That week already has logged workouts, so it can't be deleted.";
  }
  if (message.includes('only week in this program')) {
    return "That's the only week left — end the program instead if you want to stop it.";
  }
  if (message.includes('Not authorized to modify this program')) {
    return "This program isn't one I can edit — it belongs to a coach.";
  }
  if (message.includes('could not be found') || message.includes('not available')) {
    return "One of those isn't available anymore — ask me to try again.";
  }
  return 'Something went wrong. Try again.';
}

interface StreamResult {
  reply: string;
  recommendations: Recommendation[];
  programAction: ProgramAction | null;
  blocks: ResponseBlock[];
  suggestedReplies: string[];
}

// Real bug found live: detecting SSE by duck-typing `data.body.getReader`
// silently misfires whenever the RN fetch polyfill doesn't expose a real
// streamable body — `looksLikeStream` returned false even for a genuine
// SSE response, so the code fell into the "plain JSON" branch and read
// `.reply`/`.programAction` off a raw Response object (always undefined,
// since Response has no such properties) — a real reply came back every
// time, the client just never looked in the right place for it. The
// Content-Type header is reliable regardless of streaming support, so
// that's the actual signal now.
function isSseResponse(data: unknown): data is Response {
  if (!data || typeof (data as any).headers?.get !== 'function') return false;
  const ct = (data as any).headers.get('content-type') || '';
  return ct.includes('text/event-stream');
}

interface ParsedSseResult {
  final: StreamResult | null;
}

// Parses a full (or partial, if called incrementally with a growing buffer)
// SSE text blob into stage/final/error events, dispatching stages via
// onStage as encountered. Shared by both the real incremental-reader path
// and the whole-text fallback below, so the parsing logic — the actual
// correctness-critical part — exists exactly once.
function consumeSseBuffer(buffer: string, onStage: (s: Stage) => void): { rest: string; final: StreamResult | null } {
  let final: StreamResult | null = null;
  let sep;
  while ((sep = buffer.indexOf('\n\n')) !== -1) {
    const rawEvent = buffer.slice(0, sep);
    buffer = buffer.slice(sep + 2);
    const eventMatch = rawEvent.match(/^event: (.+)$/m);
    const dataMatch = rawEvent.match(/^data: (.+)$/m);
    if (!eventMatch || !dataMatch) continue;
    const parsed = JSON.parse(dataMatch[1]);
    if (eventMatch[1] === 'stage') {
      onStage(parsed as Stage);
    } else if (eventMatch[1] === 'final') {
      final = {
        reply: parsed.reply,
        recommendations: parsed.recommendations ?? [],
        programAction: parsed.programAction ?? null,
        blocks: parsed.blocks ?? [],
        suggestedReplies: parsed.suggestedReplies ?? [],
      };
    } else if (eventMatch[1] === 'error') {
      throw new Error(parsed?.message || 'Coach stream error');
    }
  }
  return { rest: buffer, final };
}

export function CoachScreen({ onBack, initialPrompt }: { onBack: () => void; initialPrompt?: string }) {
  const { profile, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [pendingProgramAction, setPendingProgramAction] = useState<ProgramAction | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'reconnecting'>('online');
  const [rateLimited, setRateLimited] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const STORAGE_KEY = `coach_v15_${profile?.id}`;

  const isDark = mode === 'dark';
  const c = isDark ? COACH_COLORS.dark : COACH_COLORS.light;

  useEffect(() => {
    const init = async () => {
      if (!profile?.id) return;
      await refreshProfile();

      let hadSavedHistory = false;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && saved.startsWith('[')) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            hadSavedHistory = true;
          }
        }
      } catch (e: any) {
        console.warn('Failed to load saved coach messages:', e.message);
      }

      // Set by CoachFab when a starter prompt chip is tapped — sends it as
      // the athlete's first message instead of showing the empty welcome
      // screen. Never overrides a real, already-ongoing conversation.
      if (!hadSavedHistory && initialPrompt) {
        sendMessage(initialPrompt);
      }
    };
    init();
  }, [profile?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Sends the running message history to ai-coach and applies whatever
  // comes back. The function now streams over SSE — event: stage fires as
  // each tool runs (fed into onStage so the activity bubble updates live),
  // then exactly one event: final carries the same shape the client always
  // parsed before streaming existed. An early-exit gate (auth/pro/rate
  // limit) still returns plain JSON, not a stream — handled below by
  // checking whether the response actually has a body reader.
  const callAiCoach = async (history: Message[], onStage: (s: Stage) => void): Promise<StreamResult | null> => {
    const { data, error } = await supabase.functions.invoke('ai-coach', {
      body: { messages: history.map(({ role, content }) => ({ role, content })), platform: Platform.OS },
    });

    if (error) {
      // FunctionsHttpError's `context` is the raw Response object (see
      // @supabase/functions-js) — status is a sync property, but the body
      // (our {error, message} JSON) needs an async read.
      let status = 500;
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        status = error.context.status;
        try {
          const body = await error.context.json();
          code = body?.error;
        } catch {
          // body wasn't JSON — fall through to generic handling below
        }
      }

      if (status === 403 && code === 'PRO_REQUIRED') {
        router.push('/paywall');
        return null;
      }
      if (status === 429 || code === 'RATE_LIMIT') {
        setRateLimited(true);
        return {
          reply: "You've used all your coaching messages for today. Your quota resets at midnight. Rest well, warrior.",
          recommendations: [], programAction: null, blocks: [], suggestedReplies: [],
        };
      }
      console.error('ai-coach Edge Function error:', error);
      throw new Error(error.message || 'Unknown error');
    }

    // Plain JSON path — early-exit gates (kill switch, etc.) never stream.
    if (!isSseResponse(data)) {
      return {
        reply: data?.reply as string,
        recommendations: data?.recommendations ?? [],
        programAction: data?.programAction ?? null,
        blocks: data?.blocks ?? [],
        suggestedReplies: data?.suggestedReplies ?? [],
      };
    }

    // SSE path. Prefer a real incremental reader (live stage updates); if
    // the platform's fetch polyfill doesn't expose one, fall back to
    // reading the whole response as text and parsing every event at once —
    // loses live per-stage updates, but never loses the final payload,
    // which is the actual correctness requirement.
    const canStream = typeof (data as any).body?.getReader === 'function';
    let final: StreamResult | null = null;
    if (canStream) {
      const reader = (data as any).body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const result = consumeSseBuffer(buffer, onStage);
        buffer = result.rest;
        if (result.final) final = result.final;
      }
    } else {
      const text = await data.text();
      final = consumeSseBuffer(text, onStage).final;
    }
    if (!final) throw new Error('Stream ended with no reply.');
    return final;
  };

  const applyResult = (result: StreamResult, fallbackText: string) => {
    setConnectionStatus('online');
    if (result.recommendations.length) setRecommendations(result.recommendations);
    setSuggestedReplies(result.suggestedReplies ?? []);
    // Only REPLACE the card when this turn actually produced a new one.
    // This used to be `?? null`, which meant any ordinary reply — a question,
    // a clarification — silently destroyed a card the athlete had not acted
    // on yet, throwing away a program that took minutes to generate. A card
    // now persists until it is confirmed, ignored, or genuinely superseded.
    if (result.programAction) setPendingProgramAction(result.programAction);
    const reply = result.reply?.trim();
    return { content: reply || fallbackText, blocks: result.blocks } as Message;
  };

  const startSession = async () => {
    if (loading) return;
    setLoading(true);
    setRecommendations([]);
    setStages([]);
    try {
      const result = await callAiCoach(
        [{ role: 'user', content: 'Hi, I want to start working with my AI Coach.' }],
        (s) => setStages((prev) => [...prev, s])
      );
      if (!result) return;
      const msg = applyResult(result, "I'm here, but that first message came back empty. Say hello and I'll pick it up from there.");
      setMessages([{ role: 'assistant', content: msg.content, blocks: msg.blocks }]);
    } catch (error: any) {
      console.error('Coach Session Error:', error);
      setConnectionStatus('offline');
      setMessages([{ role: 'assistant', content: `Coach is temporarily unreachable (${error.message || 'Network failure'}). Please check your connection.` }]);
    } finally {
      setLoading(false);
      setStages([]);
    }
  };

  const sendMessage = async (text?: string) => {
    const finalInput = text || inputText;
    if (!finalInput.trim() || loading) return;

    const now = Date.now();
    const secondsSinceLast = (now - lastMessageTime) / 1000;
    if (secondsSinceLast < 5) {
      Alert.alert('Slow down, Warrior', `Wait ${Math.ceil(5 - secondsSinceLast)} more seconds before sending.`);
      return;
    }

    if (rateLimited) return;

    setLastMessageTime(now);
    const userMsg: Message = { role: 'user', content: finalInput };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setRecommendations([]);
    setSuggestedReplies([]);
    setStages([]);
    // Deliberately NOT clearing pendingProgramAction here. Sending a message
    // is not the same as dismissing a proposal — asking "what's in day 3?"
    // must not throw away a program that took minutes and real money to
    // generate. It clears on confirm, on IGNORE, on chat reset, or when a
    // new proposal genuinely replaces it.
    if (!text) setInputText('');
    setLoading(true);

    try {
      const result = await callAiCoach(newMsgs, (s) => setStages((prev) => [...prev, s]));
      if (!result) return;
      const msg = applyResult(result, 'Something went wrong on my end and that came back empty — ask me again and I\'ll pick it up.');
      setMessages((prev) => [...prev, { role: 'assistant', content: msg.content, blocks: msg.blocks }]);
    } catch (error: any) {
      console.error('Coach Send Error:', error);
      setConnectionStatus('offline');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Coach is temporarily unreachable (${error.message || 'Network failure'}). Check your connection and try again.`,
      }]);
    } finally {
      setLoading(false);
      setStages([]);
    }
  };

  // The only place either write RPC ever actually fires — always from this
  // explicit tap, never from the AI's own judgment mid-conversation. Calls
  // the RPC directly, bypassing the edge function/Claude entirely.
  const handleConfirmProgramAction = async () => {
    if (!pendingProgramAction || confirmingAction) return;
    setConfirmingAction(true);
    try {
      if (pendingProgramAction.type === 'create') {
        if (!pendingProgramAction.payload || !('blocks' in pendingProgramAction.payload)) {
          throw new Error('Nothing to create.');
        }
        const { error } = await supabase.rpc('ai_coach_create_program', {
          p_name: pendingProgramAction.payload.name,
          p_description: pendingProgramAction.payload.description,
          p_blocks: pendingProgramAction.payload.blocks,
        });
        if (error) throw error;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**${pendingProgramAction.payload!.name}** is live — check your Workout Program to see it.`,
        }]);
      } else if (pendingProgramAction.type === 'delete_week') {
        if (!pendingProgramAction.warriorProgramId || pendingProgramAction.weekNumber == null) {
          throw new Error('No week to delete.');
        }
        const { error } = await supabase.rpc('ai_coach_delete_week', {
          p_warrior_program_id: pendingProgramAction.warriorProgramId,
          p_week_number: pendingProgramAction.weekNumber,
        });
        if (error) throw error;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Week ${pendingProgramAction.weekNumber} has been deleted.`,
        }]);
      } else if (pendingProgramAction.type === 'create_from_workouts') {
        if (!pendingProgramAction.payload || !('workoutIds' in pendingProgramAction.payload)) {
          throw new Error('Nothing to create.');
        }
        const { error } = await supabase.rpc('ai_coach_create_program_from_workouts', {
          p_workout_ids: pendingProgramAction.payload.workoutIds,
        });
        if (error) throw error;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**${pendingProgramAction.payload!.name}** is live — check your Workout Program to see it.`,
        }]);
      } else {
        if (!pendingProgramAction.warriorProgramId) throw new Error('No active program to end.');
        const { error } = await supabase.rpc('ai_coach_end_program', {
          p_warrior_program_id: pendingProgramAction.warriorProgramId,
        });
        if (error) throw error;
        setMessages(prev => [...prev, { role: 'assistant', content: 'Your program has been ended.' }]);
      }
      setPendingProgramAction(null);
      await refreshProfile();
    } catch (error: any) {
      Alert.alert('COULD NOT COMPLETE THIS', friendlyActionError(error.message ?? '').toUpperCase());
    } finally {
      setConfirmingAction(false);
    }
  };

  const handleIgnoreProgramAction = () => {
    setPendingProgramAction(null);
  };

  const clearHistory = async () => {
    const performClear = async () => {
      setMessages([]);
      setRecommendations([]);
      setSuggestedReplies([]);
      setPendingProgramAction(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
      startSession();
    };
    if (Platform.OS === 'web') { if (window.confirm('Reset chat?')) performClear(); } else { Alert.alert('Clear?', 'Reset chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: performClear }]); }
  };

  const renderText = (content: string, isUser: boolean) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <Text style={[styles.messageText, { color: isUser ? '#fff' : c.bodyText }]}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={i} style={{ fontWeight: '900', color: isUser ? '#fff' : theme.accent }}>{part.slice(2, -2)}</Text>;
          }
          return part;
        })}
      </Text>
    );
  };

  if (!profile) return null;

  const statusLine = connectionStatus === 'offline' ? 'OFFLINE'
    : connectionStatus === 'reconnecting' ? 'RECONNECTING'
    : loading && stages.length > 0 ? `ONLINE · ${stages[stages.length - 1].verb}`
    : 'ONLINE';

  return (
    <GlobalErrorBoundary>
    <View style={styles.fullscreen}>
      {Platform.OS !== 'web' && <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.card, { backgroundColor: c.screenBg, borderColor: theme.accent + '30' }]}>
          <View style={[styles.header, { borderBottomColor: c.headerDivider }]}>
            <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={c.secondaryText} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={styles.headerTitleRow}>
                <PulsingAvatar accent={theme.accent} />
                <Text style={styles.headerTitle}>LEAP COACH</Text>
              </View>
              <Text style={[styles.headerSub, { color: theme.accent }]}>{statusLine}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={startSession} style={styles.iconBtn}><MaterialCommunityIcons name="refresh" size={20} color={theme.accent} /></TouchableOpacity>
              <TouchableOpacity onPress={clearHistory} style={styles.iconBtn}><MaterialCommunityIcons name="delete-outline" size={20} color={c.secondaryText} /></TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
            {messages.length === 0 && !loading && (
              <View style={styles.welcomeContainer}>
                <MaterialCommunityIcons name="brain" size={40} color={theme.accent} />
                <Text style={[styles.welcomeTitle, { color: c.bodyText }]}>Hi, {profile.display_name || 'Warrior'}</Text>
                <Text style={[styles.welcomeSub, { color: c.secondaryText }]}>Welcome to Coach Leap. How can I help you today?</Text>
                <View style={styles.welcomeOptions}>
                  <TouchableOpacity
                    style={[styles.welcomeOptionCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}
                    onPress={() => sendMessage('Analyze my current performance — give me my onboarding assessment status, current tier, and total points from each world.')}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="chart-line" size={22} color={theme.accent} />
                    <Text style={[styles.welcomeOptionText, { color: c.bodyText }]}>Analyze your performance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.welcomeOptionCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}
                    onPress={() => sendMessage('I want to build a training program.')}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="dumbbell" size={22} color={theme.accent} />
                    <Text style={[styles.welcomeOptionText, { color: c.bodyText }]}>Build you a program</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {messages.map((m, i) => (
              <View key={i} style={[styles.messageRow, m.role === 'user' ? styles.userRow : styles.assistantRow]}>
                {m.role === 'assistant' && (
                  <View style={[styles.avatar, { borderColor: theme.accent }]}>
                    <View style={[styles.avatarDot, { backgroundColor: theme.accent }]} />
                  </View>
                )}
                <View style={[styles.bubble, m.role === 'user'
                  ? [styles.userBubble, { backgroundColor: theme.accent }]
                  : [styles.assistantBubble, { backgroundColor: c.bubbleBg, borderColor: c.bubbleBorder }]]}
                >
                  {renderText(m.content, m.role === 'user')}
                  {m.role === 'assistant' && m.blocks?.map((b, bi) => (
                    <ResponseBlockView key={bi} block={b} accent={theme.accent} colors={c} />
                  ))}
                </View>
              </View>
            ))}

            {loading && (
              <View style={[styles.messageRow, styles.assistantRow]}>
                <View style={[styles.avatar, { borderColor: theme.accent }]}>
                  <View style={[styles.avatarDot, { backgroundColor: theme.accent }]} />
                </View>
                {stages.length > 0 ? (
                  <ActivityBubble stages={stages} accent={theme.accent} colors={c} />
                ) : (
                  <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.bubbleBg, borderColor: c.bubbleBorder }]}>
                    <WaveLoadingIndicator accent={theme.accent} colors={c} />
                  </View>
                )}
              </View>
            )}

            {recommendations.map((rec, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.recommendationCard, { borderColor: c.cardBorder, backgroundColor: c.cardBg }]}
                onPress={() => router.push(RECOMMENDATION_ROUTES[rec.world] as never)}
              >
                <MaterialCommunityIcons name="arm-flex" size={18} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recommendationLabel, { color: theme.accent }]}>{RECOMMENDATION_LABELS[rec.world]}</Text>
                  <Text style={[styles.recommendationReason, { color: c.secondaryText }]}>{rec.reason}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.accent} />
              </TouchableOpacity>
            ))}

            {pendingProgramAction && (
              <View style={[styles.actionCard, { borderColor: c.cardBorder, backgroundColor: c.cardBg }]}>
                <View style={styles.actionCardHeader}>
                  <MaterialCommunityIcons
                    name={
                      pendingProgramAction.type === 'create' || pendingProgramAction.type === 'create_from_workouts'
                        ? 'swap-horizontal'
                        : pendingProgramAction.type === 'delete_week'
                        ? 'trash-can-outline'
                        : 'close-circle-outline'
                    }
                    size={18}
                    color={theme.accent}
                  />
                  <Text style={[styles.actionCardTitle, { color: '#fff' }]}>
                    {pendingProgramAction.type === 'create' || pendingProgramAction.type === 'create_from_workouts'
                      ? `Start "${pendingProgramAction.payload?.name}"?`
                      : pendingProgramAction.type === 'delete_week'
                      ? `Delete Week ${pendingProgramAction.weekNumber}?`
                      : 'End your current program?'}
                  </Text>
                </View>
                <Text style={[styles.actionCardReason, { color: c.secondaryText }]}>{pendingProgramAction.reason}</Text>
                {pendingProgramAction.type === 'create_from_workouts' && pendingProgramAction.payload && 'dayTitles' in pendingProgramAction.payload && (
                  <View style={styles.actionCardDayList}>
                    {pendingProgramAction.payload.dayTitles.map((title, i) => (
                      <Text key={i} style={[styles.actionCardDayItem, { color: c.secondaryText }]}>
                        Day {i + 1}: {title}
                      </Text>
                    ))}
                  </View>
                )}
                {(pendingProgramAction.type === 'create' || pendingProgramAction.type === 'create_from_workouts') && pendingProgramAction.warriorProgramId && !pendingProgramAction.currentProgramIsAiOwned && (
                  <Text style={styles.actionCardWarning}>⚠️ This is currently a program your coach assigned.</Text>
                )}
                <View style={styles.actionCardButtons}>
                  <TouchableOpacity
                    style={[styles.actionCardIgnoreBtn, { borderColor: c.secondaryText + '40' }]}
                    onPress={handleIgnoreProgramAction}
                    disabled={confirmingAction}
                  >
                    <Text style={[styles.actionCardIgnoreText, { color: c.secondaryText }]}>IGNORE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionCardConfirmBtn, { backgroundColor: theme.accent, opacity: confirmingAction ? 0.6 : 1 }]}
                    onPress={handleConfirmProgramAction}
                    disabled={confirmingAction}
                  >
                    {confirmingAction ? (
                      <LeapLogo size={20} animated />
                    ) : (
                      <Text style={styles.actionCardConfirmText}>
                        {pendingProgramAction.type === 'create' || pendingProgramAction.type === 'create_from_workouts'
                          ? 'START PROGRAM'
                          : pendingProgramAction.type === 'delete_week'
                          ? 'DELETE WEEK'
                          : 'END PROGRAM'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          {!rateLimited ? (
            <View style={[styles.chipsWrap, { borderTopColor: c.headerDivider }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {(suggestedReplies.length > 0 ? suggestedReplies : []).map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, { borderColor: c.chipBorder }]}
                    onPress={() => sendMessage(q)}
                    disabled={loading}
                  >
                    <Text style={[styles.chipText, { color: theme.accent }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.quotaExhausted, { backgroundColor: c.cardBg, borderTopColor: c.headerDivider }]}>
              <Text style={[styles.quotaExhaustedText, { color: c.secondaryText }]}>
                🏛️ Daily sessions exhausted — resets at midnight
              </Text>
            </View>
          )}

          <View style={[styles.inputContainer, { borderTopColor: c.headerDivider }]}>
            <TextInput
              style={[styles.input, { color: c.bodyText, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask your coach"
              placeholderTextColor={c.faint}
              multiline
              editable={!rateLimited}
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={loading || !inputText.trim() || rateLimited}
              style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: (loading || rateLimited) ? 0.5 : 1 }]}
            >
              <MaterialCommunityIcons name={inputText.trim() ? 'send' : 'microphone'} size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
    </GlobalErrorBoundary>
  );
}

// Design handoff §1 "Coach avatar mark" — 1.5pt coral ring + solid center
// dot, pulses scale 1.0→1.12 / opacity 0.9→0.45, 2.4s ease-in-out loop.
// Same technique as HighlightRing.tsx (opacity+scale off one shared driver)
// — this app's only existing pulsing-ring precedent.
function PulsingAvatar({ accent }: { accent: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] });
  return (
    <View style={avatarStyles.wrap}>
      <Animated.View style={[avatarStyles.ring, { borderColor: accent, transform: [{ scale }], opacity }]} />
      <View style={[avatarStyles.dot, { backgroundColor: accent }]} />
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  wrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// Same 4-bar waveform motif as CoachFab.tsx's collapsed button (shared
// family per the design handoff) — recolored from white to the accent
// color since this sits on the bubble's neutral background, not on a
// solid coral fill.
function WaveLoadingIndicator({ accent, colors }: { accent: string; colors: CoachPalette }) {
  const wave = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = wave.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={waveStyles.row}>
      {wave.map((v, i) => (
        <Animated.View
          key={i}
          style={[waveStyles.bar, { backgroundColor: accent, height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 16] }) }]}
        />
      ))}
      <Text style={[waveStyles.label, { color: colors.secondaryText }]}>LEAPING</Text>
    </View>
  );
}

const waveStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2 },
  bar: { width: 3, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginLeft: 8 },
});

const styles = StyleSheet.create({
  fullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 99999, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { width: '100%', maxWidth: 480, height: '85%' },
  card: { flex: 1, borderRadius: 28, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 25 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  messageRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'flex-end', gap: 10 },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  avatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarDot: { width: 8, height: 8, borderRadius: 4 },
  bubble: { paddingHorizontal: 15, paddingVertical: 13, borderRadius: 16, maxWidth: '85%' },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  // Handoff spec's fontWeight:300 read faint/blurry on real devices at this
  // size (hex contrast was fine on paper, thin system-font strokes weren't
  // legible in practice) — bumped to a normal weight for real legibility.
  messageText: { fontSize: 14.5, lineHeight: 22, fontWeight: '400' },
  inputContainer: { flexDirection: 'row', padding: 16, alignItems: 'flex-end', borderTopWidth: 1, gap: 10 },
  input: { flex: 1, minHeight: 46, maxHeight: 120, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, borderRadius: 23, borderWidth: 1 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 15, fontWeight: '600', letterSpacing: 2.4, color: '#fff' },
  headerSub: { fontSize: 9.5, fontWeight: '500', letterSpacing: 1.6, marginTop: 2, textTransform: 'uppercase' },
  welcomeContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: '900', marginTop: 16 },
  welcomeSub: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  welcomeOptions: { width: '100%', gap: 12 },
  welcomeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
  },
  welcomeOptionText: { fontSize: 14.5, fontWeight: '600' },
  chipsWrap: {
    borderTopWidth: 0.5,
    paddingVertical: 10,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  recommendationLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  recommendationReason: {
    fontSize: 11,
    marginTop: 2,
  },
  actionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
    gap: 8,
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  actionCardReason: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionCardWarning: {
    fontSize: 12,
    color: '#E8A33D',
    lineHeight: 17,
  },
  actionCardDayList: {
    gap: 2,
  },
  actionCardDayItem: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionCardButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionCardIgnoreBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardIgnoreText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionCardConfirmBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardConfirmText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  quotaExhausted: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    alignItems: 'center',
  },
  quotaExhaustedText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});

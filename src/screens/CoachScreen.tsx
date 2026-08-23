// AI Coach — Claude-powered, tool-use backed (supabase/functions/ai-coach).
// The system prompt and per-request context (tier, PBs, program, logs) all
// live server-side now — this screen just relays the conversation and
// renders the reply, same shell as before.
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
  Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES } from '../types';
import { LeapLogo } from '../components/LeapLogo';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/functions-js';

const SUGGESTED_QUESTIONS = [
  'I want to build a training program',
  'How am I doing this week?',
  'Am I ready to test for my next tier?',
  'This exercise is bothering my shoulder, can we swap it?',
  'What is my biggest weakness right now?',
  'How do I reach the next tier?',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Recommendation {
  world: 'strength_trial' | 'power' | 'static' | 'one_min_max';
  reason: string;
}

// Mirrors the shape ai-coach's index.ts builds from a propose_new_program/
// propose_end_program/propose_delete_week tool call. None of these ever
// write anything server-side — the actual RPC only fires from
// handleConfirmProgramAction below, gated on an explicit tap, never from
// the AI's own judgment mid-conversation.
interface ProgramAction {
  type: 'create' | 'end' | 'delete_week';
  reason: string;
  payload: { name: string; description: string; blocks: unknown[] } | null;
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

export function CoachScreen({ onBack }: { onBack: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [pendingProgramAction, setPendingProgramAction] = useState<ProgramAction | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const STORAGE_KEY = `coach_v15_${profile?.id}`;

  const isDark = mode === 'dark';
  const cardBg = isDark ? '#0A0A0A' : '#FFFFFF';
  const bubbleBg = isDark ? '#161616' : '#F5F5F5';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const subtextColor = isDark ? '#666666' : '#999999';

  useEffect(() => {
    const init = async () => {
      if (!profile?.id) return;
      await refreshProfile();

      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && saved.startsWith('[')) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
          }
        }
      } catch (e: any) {
        console.warn('Failed to load saved coach messages:', e.message);
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
  // comes back (reply text + any recommend_test signals). Both
  // startSession (empty history, a canned opener) and sendMessage (history
  // + the new user turn) funnel through this — the server owns the system
  // prompt and all tool-use turns; the client only ever sees the final text.
  const callAiCoach = async (history: Message[]) => {
    const { data, error } = await supabase.functions.invoke('ai-coach', {
      body: { messages: history, platform: Platform.OS },
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
        return { content: "You've used all your coaching messages for today. Your quota resets at midnight. Rest well, warrior." };
      }
      console.error('ai-coach Edge Function error:', error);
      throw new Error(error.message || 'Unknown error');
    }

    if (data?.recommendations?.length) {
      setRecommendations(data.recommendations);
    }
    // Only REPLACE the card when this turn actually produced a new one.
    // This used to be `?? null`, which meant any ordinary reply — a question,
    // a clarification — silently destroyed a card the athlete had not acted
    // on yet, throwing away a program that took minutes to generate. A card
    // now persists until it is confirmed, ignored, or genuinely superseded.
    if (data?.programAction) setPendingProgramAction(data.programAction as ProgramAction);
    return { content: data?.reply as string };
  };

  const startSession = async () => {
    if (loading) return;
    setLoading(true);
    setRecommendations([]);
    try {
      const result = await callAiCoach([{ role: 'user', content: 'Hi, I want to start working with my AI Coach.' }]);
      // Same no-silent-drop rule as sendMessage — an empty reply here would
      // otherwise open the coach to a completely blank screen.
      const reply = result?.content?.trim();
      setMessages([{
        role: 'assistant',
        content: reply || "I'm here, but that first message came back empty. Say hello and I'll pick it up from there.",
      }]);
    } catch (error: any) {
      console.error('Coach Session Error:', error);
      setMessages([{ role: 'assistant', content: `Coach is temporarily unreachable (${error.message || 'Network failure'}). Please check your connection.` }]);
    } finally {
      setLoading(false);
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
    // Deliberately NOT clearing pendingProgramAction here. Sending a message
    // is not the same as dismissing a proposal — asking "what's in day 3?"
    // must not throw away a program that took minutes and real money to
    // generate. It clears on confirm, on IGNORE, on chat reset, or when a
    // new proposal genuinely replaces it.
    if (!text) setInputText('');
    setLoading(true);

    try {
      const result = await callAiCoach(newMsgs);
      // Never drop a turn silently. An empty reply used to fall through this
      // check and render nothing at all — no bubble, no error — after the
      // athlete had already waited through a long generation. Whatever the
      // cause, they get something they can act on.
      const reply = result?.content?.trim();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply || "Something went wrong on my end and that came back empty — ask me again and I'll pick it up.",
      }]);
    } catch (error: any) {
      console.error('Coach Send Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Coach is temporarily unreachable (${error.message || 'Network failure'}). Check your connection and try again.`,
      }]);
    } finally {
      setLoading(false);
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
        if (!pendingProgramAction.payload) throw new Error('Nothing to create.');
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
      Alert.alert('COULD NOT COMPLETE THIS', error.message?.toUpperCase() || 'SOMETHING WENT WRONG. TRY AGAIN.');
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
      setPendingProgramAction(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
      startSession();
    };
    if (Platform.OS === 'web') { if (window.confirm('Reset chat?')) performClear(); } else { Alert.alert('Clear?', 'Reset chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: performClear }]); }
  };

  const renderText = (content: string, isUser: boolean) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
      <Text style={[styles.messageText, { color: isUser ? '#000' : textColor }]}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={i} style={{ fontWeight: '900', color: isUser ? '#000' : theme.accent }}>{part.slice(2, -2)}</Text>;
          }
          return part;
        })}
      </Text>
    );
  };

  if (!profile) return null;

  return (
    <GlobalErrorBoundary>
    <View style={styles.fullscreen}>
      {Platform.OS !== 'web' && <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.accent + '30' }]}>
          <View style={[styles.header, { borderBottomColor: theme.accent + '20' }]}>
            <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
              <MaterialCommunityIcons name="close" size={22} color={subtextColor} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: textColor }]}>⚔️ AI COACH</Text>
              <Text style={[styles.headerSub, { color: subtextColor }]}>
                {TIER_NAMES[profile?.strength_tier || 0]} · Your Program
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={startSession} style={styles.iconBtn}><MaterialCommunityIcons name="refresh" size={20} color={theme.accent} /></TouchableOpacity>
              <TouchableOpacity onPress={clearHistory} style={styles.iconBtn}><MaterialCommunityIcons name="delete-outline" size={20} color={subtextColor} /></TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
            {messages.length === 0 && (
              <View style={styles.welcomeContainer}>
                <MaterialCommunityIcons name="brain" size={48} color={theme.accent} />
                <Text style={[styles.welcomeTitle, { color: textColor }]}>AI Coach</Text>
                <Text style={[styles.welcomeSub, { color: subtextColor }]}>Build a program, review your week, or ask anything.</Text>
                <TouchableOpacity
                  style={[styles.beginBtn, { backgroundColor: theme.accent }]}
                  onPress={startSession}
                  disabled={loading}
                >
                  {loading ? <LeapLogo size={40} animated /> : <Text style={styles.beginBtnText}>START COACHING</Text>}
                </TouchableOpacity>
              </View>
            )}

            {messages.length === 0 && loading ? (
              <View style={styles.loadingState}>
                <LeapLogo size={40} animated />
                <Text style={[styles.loadingText, { color: subtextColor }]}>CONNECTING...</Text>
              </View>
            ) : (
              messages.map((m, i) => (
                <View key={i} style={[styles.messageRow, m.role === 'user' ? styles.userRow : styles.assistantRow]}>
                  {m.role === 'assistant' && (
                    <View style={[styles.avatar, { backgroundColor: theme.accent + '15' }]}><MaterialCommunityIcons name="brain" size={16} color={theme.accent} /></View>
                  )}
                  <View style={[styles.bubble, m.role === 'user' ? [styles.userBubble, { backgroundColor: theme.accent }] : [styles.assistantBubble, { backgroundColor: bubbleBg }]]}>
                    {renderText(m.content, m.role === 'user')}
                  </View>
                </View>
              ))
            )}

            {recommendations.map((rec, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.recommendationCard, { borderColor: theme.accent + '50', backgroundColor: cardBg }]}
                onPress={() => router.push(RECOMMENDATION_ROUTES[rec.world] as never)}
              >
                <MaterialCommunityIcons name="arm-flex" size={18} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recommendationLabel, { color: theme.accent }]}>{RECOMMENDATION_LABELS[rec.world]}</Text>
                  <Text style={[styles.recommendationReason, { color: subtextColor }]}>{rec.reason}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={subtextColor} />
              </TouchableOpacity>
            ))}

            {pendingProgramAction && (
              <View style={[styles.actionCard, { borderColor: theme.accent + '50', backgroundColor: cardBg }]}>
                <View style={styles.actionCardHeader}>
                  <MaterialCommunityIcons
                    name={
                      pendingProgramAction.type === 'create'
                        ? 'swap-horizontal'
                        : pendingProgramAction.type === 'delete_week'
                        ? 'trash-can-outline'
                        : 'close-circle-outline'
                    }
                    size={18}
                    color={theme.accent}
                  />
                  <Text style={[styles.actionCardTitle, { color: textColor }]}>
                    {pendingProgramAction.type === 'create'
                      ? `Start "${pendingProgramAction.payload?.name}"?`
                      : pendingProgramAction.type === 'delete_week'
                      ? `Delete Week ${pendingProgramAction.weekNumber}?`
                      : 'End your current program?'}
                  </Text>
                </View>
                <Text style={[styles.actionCardReason, { color: subtextColor }]}>{pendingProgramAction.reason}</Text>
                {pendingProgramAction.type === 'create' && pendingProgramAction.warriorProgramId && !pendingProgramAction.currentProgramIsAiOwned && (
                  <Text style={styles.actionCardWarning}>⚠️ This is currently a program your coach assigned.</Text>
                )}
                <View style={styles.actionCardButtons}>
                  <TouchableOpacity
                    style={[styles.actionCardIgnoreBtn, { borderColor: subtextColor + '40' }]}
                    onPress={handleIgnoreProgramAction}
                    disabled={confirmingAction}
                  >
                    <Text style={[styles.actionCardIgnoreText, { color: subtextColor }]}>IGNORE</Text>
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
                        {pendingProgramAction.type === 'create'
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
            <View style={[styles.chipsWrap, { borderTopColor: theme.accent + '20' }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, {
                      borderColor: `${theme.accent}50`,
                      backgroundColor: cardBg,
                    }]}
                    onPress={() => sendMessage(q)}
                    disabled={loading}
                  >
                    <Text style={[styles.chipText, { color: theme.accent }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.quotaExhausted, {
              backgroundColor: isDark ? '#111' : '#F5F5F5',
              borderTopColor: theme.accent + '20',
            }]}>
              <Text style={[styles.quotaExhaustedText, { color: subtextColor }]}>
                🏛️ Daily sessions exhausted — resets at midnight
              </Text>
            </View>
          )}

          <View style={[styles.inputContainer, { borderTopColor: theme.accent + '15', backgroundColor: isDark ? '#0D0D0D' : '#F9F9F9' }]}>
            <TextInput
              style={[styles.input, { color: textColor }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask your coach anything..."
              placeholderTextColor={subtextColor}
              multiline
              editable={!rateLimited}
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={loading || !inputText.trim() || rateLimited}
              style={[styles.sendBtn, { backgroundColor: (inputText.trim() && !rateLimited) ? theme.accent : (isDark ? '#1A1A1A' : '#EEE') }]}
            >
              {loading ? <LeapLogo size={40} animated /> : <MaterialCommunityIcons name="send" size={18} color="#000" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 99999, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { width: '100%', maxWidth: 480, height: '85%' },
  card: { flex: 1, borderRadius: 28, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 25 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  headerText: { fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  iconBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  messageRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'flex-end', gap: 10 },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, maxWidth: '85%' },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
  messageText: { fontSize: 14, lineHeight: 22 },
  inputContainer: { flexDirection: 'row', padding: 16, alignItems: 'flex-end', borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  loadingText: { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 20 },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  headerSub: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  quotaText: { fontSize: 10, fontWeight: '500', marginTop: 2, letterSpacing: 0.3 },
  welcomeContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  welcomeTitle: { fontSize: 24, fontWeight: '900', marginTop: 16 },
  welcomeSub: { fontSize: 14, textAlign: 'center', marginTop: 8, opacity: 0.7, marginBottom: 20 },
  beginBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 10,
  },
  beginBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
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
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
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

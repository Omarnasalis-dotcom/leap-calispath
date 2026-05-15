// AI Coach - Gemini enabled
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES } from '../types';
import { LeaderboardService } from '../services/LeaderboardService';

import { RITES_OF_PASSAGE } from '../lib/trials';

const GEMINI_KEY = (process.env['EXPO_PUBLIC_GEMINI_KEY'] || '').trim();
const GEMINI_MODEL = 'gemini-2.0-flash-lite'; 

function buildSystemPrompt(profile: any): string {
  const tierName = TIER_NAMES[profile.strength_tier] || 'Unknown';
  const trialsRate = profile.trials_attempted > 0
    ? Math.round((profile.trials_passed / profile.trials_attempted) * 100)
    : 0;

  return `You are the Leap Arena Warrior Coach. You analyze calisthenics performance data and give sharp, specific, actionable advice. You speak like a disciplined Spartan commander — direct, honest, no fluff.

WARRIOR DATA:
- Name: ${profile.display_name || 'Warrior'}
- Strength Tier: ${profile.strength_tier} (${tierName})
- Glory Score: ${profile.glory_score || 0}
- Clash Win Streak: ${profile.clash_win_streak || 0}
- Trials: ${profile.trials_passed || 0} passed / ${profile.trials_attempted || 0} attempted (${trialsRate}% pass rate)
- Power Points: ${profile.power_points || 0}
- 1MM Points: ${profile.one_mm_points || 0}
- Power World: ${(profile.strength_tier || 0) >= 6 ? 'Unlocked' : `Locked — needs Tier 6, at Tier ${profile.strength_tier}`}
${(() => {
  const nextTier = (profile.strength_tier || 0) + 1;
  const trial = RITES_OF_PASSAGE.find(t => t.tier === nextTier);
  if (!trial) return '';
  return `\nNEXT RITE OF PASSAGE (Tier ${nextTier} requirements):\n${trial.movements.map((m: any) => `- ${m.name}: ${m.reps} reps`).join('\n')}`;
})()}

STRICT RULES — follow every one:
1. NEVER repeat the warrior's stats back to them unless they ask
2. NEVER use markdown headers (###), bullet asterisks, or bold (**text**)
3. Keep every response under 120 words — no exceptions
4. Always end with ONE specific action they can do today
5. If the question is vague, ask ONE clarifying question instead of guessing
6. If they greet you (hi, hello, hey), respond in maximum 2 sentences and ask what they need
7. Never repeat advice you already gave in this conversation
8. If a question is not about their training or performance, reply: "I only analyze warrior performance. Ask me about your training, tiers, clashes, or scores."
9. Tier names for reference: Helot(0) Iron-Bound(1) Steel-Wrought(2) Bronze-Clad(3) Silver-Will(4) Gold-Soul(5) Platinum-Heart(6) Obsidian-Core(7) Eternity(8)`;
}

const SUGGESTED_QUESTIONS = [
  'What is my biggest weakness right now?',
  'How do I reach the next tier?',
  'Why am I losing clashes?',
  'What should I focus on this week?',
  'How close am I to unlocking Power World?',
  'What does my pass rate tell you?',
];


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const DAILY_LIMIT = 10;

async function getDailyUsage(userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `coach_usage_${userId}_${today}`;
  const val = await AsyncStorage.getItem(key);
  return val ? parseInt(val) : 0;
}

async function incrementDailyUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `coach_usage_${userId}_${today}`;
  const current = await getDailyUsage(userId);
  await AsyncStorage.setItem(key, String(current + 1));
}

export function CoachScreen({ onBack }: { onBack: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyUsage, setDailyUsage] = useState(0);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [globalRank, setGlobalRank] = useState<number | string>('--');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    async function loadUsage() {
      if (!user?.id) return;
      const count = await getDailyUsage(user.id);
      setDailyUsage(count);
    }
    loadUsage();
  }, [user?.id]);



  const STORAGE_KEY = `coach_v14_${profile?.id}`;

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
        const lb = await LeaderboardService.getGlobalWellRoundedLeaderboard(user?.id);
        const me = lb.find(e => e.user_id === user?.id);
        if (me) setGlobalRank(me.rank);
      } catch (e) { console.error(e); }

      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && saved.startsWith('[')) {
          setMessages(JSON.parse(saved));
        } else {
          startSession();
        }
      } catch (e) { startSession(); }
    };
    init();
  }, [profile?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const startSession = async () => {
    if (loading) return;
    setLoading(true);

    const context = `User: ${profile?.display_name || 'Warrior'}. Stats: Tier ${profile?.strength_tier}, Rank ${globalRank}, Power ${profile?.power_points}, Static ${profile?.statics_tier}, 1MM ${profile?.one_mm_points}.`;
    
    if (!GEMINI_KEY || GEMINI_KEY === 'placeholder-key') {
      setMessages([{ role: 'assistant', content: `Greetings, ${profile?.display_name || 'Warrior'}. I am your Arena Mentor. How can I guide you today? Would you like a quick report on your profile?` }]);
      setLoading(false);
      return;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1alpha/models/${GEMINI_MODEL}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildSystemPrompt(profile) }]
          },
          contents: [],
          generationConfig: {
            maxOutputTokens: 200
          }
        })
      });
      
      if (!response.ok) {
        setMessages([{ role: 'assistant', content: "Arena wisdom is flickering. Please check your connection." }]);
        return;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        setMessages([{ role: 'assistant', content: text }]);
      } else {
        throw new Error('No text in response');
      }
    } catch (error: any) {
      console.error('Coach Session Error:', error);
      setMessages([{ role: 'assistant', content: "Arena wisdom is flickering. Please check your connection." }]);
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

    const usage = await getDailyUsage(user!.id);
    if (usage >= DAILY_LIMIT) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `You have used all ${DAILY_LIMIT} coaching messages for today. Your quota resets at midnight. Rest well, warrior. 🏛️`,
      }]);
      setLoading(false);
      return;
    }

    setLastMessageTime(now);
    const userMsg: Message = { role: 'user', content: finalInput };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    if (!text) setInputText('');
    setLoading(true);

    const context = `User: ${profile?.display_name || 'Warrior'}. Stats: Tier ${profile?.strength_tier}, Rank ${globalRank}, Power ${profile?.power_points}, Static ${profile?.statics_tier}, 1MM ${profile?.one_mm_points}.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1alpha/models/${GEMINI_MODEL}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildSystemPrompt(profile) }]
          },
          contents: newMsgs.slice(-6).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            maxOutputTokens: 200
          }
        })
      });
      
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorCode = errorBody?.error?.code;
        const errorMessage = errorBody?.error?.message || '';

        if (errorCode === 403 || errorMessage.toLowerCase().includes('quota')) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'The coach is resting — daily training limit reached. Come back tomorrow for more wisdom, warrior. 🏛️',
          }]);
        } else if (errorCode === 429) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'The coach is resting — daily training limit reached. Come back tomorrow for more wisdom, warrior. 🏛️',
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Coach is temporarily unreachable. Check your connection and try again.',
          }]);
        }
        return;
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        setMessages(prev => [...prev, { role: 'assistant', content: textResponse }]);
        await incrementDailyUsage(user!.id);
        setDailyUsage(prev => prev + 1);
      } else {
        throw new Error('Empty response from Gemini');
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Coach is temporarily unreachable. Check your connection and try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    const performClear = async () => {
      setMessages([]);
      await AsyncStorage.removeItem(STORAGE_KEY);
      startSession();
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Clear history?')) await performClear();
    } else {
      Alert.alert('Clear?', 'Reset chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: performClear }]);
    }
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
    <View style={styles.fullscreen}>
      {Platform.OS !== 'web' && <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.accent + '30' }]}>
          <View style={[styles.header, { borderBottomColor: theme.accent + '20' }]}>
            <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
              <MaterialCommunityIcons name="close" size={22} color={subtextColor} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: textColor }]}>⚔️ WARRIOR COACH</Text>
              <Text style={[styles.headerSub, { color: subtextColor }]}>
                AI · {TIER_NAMES[profile?.strength_tier || 0]} Analysis
              </Text>
              <Text style={[styles.quotaText, {
                color: dailyUsage >= DAILY_LIMIT
                  ? '#A32D2D'
                  : dailyUsage >= DAILY_LIMIT - 3
                  ? '#854F0B'
                  : subtextColor
              }]}>
                {DAILY_LIMIT - dailyUsage}/{DAILY_LIMIT} sessions today
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
                <Text style={[styles.welcomeTitle, { color: textColor }]}>Arena Mentor</Text>
                <Text style={[styles.welcomeSub, { color: subtextColor }]}>Analyze your performance or plan your next tier-up.</Text>
              </View>
            )}

            {messages.length === 0 && loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={theme.accent} size="large" />
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
          </ScrollView>

          {dailyUsage < DAILY_LIMIT ? (
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
              placeholder={`Speak, Warrior... (${DAILY_LIMIT} sessions/day)`} 
              placeholderTextColor={subtextColor} 
              multiline 
              editable={dailyUsage < DAILY_LIMIT}
            />
            <TouchableOpacity 
              onPress={() => sendMessage()} 
              disabled={loading || !inputText.trim() || dailyUsage >= DAILY_LIMIT} 
              style={[styles.sendBtn, { backgroundColor: (inputText.trim() && dailyUsage < DAILY_LIMIT) ? theme.accent : (isDark ? '#1A1A1A' : '#EEE') }]}
            >
              {loading ? <ActivityIndicator color="#000" size="small" /> : <MaterialCommunityIcons name="send" size={18} color="#000" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
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
  welcomeSub: { fontSize: 14, textAlign: 'center', marginTop: 8, opacity: 0.7 },
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

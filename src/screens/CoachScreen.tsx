// AI Coach - Gemini enabled
import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useRef, useEffect } from 'react';
import { View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { TIER_NAMES } from '../types';
import { LeaderboardService } from '../services/LeaderboardService';

import { RITES_OF_PASSAGE } from '../lib/trials';
import { LeapLogo } from '../components/LeapLogo';


const GEMINI_KEY = (process.env['EXPO_PUBLIC_GEMINI_KEY'] || '').trim();
const GEMINI_MODEL = 'gemini-flash-lite-latest'; 

function getTierCapability(tier: number): string {
  switch (tier || 0) {
    case 0: return "Beginner. Cannot perform full push-ups or pull-ups yet. Must focus on foundational strength like knee push-ups, dead hangs, and bodyweight rows.";
    case 1: return "Novice. Can perform basic push-ups and a few pull-ups. Building foundational endurance.";
    case 2: return "Intermediate. Solid at basic calisthenics (push-ups, pull-ups, dips). Exploring advanced basics.";
    case 3: return "Advanced Intermediate. High rep endurance on basics. Beginning to train for the muscle-up.";
    case 4: return "Advanced. Has achieved the muscle-up. Working on strict form and heavier weighted basics.";
    case 5: return "Elite. Mastered muscle-ups and heavy weighted calisthenics. Entering high-level statics.";
    case 6: return "Master. Exceptional power and static control. Fully unlocked Power World.";
    case 7: return "Grandmaster. Elite level across all disciplines.";
    case 8: return "Eternity. Peak human calisthenics performance.";
    default: return "Capabilities unknown.";
  }
}

function buildSystemPrompt(profile: any): string {
  const tierName = TIER_NAMES[profile.strength_tier] || 'Unknown';
  const trialsRate = profile.trials_attempted > 0
    ? Math.round((profile.trials_passed / profile.trials_attempted) * 100)
    : 0;

  return `You are the elite Leap Arena Mentor. You analyze calisthenics data and give sharp, specific, and direct advice. You use "tough love" to push the warrior to excellence, but you NEVER insult, demean, or call them names (no words like coward, peasant, or disgrace).

ARENA KNOWLEDGE (HOW IT WORKS):
- The Arena has 3 Main Worlds: 
  1. Power World (Grants Power Points based on weighted calisthenics).
  2. Static World (Grants Static Points/Tier based on holds like planche and front lever).
  3. 1MM (1-Minute Max reps).
- Global Rank is the ultimate leaderboard. A warrior climbs the Global Rank by accumulating points across all 3 worlds, plus Glory Score from winning Clashes.

WARRIOR DATA:
- Name: ${profile.display_name || 'Warrior'}
- Strength Tier: ${profile.strength_tier} (${tierName})
- Capability Profile: ${getTierCapability(profile.strength_tier)}
- Glory Score: ${profile.glory_score || 0}
- Clash Win Streak: ${profile.clash_win_streak || 0}
- Trials: ${profile.trials_passed || 0} passed / ${profile.trials_attempted || 0} attempted (${trialsRate}% pass rate)
- Power Points: ${profile.power_points || 0}
- Static Points: ${profile.statics_tier || 0}
- 1MM Points: ${profile.one_mm_points || 0}
- Power World: ${(profile.strength_tier || 0) >= 6 ? 'Unlocked' : `Locked — needs Tier 6, at Tier ${profile.strength_tier}`}
${(() => {
  const nextTier = (profile.strength_tier || 0) + 1;
  const trial = RITES_OF_PASSAGE.find(t => t.tier === nextTier);
  if (!trial) return '';
  return `- Next Tier Requirement (Tier ${nextTier} Trial): ${trial.movements.map((m: any) => `${m.reps}x ${m.name}`).join(', ')}`;
})()}

STRICT RULES:
1. Keep every response under 60 words. Speak in short, punchy sentences. Do not over-explain. Say only what is absolutely necessary.
2. NEVER use markdown headers, bullet asterisks, or bold text.
3. If they ask about their stats, give them the numbers plainly and cleanly. Do not lecture them for asking.
4. Do not fixate on the same weakness (like a low pass rate) in every response. Address it once, then focus on growth.
5. ONLY give a specific training suggestion or tip if they are asking for workout advice or struggling with a movement. Do NOT give unprompted workout advice if they are just saying thank you or making casual conversation.
6. If the question is vague, ask ONE clarifying question instead of guessing.
7. If they greet you or say thank you, acknowledge it in ONE sentence and say nothing else.
8. If a question is not about their training, tiers, clashes, or scores, reply: "I only analyze warrior performance. Ask me about the Arena."
9. If they accomplish a milestone (like passing a trial), show genuine, motivating pride. If they fail, give an honest, analytical breakdown of why they failed and encourage them to retest.`;
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
  const d = new Date();
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const key = `coach_usage_${userId}_${today}`;
  const val = await AsyncStorage.getItem(key);
  return val ? parseInt(val) : 0;
}

async function incrementDailyUsage(userId: string): Promise<void> {
  const d = new Date();
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
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
        }
      } catch (e) { }
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
    
    if (!GEMINI_KEY || GEMINI_KEY === 'placeholder-key') {
      setMessages([{ role: 'assistant', content: `Greetings, ${profile?.display_name || 'Warrior'}. I am your Arena Mentor. How can I guide you today? Would you like a quick report on your profile?` }]);
      setLoading(false);
      return;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `INSTRUCTIONS: ${buildSystemPrompt(profile)}` }] },
            { role: 'model', parts: [{ text: 'Understood. I am the Leap Arena Mentor. Speak, Warrior.' }] },
            { role: 'user', parts: [{ text: 'Begin session' }] }
          ],
          generationConfig: { 
            maxOutputTokens: 150,
            temperature: 0.7
          }
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Gemini API Error:', errData);
        const status = response.status;
        if (status === 429 || status === 403) {
          setMessages([{ role: 'assistant', content: "The Arena is currently over-taxed (System Quota reached). The Mentor will return shortly. 🏛️" }]);
        } else {
          const errMsg = errData?.error?.message || `Status ${status}`;
          setMessages([{ role: 'assistant', content: `Arena wisdom is flickering (Error: ${errMsg}). Please check your connection.` }]);
        }
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

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: (() => {
            const systemMsg = { role: 'user', parts: [{ text: `INSTRUCTIONS: ${buildSystemPrompt(profile)}` }] };
            const ackMsg = { role: 'model', parts: [{ text: 'Understood.' }] };
            
            let hist = newMsgs.slice(-6).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }));
            
            return [systemMsg, ackMsg, ...hist];
          })(),
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.7
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
            content: 'The Arena is currently over-taxed (System Quota reached). I must rest my wisdom for a moment. 🏛️',
          }]);
        } else if (errorCode === 429) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Slow down, warrior. You are seeking wisdom too quickly for the stars to align. Try again in a minute.',
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
      console.error('Coach Send Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Coach is temporarily unreachable (Detail: ${error.message || 'Network Error'}). Check your connection and try again.`,
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
    Alert.alert('Clear?', 'Reset chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: performClear }]);
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
                <TouchableOpacity 
                  style={[styles.beginBtn, { backgroundColor: theme.accent }]}
                  onPress={startSession}
                  disabled={loading}
                >
                  {loading ? <LeapLogo size={40} animated /> : <Text style={styles.beginBtnText}>CONSULT THE MENTOR</Text>}
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
              {loading ? <LeapLogo size={40} animated /> : <MaterialCommunityIcons name="send" size={18} color="#000" />}
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

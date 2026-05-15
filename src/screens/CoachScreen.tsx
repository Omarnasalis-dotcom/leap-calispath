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

const GEMINI_KEY = (process.env['EXPO_PUBLIC_GEMINI_KEY'] || '').trim();
const GEMINI_MODEL = 'gemini-flash-lite-latest'; 

const SYSTEM_PROMPT = `You are the AI Warrior Coach.
ARENA LOGIC:
1. STRENGTH: Tiers 0-9. T9(Eternity) requires "Eternity Protocol" (Weighted reps + Unbroken combos).
2. POWER: Tiers 0-8 (Voltaic 290+).
3. STATIC: Sum of peaks in 4 Categories. Planche=50x.
4. 1MM: Sum of peaks in 8+ Patterns. Low score = Untested Patterns.
5. GLOBAL SCORE: SUM of all world points. Glory = Clash/Tournament currency.
BEHAVIOR:
- Keep answers simple and direct. Do not dump all details at once.
- PRIORITIZE RECOMMENDATIONS. Tell the warrior exactly what to test or train next.
- If 1MM is low, recommend testing the remaining patterns (Dips, Squats, Muscle-ups).
- Aim for Eternity Tier 9 readiness.`;


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function CoachScreen({ onBack }: { onBack: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [globalRank, setGlobalRank] = useState<number | string>('--');
  const scrollViewRef = useRef<ScrollView>(null);



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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [{ 
            role: 'user',
            parts: [{ text: `User: ${profile?.display_name || 'Warrior'}. Stats: Tier ${profile?.strength_tier}, Rank ${globalRank}, Power ${profile?.power_points}, Static ${profile?.statics_tier}, 1MM ${profile?.one_mm_points}. Action: Greet me simply and offer the 3 directions (Analysis, Report, Advice).` }] 
          }],
          generationConfig: {
            maxOutputTokens: 1000
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

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const now = Date.now();
    const secondsSinceLast = (now - lastMessageTime) / 1000;
    if (secondsSinceLast < 5) {
      Alert.alert('Slow down, Warrior', `Wait ${Math.ceil(5 - secondsSinceLast)} more seconds before sending.`);
      return;
    }
    setLastMessageTime(now);
    const userMsg: Message = { role: 'user', content: inputText };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInputText('');
    setLoading(true);

    const context = `User: ${profile?.display_name || 'Warrior'}. Stats: Tier ${profile?.strength_tier}, Rank ${globalRank}, Power ${profile?.power_points}, Static ${profile?.statics_tier}, 1MM ${profile?.one_mm_points}.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: `${SYSTEM_PROMPT}\n\nCURRENT DATA: ${context}\nIMPORTANT: Always use these exact numbers. Do not guess or hallucinate stats.` }]
          },
          contents: newMsgs.slice(-6).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            maxOutputTokens: 1000
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
            content: 'Too many questions at once. Give me 10 seconds to breathe, then ask again.',
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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
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
            <View style={styles.headerTitleRow}>
              <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.headerText, { color: textColor }]}>WARRIOR COACH</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={startSession} style={styles.iconBtn}><MaterialCommunityIcons name="refresh" size={20} color={theme.accent} /></TouchableOpacity>
              <TouchableOpacity onPress={clearHistory} style={styles.iconBtn}><MaterialCommunityIcons name="delete-outline" size={20} color={subtextColor} /></TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
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

          <View style={[styles.inputContainer, { borderTopColor: theme.accent + '15', backgroundColor: isDark ? '#0D0D0D' : '#F9F9F9' }]}>
            <TextInput style={[styles.input, { color: textColor }]} value={inputText} onChangeText={setInputText} placeholder="Speak, Warrior..." placeholderTextColor={subtextColor} multiline />
            <TouchableOpacity onPress={sendMessage} disabled={loading || !inputText.trim()} style={[styles.sendBtn, { backgroundColor: inputText.trim() ? theme.accent : (isDark ? '#1A1A1A' : '#EEE') }]}>
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
});

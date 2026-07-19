import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { Button } from '../components/Button';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { BonusTaskWheel } from '../components/BonusTaskWheel';
import {
  GuessSkillExercise,
  HINT_COST,
  HINT_LABELS,
  ROUND_HINT_CAPS,
  computeScore,
  getHintText,
  isCorrectGuess,
  pickRandomExercise,
  searchGuessSuggestions,
} from '../lib/guessTheSkill';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BEST_SCORE_KEY = 'guess_the_skill_best_score';
const WRONG_COLOR = '#FF5252';
const TOTAL_ROUNDS = ROUND_HINT_CAPS.length;

const GUESS_QUOTES = [
  'KNOW THE SKILL BEFORE YOU CHASE IT.',
  'EVERY HINT YOU SKIP IS STRENGTH YOU KEEP.',
  'NAME IT. THEN EARN IT.',
  'THE SHARPEST ATHLETES STUDY THE CRAFT.',
];

type RoundStatus = 'playing' | 'round_won' | 'game_won' | 'game_over';

interface GuessTheSkillScreenProps {
  onExit: () => void;
}

export function GuessTheSkillScreen({ onExit }: GuessTheSkillScreenProps) {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const mountedRef = useMountedRef();
  const usedIdsRef = useRef<string[]>([]);
  const [exercise, setExercise] = useState<GuessSkillExercise>(() => {
    const first = pickRandomExercise();
    usedIdsRef.current = [first.id];
    return first;
  });
  const [roundIndex, setRoundIndex] = useState(0);
  const [hintsRevealed, setHintsRevealed] = useState(1);
  const [status, setStatus] = useState<RoundStatus>('playing');
  const [totalScore, setTotalScore] = useState(0);
  const [query, setQuery] = useState('');
  const [wrongGuess, setWrongGuess] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const scoreScale = useRef(new Animated.Value(1)).current;
  const inputShake = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  const roundCap = ROUND_HINT_CAPS[roundIndex];
  const isFinalRound = roundIndex === TOTAL_ROUNDS - 1;
  const roundScore = computeScore(hintsRevealed);
  const suggestions = useMemo(() => searchGuessSuggestions(query), [query]);

  useEffect(() => {
    AsyncStorage.getItem(BEST_SCORE_KEY)
      .then((stored) => {
        const parsed = stored === null ? NaN : parseInt(stored, 10);
        if (mountedRef.current && !Number.isNaN(parsed)) {
          setBestScore(parsed);
        }
      })
      .catch(() => {});
  }, [mountedRef]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    Animated.sequence([
      Animated.spring(scoreScale, { toValue: 1.25, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scoreScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
  }, [totalScore]);

  useEffect(() => {
    if (!wrongGuess) return;
    const timer = setTimeout(() => {
      if (mountedRef.current) setWrongGuess(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [wrongGuess, mountedRef]);

  function shakeInput() {
    inputShake.setValue(0);
    Animated.sequence(
      [10, -10, 6, -6, 0].map((toValue) =>
        Animated.timing(inputShake, { toValue, duration: 45, useNativeDriver: true })
      )
    ).start();
  }

  function persistBest(finalScore: number) {
    if (bestScore === null || finalScore > bestScore) {
      setBestScore(finalScore);
      setIsNewBest(true);
      setShowCelebration(true);
      AsyncStorage.setItem(BEST_SCORE_KEY, String(finalScore)).catch(() => {});
    }
  }

  function handleGuess(text: string) {
    if (status !== 'playing' || !text.trim()) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

    if (isCorrectGuess(text, exercise)) {
      Keyboard.dismiss();
      const earned = computeScore(hintsRevealed);
      const newTotal = totalScore + earned;
      setTotalScore(newTotal);
      setQuery('');
      setWrongGuess(null);
      if (isFinalRound) {
        setStatus('game_won');
        persistBest(newTotal);
      } else {
        setStatus('round_won');
      }
    } else if (hintsRevealed === roundCap) {
      // Every hint this round allows is out — a failed guess ends the game.
      Keyboard.dismiss();
      setStatus('game_over');
      setShowWheel(true);
      setQuery('');
      persistBest(totalScore);
    } else {
      setWrongGuess(text.trim());
      setQuery('');
      shakeInput();
    }
  }

  function handleRevealHint() {
    if (status !== 'playing' || hintsRevealed >= roundCap) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setHintsRevealed(hintsRevealed + 1);
    setWrongGuess(null);
  }

  function handleGiveUp() {
    if (status !== 'playing') return;
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setStatus('game_over');
    setShowWheel(true);
    setQuery('');
    persistBest(totalScore);
  }

  function startRound(index: number, excludeIds: string[]) {
    const next = pickRandomExercise(excludeIds);
    usedIdsRef.current = [...excludeIds, next.id];
    setExercise(next);
    setRoundIndex(index);
    setHintsRevealed(1);
    setStatus('playing');
    setQuery('');
    setWrongGuess(null);
  }

  function handleContinue() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    startRound(roundIndex + 1, usedIdsRef.current);
  }

  function handlePlayAgain() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTotalScore(0);
    setIsNewBest(false);
    setShowCelebration(false);
    setShowWheel(false);
    startRound(0, []);
  }

  return (
    <GlobalErrorBoundary>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onExit} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: theme.text.primary }]}>GUESS THE SKILL</Text>
            {bestScore !== null && (
              <Text style={[styles.bestText, { color: theme.text.tertiary }]}>BEST: {bestScore}</Text>
            )}
          </View>
          <Animated.View
            style={[
              styles.scoreBadge,
              { backgroundColor: theme.card.background, borderColor: theme.card.border, transform: [{ scale: scoreScale }] },
            ]}
          >
            <Text style={[styles.scoreBadgeText, { color: theme.accent }]}>{totalScore}</Text>
          </Animated.View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {status === 'playing' && (
            <>
              <Text style={[styles.roundLabel, { color: theme.text.tertiary }]}>
                ROUND {roundIndex + 1} OF {TOTAL_ROUNDS} · MAX {roundCap} HINTS
              </Text>

              <View style={styles.hintList}>
                {HINT_LABELS.slice(0, roundCap).map((label, index) =>
                  index < hintsRevealed ? (
                    <View
                      key={label}
                      style={[
                        styles.hintCard,
                        { backgroundColor: theme.card.background, borderColor: theme.card.border },
                        index === hintsRevealed - 1 && { borderColor: theme.accent },
                      ]}
                    >
                      <Text style={[styles.hintLabel, { color: theme.text.tertiary }]}>
                        HINT {index + 1} — {label.toUpperCase()}
                      </Text>
                      <Text style={[styles.hintText, { color: theme.text.primary }]}>
                        {getHintText(exercise, index)}
                      </Text>
                    </View>
                  ) : (
                    <View key={label} style={[styles.lockedRow, { borderColor: theme.card.border }]}>
                      <MaterialCommunityIcons name="lock" size={14} color={theme.text.tertiary} />
                      <Text style={[styles.lockedText, { color: theme.text.tertiary }]}>
                        Hint {index + 1} — {label} (−{HINT_COST})
                      </Text>
                    </View>
                  )
                )}
              </View>

              {wrongGuess && (
                <View style={[styles.wrongNote, { backgroundColor: `${WRONG_COLOR}18`, borderColor: `${WRONG_COLOR}55` }]}>
                  <MaterialCommunityIcons name="close-circle" size={15} color={WRONG_COLOR} />
                  <Text style={[styles.wrongNoteText, { color: WRONG_COLOR }]}>
                    "{wrongGuess}" isn't it — reveal a hint or try again.
                  </Text>
                </View>
              )}

              <Animated.View style={{ transform: [{ translateX: inputShake }] }}>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary },
                  ]}
                  value={query}
                  onChangeText={(text) => {
                    setQuery(text);
                    if (wrongGuess) setWrongGuess(null);
                  }}
                  onSubmitEditing={() => handleGuess(query)}
                  placeholder="Name the skill…"
                  placeholderTextColor={theme.text.tertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                />
              </Animated.View>

              {suggestions.length > 0 && (
                <View style={[styles.suggestions, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                  {suggestions.map((s) => (
                    <TouchableOpacity key={s.id} style={styles.suggestionRow} onPress={() => handleGuess(s.name)}>
                      <Text style={[styles.suggestionText, { color: theme.text.primary }]}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Button title="GUESS" onPress={() => handleGuess(query)} disabled={!query.trim()} />
              {hintsRevealed < roundCap ? (
                <Button title={`REVEAL NEXT HINT (−${HINT_COST})`} onPress={handleRevealHint} variant="secondary" />
              ) : (
                <TouchableOpacity onPress={handleGiveUp} style={styles.giveUp}>
                  <Text style={[styles.giveUpText, { color: WRONG_COLOR }]}>GIVE UP</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {status === 'round_won' && (
            <>
              <View style={[styles.resultCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.resultKicker, { color: theme.text.tertiary }]}>ROUND {roundIndex + 1} CLEARED</Text>
                <Text style={[styles.resultName, { color: theme.text.primary }]}>{exercise.name}</Text>
                <Text style={[styles.resultScore, { color: theme.accent }]}>+{roundScore}</Text>
                <Text style={[styles.resultSub, { color: theme.text.secondary }]}>
                  total: {totalScore} · next round: {ROUND_HINT_CAPS[roundIndex + 1]} hints max
                </Text>
              </View>
              <Button title="CONTINUE" onPress={handleContinue} />
              <Button title="EXIT" onPress={onExit} variant="secondary" />
            </>
          )}

          {status === 'game_won' && (
            <>
              <View style={[styles.resultCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.resultKicker, { color: theme.text.tertiary }]}>ALL {TOTAL_ROUNDS} ROUNDS CLEARED</Text>
                <Text style={[styles.resultScore, { color: theme.accent }]}>{totalScore}</Text>
                <Text style={[styles.resultSub, { color: theme.text.secondary }]}>total points</Text>
                {isNewBest && <Text style={[styles.newBest, { color: theme.accent }]}>NEW BEST!</Text>}
              </View>
              <Button title="PLAY AGAIN" onPress={handlePlayAgain} />
              <Button title="EXIT" onPress={onExit} variant="secondary" />
            </>
          )}

          {status === 'game_over' && (
            <>
              <View style={[styles.resultCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.resultKicker, { color: theme.text.tertiary }]}>
                  GAME OVER · ROUND {roundIndex + 1} OF {TOTAL_ROUNDS}
                </Text>
                <Text style={[styles.resultName, { color: theme.text.primary }]}>{exercise.name}</Text>
                <Text style={[styles.resultScore, { color: theme.accent }]}>{totalScore}</Text>
                <Text style={[styles.resultSub, { color: theme.text.secondary }]}>total points</Text>
                {isNewBest && <Text style={[styles.newBest, { color: theme.accent }]}>NEW BEST!</Text>}

                <View style={[styles.skillCard, { borderColor: theme.card.border }]}>
                  {HINT_LABELS.map((label, index) => (
                    <View key={label} style={styles.skillCardRow}>
                      <Text style={[styles.skillCardLabel, { color: theme.text.tertiary }]}>{label}</Text>
                      <Text style={[styles.skillCardValue, { color: theme.text.primary }]}>
                        {getHintText(exercise, index)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <Button title="PLAY AGAIN" onPress={handlePlayAgain} />
              <Button title="EXIT" onPress={onExit} variant="secondary" />
            </>
          )}
        </ScrollView>

        <CelebrationBanner
          visible={showCelebration}
          onDismiss={() => setShowCelebration(false)}
          headerText="GUESS THE SKILL"
          title="NEW BEST SCORE"
          subtitle="SKILL KNOWLEDGE"
          stat={`${totalScore} POINTS`}
          rank={status === 'game_won' ? 'PERFECT RUN' : `REACHED ROUND ${roundIndex + 1}`}
          emoji="🧠"
          userName={profile?.display_name?.toUpperCase() || 'PLAYER'}
          celebratory={status === 'game_won'}
          quotes={GUESS_QUOTES}
        />

        <BonusTaskWheel visible={showWheel} onDismiss={() => setShowWheel(false)} />
      </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerCenter: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  bestText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  scoreBadge: {
    minWidth: 52,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  scoreBadgeText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  roundLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
  },
  hintList: {
    gap: 8,
  },
  hintCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 4,
  },
  hintLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  hintText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  lockedText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  wrongNote: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  wrongNoteText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    flexShrink: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  suggestionText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  giveUp: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  giveUpText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  resultKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  resultName: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
  },
  resultScore: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    lineHeight: 52,
  },
  resultSub: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
  },
  newBest: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginTop: 4,
  },
  skillCard: {
    alignSelf: 'stretch',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
    gap: 8,
  },
  skillCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  skillCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  skillCardValue: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    flexShrink: 1,
    textAlign: 'right',
  },
});

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { Button } from '../components/Button';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { BonusTaskWheel } from '../components/BonusTaskWheel';
import {
  LADDER_EXERCISES,
  LadderExercise,
  MoveRejectionReason,
  getDifficultyBand,
  getStarterExercise,
  searchLadderExercises,
  validateMove,
} from '../lib/beatTheLadder';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BeatTheLadderScreenProps {
  onExit: () => void;
}

function getRejectionMessage(reason: MoveRejectionReason, currentName: string): string {
  if (reason === 'already_used') return 'was already used earlier in this chain.';
  return `isn't harder than ${currentName}.`;
}

const SUCCESS_COLOR = '#43D17C';

const LADDER_QUOTES = [
  'ONE MORE MOVE. ALWAYS ONE MORE MOVE.',
  'THE CHAIN ONLY BREAKS WHEN YOU LET IT.',
  'KNOW YOUR MOVEMENTS. KNOW YOUR LIMITS.',
  'EVERY RUNG IS EARNED.',
  'CLIMB UNTIL YOU CAN\'T.',
];

export function BeatTheLadderScreen({ onExit }: BeatTheLadderScreenProps) {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const [chain, setChain] = useState<LadderExercise[]>([getStarterExercise()]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'game_over' | 'cleared'>('active');
  const [brokenOn, setBrokenOn] = useState<LadderExercise | null>(null);
  const [rejectionReason, setRejectionReason] = useState<MoveRejectionReason | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [lastMoveNote, setLastMoveNote] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const badgeScale = useRef(new Animated.Value(1)).current;
  const noteAnim = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  const usedIds = useMemo(() => new Set(chain.map((e) => e.id)), [chain]);
  const currentExercise = chain[chain.length - 1];
  const chainLength = chain.length - 1;
  const suggestions = useMemo(() => searchLadderExercises(query, usedIds), [query, usedIds]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    Animated.sequence([
      Animated.spring(badgeScale, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(badgeScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
  }, [chainLength]);

  useEffect(() => {
    if (!lastMoveNote) return;
    noteAnim.setValue(0);
    Animated.timing(noteAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [lastMoveNote]);

  function handleSelect(candidate: LadderExercise) {
    const result = validateMove(candidate, usedIds, currentExercise.difficulty);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

    if (result.valid) {
      const newChain = [...chain, candidate];
      setChain(newChain);
      setQuery('');
      setLastMoveNote(`${candidate.name} is harder than ${currentExercise.name}.`);
      if (newChain.length === LADDER_EXERCISES.length) {
        setStatus('cleared');
        setShowWheel(true);
      } else {
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    } else {
      setBrokenOn(candidate);
      setRejectionReason(result.reason ?? null);
      setStatus('game_over');
      setQuery('');
      setShowWheel(true);
    }
  }

  function handleRestart() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChain([getStarterExercise()]);
    setQuery('');
    setStatus('active');
    setBrokenOn(null);
    setRejectionReason(null);
    setShowCelebration(false);
    setShowWheel(false);
    setLastMoveNote(null);
  }

  return (
    <GlobalErrorBoundary>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onExit} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text.primary }]}>BEAT THE PLANK</Text>
          <Animated.View
            style={[
              styles.chainBadge,
              { backgroundColor: theme.card.background, borderColor: theme.card.border, transform: [{ scale: badgeScale }] },
            ]}
          >
            <Text style={[styles.chainBadgeText, { color: theme.accent }]}>{chainLength}</Text>
          </Animated.View>
        </View>

        {status === 'active' ? (
          <View style={styles.playArea}>
            <View style={[styles.currentCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.currentLabel, { color: theme.text.tertiary }]}>YOUR EXERCISE</Text>
              <Text style={[styles.currentName, { color: theme.text.primary }]}>{currentExercise.name}</Text>
              <Text style={[styles.currentBand, { color: theme.accent }]}>
                {getDifficultyBand(currentExercise.difficulty)} range
              </Text>
            </View>

            {lastMoveNote && (
              <Animated.View
                style={[
                  styles.moveNote,
                  {
                    backgroundColor: `${SUCCESS_COLOR}18`,
                    borderColor: `${SUCCESS_COLOR}55`,
                    opacity: noteAnim,
                    transform: [{ translateY: noteAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
                  },
                ]}
              >
                <MaterialCommunityIcons name="check-circle" size={15} color={SUCCESS_COLOR} />
                <Text style={[styles.moveNoteText, { color: SUCCESS_COLOR }]}>{lastMoveNote}</Text>
              </Animated.View>
            )}

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.card.background, borderColor: theme.card.border, color: theme.text.primary },
              ]}
              value={query}
              onChangeText={setQuery}
              placeholder="Name something harder…"
              placeholderTextColor={theme.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {suggestions.length > 0 && (
              <View style={[styles.suggestions, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                {suggestions.map((s) => (
                  <TouchableOpacity key={s.id} style={styles.suggestionRow} onPress={() => handleSelect(s)}>
                    <Text style={[styles.suggestionText, { color: theme.text.primary }]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {query.length > 0 && suggestions.length === 0 && (
              <Text style={[styles.noMatches, { color: theme.text.tertiary }]}>No matches yet — keep typing.</Text>
            )}
          </View>
        ) : (
          <View style={styles.playArea}>
            <View style={[styles.resultCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.resultKicker, { color: theme.text.tertiary }]}>
                {status === 'cleared' ? 'LADDER CLEARED' : 'RUN OVER'}
              </Text>
              <Text style={[styles.resultChain, { color: theme.accent }]}>{chainLength}</Text>
              <Text style={[styles.resultSub, { color: theme.text.secondary }]}>moves chained</Text>
              <Text style={[styles.resultCeiling, { color: theme.text.primary }]}>
                {status === 'cleared' ? 'Topped out at: ' : 'Reached: '}{currentExercise.name}
              </Text>
              {status === 'game_over' && brokenOn && rejectionReason && (
                <Text style={[styles.resultReason, { color: theme.text.tertiary }]}>
                  {brokenOn.name} {getRejectionMessage(rejectionReason, currentExercise.name)}
                </Text>
              )}
            </View>
            <Button title="PLAY AGAIN" onPress={handleRestart} />
            <Button
              title="SHARE RESULT"
              onPress={() => {
                // The wheel is a plain overlay (not a <Modal>), but closing it
                // first keeps the two from ever visually stacking.
                setShowWheel(false);
                setShowCelebration(true);
              }}
              variant="secondary"
            />
            <Button title="EXIT" onPress={onExit} variant="secondary" />
          </View>
        )}

        <ScrollView ref={scrollRef} style={styles.chainScroll} contentContainerStyle={styles.chainScrollContent}>
          {chain.map((exercise, index) => (
            <View
              key={exercise.id}
              style={[
                styles.chainChip,
                { backgroundColor: theme.card.background, borderColor: theme.card.border },
                index === chain.length - 1 && status === 'active' && { borderColor: theme.accent },
              ]}
            >
              <Text style={[styles.chainChipIndex, { color: theme.text.tertiary }]}>
                {index === 0 ? 'START' : index}
              </Text>
              <Text style={[styles.chainChipName, { color: theme.text.primary }]}>{exercise.name}</Text>
            </View>
          ))}
        </ScrollView>

        <CelebrationBanner
          visible={showCelebration}
          onDismiss={() => setShowCelebration(false)}
          headerText="BEAT THE PLANK"
          title={status === 'cleared' ? 'LADDER CLEARED' : 'CHAIN BROKEN'}
          subtitle="SOLO CLIMB"
          stat={`${chainLength} MOVE${chainLength === 1 ? '' : 'S'}`}
          rank={`${status === 'cleared' ? 'TOPPED OUT' : 'REACHED'}: ${currentExercise.name.toUpperCase()}`}
          emoji="🪜"
          userName={profile?.display_name?.toUpperCase() || 'PLAYER'}
          celebratory={status === 'cleared'}
          quotes={LADDER_QUOTES}
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
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  chainBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chainBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  playArea: {
    paddingHorizontal: 20,
    gap: 12,
  },
  currentCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
  },
  currentName: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
    marginBottom: 6,
  },
  currentBand: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.5,
  },
  moveNote: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  moveNoteText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
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
  noMatches: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    paddingHorizontal: 4,
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
  },
  resultChain: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    lineHeight: 52,
  },
  resultSub: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    marginBottom: 12,
  },
  resultCeiling: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
  },
  resultReason: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  chainScroll: {
    flex: 1,
    marginTop: 16,
  },
  chainScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 8,
  },
  chainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chainChipIndex: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    minWidth: 34,
  },
  chainChipName: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    flex: 1,
  },
});

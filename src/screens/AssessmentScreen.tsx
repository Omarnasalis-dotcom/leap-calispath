import { useRouter, router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
} from 'react-native';
import { LeapLogo } from '../components/LeapLogo';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { supabase } from '../lib/supabase';
import {
  MOVEMENT_OPTIONS,
  MovementVariant,
  MovementAssessment,
  StrengthAssessment,
} from '../lib/spartanLogic';
import { preloadExerciseMedia } from '../data/exerciseMedia';
import { Button } from '../components/Button';
import { getFriendlyErrorMessage } from '../lib/asyncErrorHandler';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STEPS = ['pullups', 'dips', 'pushups', 'muscleups'] as const;
type Step = typeof STEPS[number];

const QUICK_REPS = [5, 10, 15, 20, 25, 30, 40, 50];

export function AssessmentScreen({ onComplete }: { onComplete: () => void }) {
  const { user, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [askingReps, setAskingReps] = useState(false);
  const [customReps, setCustomReps] = useState('');
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);

  const [history, setHistory] = useState<{ step: number; variantIndex: number; askingReps: boolean }[]>([]);

  const [assessments, setAssessments] = useState<Record<Step, MovementAssessment>>({
    pullups: { reps: 0, variant: 'inverted_row' },
    dips: { reps: 0, variant: 'bench_dip' },
    pushups: { reps: 0, variant: 'knee_pushup' },
    muscleups: { reps: 0, variant: 'jumping_mu' },
  });

  const step = STEPS[currentStep];
  const options = MOVEMENT_OPTIONS[step];
  const currentOption = options[currentVariantIndex];

  useEffect(() => {
    let nextId: string | undefined;
    if (currentVariantIndex < options.length - 1) {
      nextId = options[currentVariantIndex + 1].value;
    } else {
      const nextStepIndex = currentStep + 1;
      if (nextStepIndex < STEPS.length) {
        nextId = MOVEMENT_OPTIONS[STEPS[nextStepIndex]][0].value;
      }
    }
    if (nextId) preloadExerciseMedia(nextId);
  }, [currentStep, currentVariantIndex]);

  function calculateHolisticTierPreview(asses: Record<Step, MovementAssessment>): number {
    const p = asses.pullups;
    const d = asses.dips;
    const s = asses.pushups;

    let pullTier = 0;
    if (p.variant === 'strict_pullup' && p.reps >= 15) pullTier = 7;
    else if (p.variant === 'strict_pullup' && p.reps >= 1) pullTier = 4;
    else if (p.variant === 'assisted_pullup' && p.reps >= 5) pullTier = 2;
    else if (p.reps >= 5) pullTier = 1;

    let dipTier = 0;
    if (d.variant === 'standard_dip' && d.reps >= 10) dipTier = 4;
    else if (d.variant === 'standard_dip' && d.reps >= 5) dipTier = 3;
    else if (d.reps >= 10) dipTier = 2;
    else if (d.reps >= 5) dipTier = 1;

    let pushTier = 0;
    if (s.variant === 'standard_pushup' && s.reps >= 20) pushTier = 4;
    else if (s.reps >= 10) pushTier = 2;
    else if (s.reps >= 5) pushTier = 1;

    return Math.min(pullTier, dipTier, pushTier, 7);
  }

  function handleYes() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistory([...history, { step: currentStep, variantIndex: currentVariantIndex, askingReps }]);
    setAskingReps(true);
    setCustomReps('');
  }

  function handleNo() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHistory([...history, { step: currentStep, variantIndex: currentVariantIndex, askingReps }]);
    
    if (currentVariantIndex < options.length - 1) {
      setCurrentVariantIndex(currentVariantIndex + 1);
    } else {
      // They said NO to the easiest variant. Result is 0 reps for this movement.
      const variant = options[currentVariantIndex].value as MovementVariant;
      const nextAssessments = { ...assessments, [step]: { variant, reps: 0 } };
      setAssessments(nextAssessments);
      advanceToNextMovement(nextAssessments);
    }
  }

  function handleQuickRep(reps: number) {
    setCustomReps(reps.toString());
  }

  function handleNextFromReps() {
    const variant = currentOption.value as MovementVariant;
    const reps = parseInt(customReps) || 0;
    
    if (reps < 0) {
      Alert.alert(
        "Invalid Input",
        "You must enter at least 0 reps. If you cannot do any, you can enter 0 or go BACK and select NO."
      );
      return;
    }

    const nextAssessments = { ...assessments, [step]: { variant, reps } };
    setAssessments(nextAssessments);
    advanceToNextMovement(nextAssessments);
  }

  function advanceToNextMovement(asses: Record<Step, MovementAssessment>) {
    const currentTierPreview = calculateHolisticTierPreview(asses);

    if (currentStep < STEPS.length - 1) {
      let nextStep = currentStep + 1;
      
      if (STEPS[nextStep] === 'muscleups' && currentTierPreview < 4) {
        submitAssessment(asses);
        return;
      }

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHistory([...history, { step: currentStep, variantIndex: currentVariantIndex, askingReps }]);
      setCurrentStep(nextStep);
      setCurrentVariantIndex(0);
      setAskingReps(false);
      setCustomReps('');
    } else {
      submitAssessment(asses);
    }
  }

  function handleBack() {
    if (history.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const prev = history[history.length - 1];
      setHistory(history.slice(0, -1));
      setCurrentStep(prev.step);
      setCurrentVariantIndex(prev.variantIndex);
      setAskingReps(prev.askingReps);
      
      const pStep = STEPS[prev.step];
      const pVariant = MOVEMENT_OPTIONS[pStep][prev.variantIndex].value;
      if (prev.askingReps && assessments[pStep].variant === pVariant) {
        setCustomReps(assessments[pStep].reps.toString());
      } else {
        setCustomReps('');
      }
    } else if (router.canGoBack()) {
      router.back();
    }
    // No back history and nothing to go back to — stay put. AuthGuard already
    // keeps unassessed users on /assessment, so an imperative replace('/') here
    // would just race that redirect for no benefit (see app/assessment.tsx).
  }

  async function submitAssessment(finalAssessments = assessments) {
    if (!user) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setLoading(true);
    try {
      const assessment: StrengthAssessment = {
        pullups: finalAssessments.pullups,
        dips: finalAssessments.dips,
        pushups: finalAssessments.pushups,
        muscleups: finalAssessments.muscleups,
      };

      // Send the raw performance data and let the server derive the tier.
      // The previous call sent a client-computed tier, which the RPC wrote
      // straight to profiles.strength_tier with no validation — so anyone
      // calling the RPC directly could award themselves tier 9 permanently.
      // calculate_spartan_rank in the DB is a verified-identical port of
      // calculateSpartanRank (see 20260810120000), so honest submissions land
      // on exactly the same tier as before.
      const { error } = await supabase.rpc('submit_initial_assessment_v2', {
        p_pullup_variant: assessment.pullups.variant,
        p_pullup_reps: assessment.pullups.reps,
        p_dip_variant: assessment.dips.variant,
        p_dip_reps: assessment.dips.reps,
        p_pushup_variant: assessment.pushups.variant,
        p_pushup_reps: assessment.pushups.reps,
        p_mu_variant: assessment.muscleups?.variant ?? null,
        p_mu_reps: assessment.muscleups?.reps ?? null,
      });

      if (error) throw error;

      await refreshProfile();
      onComplete();
    } catch (error: any) {
      console.error('Assessment error:', error);
      Alert.alert('Error', getFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  const getMovementTitle = (s: Step) => {
    switch (s) {
      case 'pullups': return 'PULL-UPS';
      case 'dips': return 'DIPS';
      case 'pushups': return 'PUSH-UPS';
      case 'muscleups': return 'MUSCLE-UPS';
    }
  };

  return (
    <GlobalErrorBoundary>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background.primary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.text.secondary }]}>← BACK</Text>
          </TouchableOpacity>

          <View style={styles.progressBar}>
            {STEPS.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.progressDot,
                  { backgroundColor: idx <= currentStep ? theme.text.primary : theme.card.border }
                ]}
              />
            ))}
          </View>
        </View>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <LeapLogo size={64} animated={true} />
        </View>

        <View style={styles.agentContainer}>
          <Text style={[styles.movementTitle, { color: theme.text.primary }]}>
            {getMovementTitle(step)}
          </Text>

          <ExerciseDemo movementId={currentOption.value} label={currentOption.label} />

          {!askingReps ? (
            <View style={styles.questionCard}>
              <Text style={[styles.questionPrompt, { color: theme.text.primary }]}>
                Can you perform a {currentOption.label}?
              </Text>
              <Text style={[styles.questionDesc, { color: theme.text.tertiary }]}>
                {currentOption.description}
              </Text>

              <View style={styles.yesNoContainer}>
                <TouchableOpacity 
                  style={[styles.decisionButton, { backgroundColor: theme.background.secondary, borderColor: theme.card.border }]} 
                  onPress={handleNo}
                >
                  <Text style={[styles.decisionText, { color: theme.text.secondary }]}>NO</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.decisionButton, { backgroundColor: theme.text.primary, borderColor: theme.text.primary }]} 
                  onPress={handleYes}
                >
                  <Text style={[styles.decisionText, { color: theme.background.primary }]}>YES</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.questionCard}>
              <Text style={[styles.questionPrompt, { color: theme.text.primary }]}>
                How many {currentOption.label}s can you do?
              </Text>
              
              <TextInput
                ref={inputRef}
                style={[styles.repInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={customReps}
                onChangeText={setCustomReps}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={theme.text.tertiary}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
              />

              <View style={styles.quickRepsGrid}>
                {QUICK_REPS.map((reps) => (
                  <TouchableOpacity
                    key={reps}
                    style={[
                      styles.quickRepBtn,
                      { borderColor: theme.card.border },
                      customReps === reps.toString() && { borderColor: theme.text.primary, backgroundColor: theme.background.secondary }
                    ]}
                    onPress={() => handleQuickRep(reps)}
                  >
                    <Text style={[
                      styles.quickRepText,
                      { color: theme.text.secondary },
                      customReps === reps.toString() && { color: theme.text.primary }
                    ]}>{reps}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title={currentStep === STEPS.length - 1 ? 'COMPLETE' : 'NEXT'}
                onPress={handleNextFromReps}
                loading={loading}
              />
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    // SpartanLayout (the wrapper rendering this screen) already applies the
    // safe-area top inset — adding another fixed paddingTop here stacked on
    // top of it, pushing everything down and leaving the reps/quick-rep grid
    // below the fold on most devices.
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  backText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 1,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 8,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  agentContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  movementTitle: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 3,
    marginBottom: 12,
    textAlign: 'center',
  },
  questionCard: {
    alignItems: 'center',
  },
  questionPrompt: {
    fontSize: 28,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  questionDesc: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  yesNoContainer: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  decisionButton: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  decisionText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 2,
  },
  repInput: {
    fontSize: 56,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
    width: '100%',
    paddingVertical: 8,
    marginBottom: 16,
  },
  quickRepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 20,
  },
  quickRepBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickRepText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
  },
});

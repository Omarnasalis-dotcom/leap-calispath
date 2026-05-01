import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import {
  calculateSpartanRank,
  MOVEMENT_OPTIONS,
  MovementVariant,
  MovementAssessment,
  StrengthAssessment,
} from '../lib/spartanLogic';
import { TIER_NAMES } from '../types';
import { Button } from '../components/Button';

const STEPS = ['pullups', 'dips', 'pushups', 'muscleups'] as const;
type Step = typeof STEPS[number];

const REP_CIRCLES = [0, 1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30];

export function AssessmentScreen({ onComplete }: { onComplete: () => void }) {
  const { user, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [customReps, setCustomReps] = useState('');

  const [assessments, setAssessments] = useState<Record<Step, MovementAssessment>>({
    pullups: { reps: 0, variant: 'strict_pullup' },
    dips: { reps: 0, variant: 'standard_dip' },
    pushups: { reps: 0, variant: 'standard_pushup' },
    muscleups: { reps: 0, variant: 'strict_mu' },
  });

  const step = STEPS[currentStep];
  const options = MOVEMENT_OPTIONS[step];

  function updateVariant(variant: MovementVariant) {
    setAssessments(prev => ({
      ...prev,
      [step]: { ...prev[step], variant },
    }));
  }

  function updateReps(reps: number) {
    setAssessments(prev => ({
      ...prev,
      [step]: { ...prev[step], reps: Math.max(0, reps) },
    }));
    setCustomReps(reps.toString());
  }

  function handleCustomRepsChange(text: string) {
    setCustomReps(text);
    const num = parseInt(text) || 0;
    updateReps(num);
  }

  function handleNext() {
    if (currentStep < STEPS.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setCustomReps(assessments[STEPS[nextStep]].reps.toString());
    } else {
      submitAssessment();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      setCustomReps(assessments[STEPS[prevStep]].reps.toString());
    }
  }

  async function submitAssessment() {
    if (!user) return;

    setLoading(true);
    try {
      const assessment: StrengthAssessment = {
        pullups: assessments.pullups,
        dips: assessments.dips,
        pushups: assessments.pushups,
        muscleups: assessments.muscleups,
      };

      const tier = calculateSpartanRank(assessment);
      const lockedUntil = new Date();
      lockedUntil.setHours(lockedUntil.getHours() + 72);

      const { error } = await supabase
        .from('profiles')
        .update({
          strength_tier: tier,
          assessed_at: new Date().toISOString(),
          assessment_locked_until: lockedUntil.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      onComplete();
    } catch (error: any) {
      console.error('Assessment error:', error);
      Alert.alert('Error', error.message || 'Failed to save assessment');
    } finally {
      setLoading(false);
    }
  }

  const currentAssessment = assessments[step];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background.primary }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.stepIndicator, { color: theme.text.tertiary }]}>
          STEP {currentStep + 1} OF {STEPS.length}
        </Text>
        <Text style={[styles.title, { color: theme.accent }]}>
          {step === 'pullups' && 'PULL-UPS'}
          {step === 'dips' && 'DIPS'}
          {step === 'pushups' && 'PUSH-UPS'}
          {step === 'muscleups' && 'MUSCLE-UPS'}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>SELECT VARIANT</Text>
        </View>
        {options.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              { borderColor: theme.card.border },
              currentAssessment.variant === option.value && { borderColor: theme.accent, backgroundColor: theme.background.secondary },
            ]}
            onPress={() => updateVariant(option.value as MovementVariant)}
          >
            <View style={styles.optionHeader}>
              <Text style={[
                styles.optionLabel,
                { color: theme.text.primary },
                currentAssessment.variant === option.value && { color: theme.accent },
              ]}>
                {option.label.toUpperCase()}
              </Text>
              <View style={styles.difficultyContainer}>
                <Text style={[styles.difficultyLabel, { color: theme.text.tertiary }]}>
                  {index === 0 ? 'HARD' : index === 1 ? 'INTERMEDIATE' : 'EASY'}
                </Text>
                <View style={styles.difficultyBar}>
                  {[1, 2, 3].map((level) => (
                    <View
                      key={level}
                      style={[
                        styles.difficultySegment,
                        { backgroundColor: level <= (3 - index) ? theme.accent : theme.card.border },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
            <Text style={[styles.optionDescription, { color: theme.text.secondary }]}>{option.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>MAX REPS</Text>
        </View>
        
        <View style={styles.repCircles}>
          {REP_CIRCLES.map((rep) => (
            <TouchableOpacity
              key={rep}
              style={[
                styles.repCircle,
                { borderColor: theme.card.border },
                currentAssessment.reps === rep && { borderColor: theme.accent, backgroundColor: theme.accent },
              ]}
              onPress={() => updateReps(rep)}
            >
              <Text style={[
                styles.repCircleText,
                { color: theme.text.primary },
                currentAssessment.reps === rep && { color: '#FFFFFF' },
              ]}>
                {rep}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customInputContainer}>
          <Text style={[styles.customInputLabel, { color: theme.text.secondary }]}>OR ENTER CUSTOM REPS:</Text>
          <TextInput
            style={[styles.customInput, { borderColor: theme.card.border, color: theme.text.primary }]}
            value={customReps}
            onChangeText={handleCustomRepsChange}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={theme.text.tertiary}
          />
        </View>
      </View>

      <View style={styles.navigation}>
        {currentStep > 0 && (
          <Button title="BACK" onPress={handleBack} variant="secondary" />
        )}
        <Button
          title={currentStep === STEPS.length - 1 ? 'CALCULATE RANK' : 'NEXT'}
          onPress={handleNext}
          loading={loading}
        />
      </View>

      <View style={styles.progressBar}>
        {STEPS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              { backgroundColor: theme.card.border },
              index <= currentStep && { backgroundColor: theme.accent },
            ]}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepIndicator: {
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  option: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  difficultyContainer: {
    alignItems: 'flex-end',
  },
  difficultyLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  difficultyBar: {
    flexDirection: 'row',
    gap: 2,
  },
  difficultySegment: {
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  optionDescription: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  repCircles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  repCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  repCircleText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  customInputContainer: {
    marginTop: 16,
  },
  customInputLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  customInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

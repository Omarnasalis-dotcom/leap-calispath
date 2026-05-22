import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { calculateTotalPowerScore, getPowerLevel } from '../lib/powerLogic';
import { Button } from '../components/Button';

export interface PowerMovementPBs {
  [key: string]: number;
  pull_up: number;
  dip: number;
  squat: number;
  muscle_up: number;
}

interface PowerAssessmentScreenProps {
  onComplete: (newTier: number) => void;
  onAbandon?: () => void;
}

export function PowerAssessmentScreen({ onComplete, onAbandon }: PowerAssessmentScreenProps) {
  const { profile, user, refreshProfile } = useAuth();
  const { theme } = useTheme();
  
  const [inputs, setInputs] = useState<PowerMovementPBs>({
    pull_up: 0,
    dip: 0,
    squat: 0,
    muscle_up: 0,
  });
  
  const [loading, setLoading] = useState(false);
  const totalScore = calculateTotalPowerScore(inputs);
  const newTier = getPowerLevel(totalScore).id;

  async function handleSubmit() {
    if (!user || !profile) return;
    
    setLoading(true);
    
    try {
      // Only update tier if new tier is higher than current
      const currentPowerTier = profile?.power_tier ?? 0;
      const finalTier = Math.max(newTier, currentPowerTier);
      
      // Update power_pbs and power_points in database
      const { error } = await supabase
        .from('profiles')
        .update({
          power_pbs: inputs,
          power_points: totalScore,
          power_tier: finalTier,
          power_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      
      // Only save to leaderboard if score improved
      const { data: existing } = await supabase
        .from('power_assessments')
        .select('pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm')
        .eq('user_id', user.id)
        .single();

      const existingScore = existing 
        ? (existing.pullup_1rm + existing.dip_1rm + existing.squat_1rm + (existing.muscleup_1rm * 2))
        : 0;

      if (totalScore > existingScore) {
        await supabase
          .from('power_assessments')
          .upsert({
            user_id: user.id,
            power_tier: finalTier,
            pullup_1rm: inputs.pull_up,
            dip_1rm: inputs.dip,
            squat_1rm: inputs.squat,
            muscleup_1rm: inputs.muscle_up,
            assessed_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      }
      
      // Refresh local profile
      await refreshProfile();
      
      onComplete(finalTier);
    } catch (error) {
      console.error('Error saving power assessment:', error);
      Alert.alert('Error', 'Failed to save your power assessment. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleAbandon() {
    if (Platform.OS === 'web') {
      if (window.confirm('Abandon Assessment? Your progress will not be saved.')) {
        router.back();
      }
    } else {
      Alert.alert(
        'Abandon Assessment?',
        'Your progress will not be saved.',
        [
          { text: 'Continue', style: 'cancel' },
          { text: 'Abandon', style: 'destructive', onPress: onAbandon },
        ]
      );
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text.primary }]}>POWER ASSESSMENT</Text>
        <Text style={[styles.subtitle, { color: theme.text.tertiary }]}>
          Enter your additional weight for each movement
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text.primary }]}>
            Pull-up Weight (kg)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                color: theme.text.primary,
              }
            ]}
            value={inputs.pull_up.toString()}
            onChangeText={(text) => {
              const val = parseFloat(text) || 0;
              setInputs({ ...inputs, pull_up: val });
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.text.tertiary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text.primary }]}>
            Dip Weight (kg)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                color: theme.text.primary,
              }
            ]}
            value={inputs.dip.toString()}
            onChangeText={(text) => {
              const val = parseFloat(text) || 0;
              setInputs({ ...inputs, dip: val });
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.text.tertiary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text.primary }]}>
            Squat Weight (kg)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                color: theme.text.primary,
              }
            ]}
            value={inputs.squat.toString()}
            onChangeText={(text) => {
              const val = parseFloat(text) || 0;
              setInputs({ ...inputs, squat: val });
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.text.tertiary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text.primary }]}>
            Muscle-up Weight (kg)
            <Text style={[styles.multiplierHint, { color: theme.accent }]}> × 2</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                color: theme.text.primary,
              }
            ]}
            value={inputs.muscle_up.toString()}
            onChangeText={(text) => {
              const val = parseFloat(text) || 0;
              setInputs({ ...inputs, muscle_up: val });
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.text.tertiary}
          />
        </View>
      </View>

      <View style={[styles.scoreCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
        <Text style={[styles.scoreTitle, { color: theme.text.primary }]}>CALCULATED SCORE</Text>
        <Text style={[styles.scoreFormula, { color: theme.text.tertiary }]}>
          {inputs.pull_up} + {inputs.dip} + {inputs.squat} + ({inputs.muscle_up} × 2)
        </Text>
        <Text style={[styles.totalScore, { color: theme.accent }]}>{totalScore} Points</Text>
        <Text style={[styles.tierResult, { color: theme.text.secondary }]}>
          Power Tier {newTier}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="ABANDON"
          onPress={handleAbandon}
          variant="secondary"
          loading={loading}
        />
        <Button
          title="SAVE ASSESSMENT"
          onPress={handleSubmit}
          loading={loading}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  form: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  multiplierHint: {
    fontSize: 12,
    marginLeft: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  scoreCard: {
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  scoreFormula: {
    fontSize: 12,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  totalScore: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierResult: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  actions: {
    padding: 24,
    gap: 12,
    paddingBottom: 60,
  },
});

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
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

export interface PowerMovementPBs {
  [key: string]: string;
  pull_up: string;
  dip: string;
  squat: string;
  muscle_up: string;
}

interface PowerAssessmentScreenProps {
  onComplete: (newTier: number) => void;
  onAbandon?: () => void;
}

export function PowerAssessmentScreen({ onComplete, onAbandon }: PowerAssessmentScreenProps) {
  const { profile, user, refreshProfile } = useAuth();
  const { theme } = useTheme();
  
  const [inputs, setInputs] = useState<PowerMovementPBs>({
    pull_up: '',
    dip: '',
    squat: '',
    muscle_up: '',
  });
  
  const [loading, setLoading] = useState(false);

  // Compute numeric values for calculations
  const numericPBs = {
    pull_up: parseFloat(inputs.pull_up) || 0,
    dip: parseFloat(inputs.dip) || 0,
    squat: parseFloat(inputs.squat) || 0,
    muscle_up: parseFloat(inputs.muscle_up) || 0,
  };

  const totalScore = calculateTotalPowerScore(numericPBs);
  const newTier = getPowerLevel(totalScore).id;

  async function handleSubmit() {
    if (!user || !profile) return;
    
    setLoading(true);
    
    try {
      // Only update tier if new tier is higher than current
      const currentPowerTier = profile?.power_tier ?? 0;
      const finalTier = Math.max(newTier, currentPowerTier);
      
      // 1. Save raw PBs to power_assessments table
      const { error: upsertErr } = await supabase
        .from('power_assessments')
        .upsert({
          user_id: user.id,
          pullup_1rm: numericPBs.pull_up,
          dip_1rm: numericPBs.dip,
          squat_1rm: numericPBs.squat,
          muscleup_1rm: numericPBs.muscle_up,
          assessed_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (upsertErr) throw upsertErr;

      // 2. Sync power points server-side via RPC (this securely updates power_points and power_tier)
      const { error: rpcErr } = await supabase.rpc('sync_power_points', { p_user_id: user.id });
      if (rpcErr) throw rpcErr;

      // 3. Update only non-restricted profile columns
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          power_pbs: numericPBs,
          power_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileErr) throw profileErr;
      
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
    Alert.alert(
      'Abandon Assessment?',
      'Your progress will not be saved.',
      [
        { text: 'Continue', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: onAbandon },
      ]
    );
  }

  return (
    <GlobalErrorBoundary>
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
              value={inputs.pull_up}
              onChangeText={(text) => setInputs({ ...inputs, pull_up: text })}
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
              value={inputs.dip}
              onChangeText={(text) => setInputs({ ...inputs, dip: text })}
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
              value={inputs.squat}
              onChangeText={(text) => setInputs({ ...inputs, squat: text })}
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
              value={inputs.muscle_up}
              onChangeText={(text) => setInputs({ ...inputs, muscle_up: text })}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={theme.text.tertiary}
            />
          </View>
        </View>

        <View style={[styles.scoreCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <Text style={[styles.scoreTitle, { color: theme.text.primary }]}>CALCULATED SCORE</Text>
          <Text style={[styles.scoreFormula, { color: theme.text.tertiary }]}>
            {numericPBs.pull_up} + {numericPBs.dip} + {numericPBs.squat} + ({numericPBs.muscle_up} × 2)
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
    </GlobalErrorBoundary>
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

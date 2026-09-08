import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { useSafeMutation } from '../hooks/useSafeMutation';

const ACCENT = '#FF5252';

const GOALS = [
  { id: 'strength', label: 'Build Strength' },
  { id: 'muscle', label: 'Build Muscle' },
  { id: 'weight_loss', label: 'Lose Weight' },
  { id: 'endurance', label: 'Improve Endurance' },
  { id: 'general_fitness', label: 'General Fitness' },
] as const;

const EQUIPMENT = [
  { id: 'pull_up_bar', label: 'Pull-Up Bar' },
  { id: 'dip_bars', label: 'Dip Bars / Rings' },
  { id: 'resistance_bands', label: 'Resistance Bands' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'none', label: 'None — Bodyweight Only' },
] as const;

// Milestone 2 of the onboarding lane. Deliberately minimal — one required
// single-select (goal) plus one optional multi-select (equipment) — pushed
// from MilestoneLaneScreen and popped back to it on save.
export function GoalsEquipmentScreen() {
  const { profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const { safeMutate, isMutating } = useSafeMutation();

  const [goal, setGoal] = useState<string | null>(profile?.primary_goal ?? null);
  const [equipment, setEquipment] = useState<string[]>(profile?.available_equipment ?? []);

  const toggleEquipment = (id: string) => {
    if (id === 'none') {
      setEquipment((prev) => (prev.includes('none') ? [] : ['none']));
      return;
    }
    setEquipment((prev) => {
      const withoutNone = prev.filter((e) => e !== 'none');
      return withoutNone.includes(id) ? withoutNone.filter((e) => e !== id) : [...withoutNone, id];
    });
  };

  async function handleContinue() {
    if (!goal) return;
    await safeMutate(
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ primary_goal: goal, available_equipment: equipment })
          .eq('id', profile!.id);
        return { error };
      },
      {
        onSuccess: async () => {
          await refreshProfile();
          router.back();
        },
        errorMessage: 'Failed to save your goal. Please try again.',
      }
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.panel}>
        <Text style={[styles.eyebrow, { color: ACCENT }]}>MILESTONE 2</Text>
        <Text style={[styles.heading, { color: theme.text.primary }]}>Goals & Equipment</Text>
        <Text style={[styles.subheading, { color: theme.text.secondary }]}>
          Tell us your goal and what you train with — we'll use it to shape your program.
        </Text>

        <Text style={[styles.label, { color: theme.text.primary }]}>What's your main goal?</Text>
        <View style={styles.chipWrap}>
          {GOALS.map((g) => {
            const selected = goal === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => setGoal(g.id)}
                style={[
                  styles.chip,
                  { borderColor: selected ? ACCENT : theme.card.border, backgroundColor: selected ? ACCENT : theme.card.background },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text.secondary }]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.text.primary, marginTop: 24 }]}>What equipment do you have?</Text>
        <Text style={[styles.labelSub, { color: theme.text.tertiary }]}>Optional — pick as many as apply.</Text>
        <View style={styles.chipWrap}>
          {EQUIPMENT.map((e) => {
            const selected = equipment.includes(e.id);
            return (
              <TouchableOpacity
                key={e.id}
                onPress={() => toggleEquipment(e.id)}
                style={[
                  styles.chip,
                  { borderColor: selected ? ACCENT : theme.card.border, backgroundColor: selected ? ACCENT : theme.card.background },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text.secondary }]}>{e.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: 32 }}>
          <Button title="CONTINUE" onPress={handleContinue} loading={isMutating} disabled={!goal} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  panel: {
    padding: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  eyebrow: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  heading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 28,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subheading: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    marginBottom: 28,
    lineHeight: 18,
  },
  label: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  labelSub: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
  },
});

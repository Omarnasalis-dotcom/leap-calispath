import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { useSafeMutation } from '../hooks/useSafeMutation';

const ACCENT = '#FF5252';
const OTHER_GOAL_MAX_LEN = 200;

export const GOALS = [
  { id: 'learn_skills', label: 'Learn Skills', icon: 'school-outline' },
  { id: 'master_basics', label: 'Master Basics', icon: 'checkbox-marked-circle-outline' },
  { id: 'weight_loss', label: 'Lose Weight', icon: 'fire' },
  { id: 'strength', label: 'Increase Strength', icon: 'arm-flex-outline' },
  { id: 'compete', label: 'Compete', icon: 'trophy-outline' },
  { id: 'muscle', label: 'Gain Muscle', icon: 'weight-lifter' },
  { id: 'other', label: 'Other', icon: 'dots-horizontal-circle-outline' },
] as const;

export const EQUIPMENT = [
  { id: 'free_weights', label: 'Free Weights' },
  { id: 'weight_belt', label: 'Weight Belt' },
  { id: 'resistance_bands', label: 'Resistance Bands' },
  { id: 'rings', label: 'Rings' },
  { id: 'pull_up_bar', label: 'Pull-Up Bar' },
  { id: 'dip_bar', label: 'Dip Bar' },
  { id: 'low_parallettes', label: 'Low Parallettes' },
] as const;

const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id);

// Milestone 2 of the onboarding lane. Both sections are multi-select --
// goals require at least one (Other reveals a free-text field, up to
// OTHER_GOAL_MAX_LEN chars), equipment is optional and includes an "All
// Above" shortcut that toggles every real item together rather than being
// its own stored value. Pushed from MilestoneLaneScreen, popped back to it
// on save.
export function GoalsEquipmentScreen() {
  const { profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const { safeMutate, isMutating } = useSafeMutation();

  const [goals, setGoals] = useState<string[]>(
    profile?.goals ?? (profile?.primary_goal ? [profile.primary_goal] : [])
  );
  const [otherText, setOtherText] = useState(profile?.goal_other_text ?? '');
  const [equipment, setEquipment] = useState<string[]>(profile?.available_equipment ?? []);

  const toggleGoal = (id: string) => {
    setGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const allEquipmentSelected = EQUIPMENT_IDS.every((id) => equipment.includes(id));
  const toggleAllEquipment = () => {
    setEquipment(allEquipmentSelected ? [] : [...EQUIPMENT_IDS]);
  };
  const toggleEquipment = (id: string) => {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };

  const hasOther = goals.includes('other');
  const otherValid = !hasOther || otherText.trim().length > 0;
  const canContinue = goals.length > 0 && otherValid;

  async function handleContinue() {
    if (!canContinue) return;
    const trimmedOther = hasOther ? otherText.trim().slice(0, OTHER_GOAL_MAX_LEN) : null;
    await safeMutate(
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ goals, goal_other_text: trimmedOther, available_equipment: equipment })
          .eq('id', profile!.id);
        return { error };
      },
      {
        onSuccess: async () => {
          await refreshProfile();
          router.back();
        },
        errorMessage: 'Failed to save your goals. Please try again.',
      }
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.panel}>
        <Text style={[styles.eyebrow, { color: ACCENT }]}>MILESTONE 2</Text>
        <Text style={[styles.heading, { color: theme.text.primary }]}>Goals & Equipment</Text>
        <Text style={[styles.subheading, { color: theme.text.secondary }]}>
          Tell us your goals and what you train with — we'll use it to shape your program.
        </Text>

        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="target" size={16} color={ACCENT} />
          <Text style={[styles.label, { color: theme.text.primary }]}>What are your goals?</Text>
        </View>
        <Text style={[styles.labelSub, { color: theme.text.tertiary }]}>Pick as many as apply.</Text>
        <View style={styles.chipWrap}>
          {GOALS.map((g) => {
            const selected = goals.includes(g.id);
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => toggleGoal(g.id)}
                style={[
                  styles.chip,
                  { borderColor: selected ? ACCENT : theme.card.border, backgroundColor: selected ? ACCENT : theme.card.background },
                ]}
              >
                <MaterialCommunityIcons
                  name={g.icon as any}
                  size={14}
                  color={selected ? '#FFFFFF' : theme.text.secondary}
                  style={styles.chipIcon}
                />
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text.secondary }]}>{g.label}</Text>
                {selected && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" style={styles.chipCheck} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {hasOther && (
          <View style={styles.otherWrap}>
            <TextInput
              value={otherText}
              onChangeText={setOtherText}
              placeholder="Tell us your goal..."
              placeholderTextColor={theme.text.tertiary}
              maxLength={OTHER_GOAL_MAX_LEN}
              multiline
              style={[
                styles.otherInput,
                { color: theme.text.primary, borderColor: theme.card.border, backgroundColor: theme.card.background },
              ]}
            />
            <Text style={[styles.otherCount, { color: theme.text.tertiary }]}>
              {otherText.length}/{OTHER_GOAL_MAX_LEN}
            </Text>
          </View>
        )}

        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <MaterialCommunityIcons name="dumbbell" size={16} color={ACCENT} />
          <Text style={[styles.label, { color: theme.text.primary }]}>What equipment do you have?</Text>
        </View>
        <Text style={[styles.labelSub, { color: theme.text.tertiary }]}>Optional — pick as many as apply.</Text>
        <View style={styles.chipWrap}>
          <TouchableOpacity
            onPress={toggleAllEquipment}
            style={[
              styles.chip,
              {
                borderColor: allEquipmentSelected ? ACCENT : theme.card.border,
                backgroundColor: allEquipmentSelected ? ACCENT : theme.card.background,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: allEquipmentSelected ? '#FFFFFF' : theme.text.secondary }]}>All Above</Text>
            {allEquipmentSelected && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" style={styles.chipCheck} />}
          </TouchableOpacity>
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
                {selected && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" style={styles.chipCheck} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: 32 }}>
          <Button title="CONTINUE" onPress={handleContinue} loading={isMutating} disabled={!canContinue} />
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  labelSub: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipCheck: {
    marginLeft: 6,
  },
  chipText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
  },
  otherWrap: {
    marginTop: 12,
  },
  otherInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  otherCount: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
});

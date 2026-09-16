// Free-tier AI Coach entry point. Per the 2026-09-16 redesign, free
// athletes no longer get any live chat (the old 8-message-lifetime
// allowance is now unreachable through this UI) — instead they see this
// 3-step recap (Goal & Equipment -> Days/Week -> Create Your Program) that
// ends on the same UpgradeToSaveModal soft-paywall pattern already proven
// on Customize Program / Program Templates / Quick Workout. Pro/Max never
// render this — CoachScreen only mounts it when !canAccessPro().
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { GOALS, EQUIPMENT } from '../../screens/GoalsEquipmentScreen';
import { UpgradeToSaveModal } from '../workoutLibrary/SharedWorkoutModals';
import { CoachPalette } from './coachTokens';

const OTHER_GOAL_MAX_LEN = 200;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export function FreeCoachIntake({
  theme,
  c,
  initialPrompt,
}: {
  theme: any;
  c: CoachPalette;
  initialPrompt?: string;
}) {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [goals, setGoals] = useState<string[]>(
    profile?.goals ?? (profile?.primary_goal ? [profile.primary_goal] : [])
  );
  const [otherText, setOtherText] = useState(profile?.goal_other_text ?? initialPrompt ?? '');
  const [equipment, setEquipment] = useState<string[]>(profile?.available_equipment ?? []);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(profile?.training_days_per_week ?? null);
  const [saving, setSaving] = useState(false);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // Same double-tap guard + iOS onDismiss race idiom as
  // CustomizeProgramScreen's UpgradeToSaveModal usage — state alone isn't
  // reliable against a same-tick double-tap.
  const upgradingRef = useRef(false);
  const pendingPaywallNavRef = useRef(false);

  const hasOther = goals.includes('other');
  const toggleGoal = (id: string) => setGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  const toggleEquipment = (id: string) => setEquipment((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const saveGoalsAndEquipment = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const trimmedOther = hasOther ? otherText.trim().slice(0, OTHER_GOAL_MAX_LEN) : null;
      await supabase.from('profiles').update({ goals, goal_other_text: trimmedOther, available_equipment: equipment }).eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSaving(false);
      setStep(2);
    }
  };

  const saveDaysPerWeek = async () => {
    if (!profile?.id || !daysPerWeek) return;
    setSaving(true);
    try {
      await supabase.from('profiles').update({ training_days_per_week: daysPerWeek }).eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSaving(false);
      setStep(3);
    }
  };

  const openUpgradeModal = () => {
    upgradingRef.current = false;
    setUpgrading(false);
    setUpgradeModalVisible(true);
  };

  // Mirrors CustomizeProgramScreen.tsx's requestPaywallAfterModalCloses /
  // handleModalDismissed exactly — iOS never fires a second Modal's
  // onDismiss reliably back-to-back with this one closing, so the paywall
  // push waits for this modal's real close animation there; Android has no
  // such native callback and can push right away.
  const requestPaywallAfterModalCloses = () => {
    if (Platform.OS === 'ios') {
      pendingPaywallNavRef.current = true;
    } else {
      router.push('/paywall');
    }
  };
  const handleModalDismissed = () => {
    if (!pendingPaywallNavRef.current) return;
    pendingPaywallNavRef.current = false;
    router.push('/paywall');
  };

  const dayCountLabel = daysPerWeek ? `${daysPerWeek} DAY${daysPerWeek > 1 ? 'S' : ''}/WEEK` : undefined;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.stepDots}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.dot, { backgroundColor: n <= step ? theme.accent : c.cardBorder }]} />
          ))}
        </View>

        {step === 1 && (
          <View>
            <Text style={[styles.heading, { color: c.bodyText }]}>What's your goal?</Text>
            <Text style={[styles.subheading, { color: c.secondaryText }]}>
              {goals.length ? "Here's what you've told us — change anything, or skip ahead." : 'Pick as many as apply.'}
            </Text>
            <View style={styles.chipWrap}>
              {GOALS.map((g) => {
                const selected = goals.includes(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => toggleGoal(g.id)}
                    style={[styles.chip, { borderColor: selected ? theme.accent : c.cardBorder, backgroundColor: selected ? theme.accent : c.cardBg }]}
                  >
                    <MaterialCommunityIcons name={g.icon as any} size={13} color={selected ? '#FFFFFF' : c.secondaryText} style={{ marginRight: 6 }} />
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : c.secondaryText }]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasOther && (
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Describe your goal further..."
                placeholderTextColor={c.faint}
                maxLength={OTHER_GOAL_MAX_LEN}
                multiline
                style={[styles.otherInput, { color: c.bodyText, borderColor: c.cardBorder, backgroundColor: c.cardBg }]}
              />
            )}

            <Text style={[styles.heading, { color: c.bodyText, marginTop: 24 }]}>Equipment</Text>
            <View style={styles.chipWrap}>
              {EQUIPMENT.map((e) => {
                const selected = equipment.includes(e.id);
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => toggleEquipment(e.id)}
                    style={[styles.chip, { borderColor: selected ? theme.accent : c.cardBorder, backgroundColor: selected ? theme.accent : c.cardBg }]}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : c.secondaryText }]}>{e.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.stepButtons}>
              <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(2)} disabled={saving}>
                <Text style={[styles.skipText, { color: c.secondaryText }]}>SKIP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: theme.accent, opacity: goals.length === 0 || saving ? 0.5 : 1 }]}
                onPress={saveGoalsAndEquipment}
                disabled={goals.length === 0 || saving}
              >
                <Text style={styles.continueText}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={[styles.heading, { color: c.bodyText }]}>How many days a week?</Text>
            <Text style={[styles.subheading, { color: c.secondaryText }]}>We'll build your program around this.</Text>
            <View style={styles.chipWrap}>
              {DAY_OPTIONS.map((n) => {
                const selected = daysPerWeek === n;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setDaysPerWeek(n)}
                    style={[styles.dayChip, { borderColor: selected ? theme.accent : c.cardBorder, backgroundColor: selected ? theme.accent : c.cardBg }]}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : c.secondaryText }]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.stepButtons}>
              <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(1)} disabled={saving}>
                <Text style={[styles.skipText, { color: c.secondaryText }]}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: theme.accent, opacity: !daysPerWeek || saving ? 0.5 : 1 }]}
                onPress={saveDaysPerWeek}
                disabled={!daysPerWeek || saving}
              >
                <Text style={styles.continueText}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.finalCard}>
            <MaterialCommunityIcons name="brain" size={34} color={theme.accent} />
            <Text style={[styles.heading, { color: c.bodyText, textAlign: 'center', marginTop: 12 }]}>Ready to build your program</Text>
            <Text style={[styles.subheading, { color: c.secondaryText, textAlign: 'center' }]}>
              Your AI Coach has your goal, equipment, and {daysPerWeek}-day split — upgrade to start the build and keep chatting with your coach.
            </Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={openUpgradeModal}>
              <Text style={styles.continueText}>CREATE YOUR PROGRAM</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep(2)}>
              <Text style={[styles.skipText, { color: c.secondaryText, marginTop: 14 }]}>BACK</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <UpgradeToSaveModal
        visible={upgradeModalVisible}
        theme={theme}
        title="BUILD YOUR PROGRAM"
        body="Your AI Coach is ready to build your program and keep coaching you week to week. That's a Pro and Max feature — upgrade to start."
        cancelLabel="NOT YET"
        pillLabel={dayCountLabel}
        pillIcon="calendar-check"
        upgrading={upgrading}
        onUpgrade={() => {
          if (upgradingRef.current) return;
          upgradingRef.current = true;
          setUpgrading(true);
          setUpgradeModalVisible(false);
          requestPaywallAfterModalCloses();
        }}
        onCancel={() => setUpgradeModalVisible(false)}
        onDismiss={handleModalDismissed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  heading: { fontSize: 17, fontWeight: '800' },
  subheading: { fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  dayChip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  otherInput: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 56, fontSize: 13, textAlignVertical: 'top' },
  stepButtons: { flexDirection: 'row', gap: 10, marginTop: 28, alignItems: 'center' },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  skipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  continueBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  continueText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  finalCard: { alignItems: 'center', paddingTop: 24 },
  createBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', alignSelf: 'stretch' },
});

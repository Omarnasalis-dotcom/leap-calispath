// AI Coach setup. Every athlete answers these before the coach opens, so
// the chat starts with the basics already known (the ai-coach
// get_user_context tool reads them; the coach skips asking). Two screens:
// Goal + Days/Week, then Equipment. Pro/Max go straight into the chat
// afterwards; free athletes land on the "ready" card that ends on the same
// UpgradeToSaveModal soft-paywall pattern used on Customize Program /
// Program Templates / Quick Workout. Changing these later happens in the
// chat itself, so there's no separate edit screen. CoachScreen mounts this
// whenever needsCoachSetup(profile) or the athlete is free.
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { track } from '../../lib/analytics';
import { hasCoachEquipment, hasCoachGoalAndDays } from '../../lib/coachSetup';
import { GOALS, EQUIPMENT } from '../../constants/goals';
import { UpgradeToSaveModal } from '../workoutLibrary/SharedWorkoutModals';
import { CoachPalette } from './coachTokens';
import { t } from '../../i18n';

const OTHER_GOAL_MAX_LEN = 200;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id as string);

type SetupStep = 'goal' | 'equipment' | 'ready';

export function CoachSetup({
  theme,
  c,
  isPro,
  initialPrompt,
  onComplete,
}: {
  theme: any;
  c: CoachPalette;
  isPro: boolean;
  initialPrompt?: string;
  // Pro only: called once both screens are saved, to open the chat.
  onComplete?: () => void;
}) {
  const { profile, refreshProfile } = useAuth();
  // Opens on the first unanswered screen, so an existing athlete who
  // already gave a goal and equipment is only asked for what's missing.
  const [step, setStep] = useState<SetupStep>(() =>
    !hasCoachGoalAndDays(profile) ? 'goal' : !hasCoachEquipment(profile) ? 'equipment' : 'ready'
  );
  const [goals, setGoals] = useState<string[]>(
    profile?.goals ?? (profile?.primary_goal ? [profile.primary_goal] : [])
  );
  // A starter-prompt chip only prefills the goal text for free athletes;
  // Pro sends it as the first chat message once setup is done.
  const [otherText, setOtherText] = useState(profile?.goal_other_text ?? (isPro ? '' : initialPrompt ?? ''));
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(profile?.training_days_per_week ?? null);
  const [equipment, setEquipment] = useState<string[]>(profile?.available_equipment ?? []);
  const [noEquipment, setNoEquipment] = useState(
    Array.isArray(profile?.available_equipment) && profile!.available_equipment!.length === 0
  );
  const [saving, setSaving] = useState(false);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // Same double-tap guard + iOS onDismiss race idiom as
  // CustomizeProgramScreen's UpgradeToSaveModal usage — state alone isn't
  // reliable against a same-tick double-tap.
  const upgradingRef = useRef(false);
  const pendingPaywallNavRef = useRef(false);

  const hasOther = goals.includes('other');
  const otherValid = !hasOther || otherText.trim().length > 0;
  const canContinueGoal = goals.length > 0 && otherValid && !!daysPerWeek;
  const canContinueEquipment = equipment.length > 0 || noEquipment;
  const allEquipmentSelected = EQUIPMENT_IDS.every((id) => equipment.includes(id));

  const toggleGoal = (id: string) => setGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  const toggleEquipment = (id: string) => {
    setNoEquipment(false);
    setEquipment((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  };
  const toggleAllEquipment = () => {
    setNoEquipment(false);
    setEquipment(allEquipmentSelected ? [] : [...EQUIPMENT_IDS]);
  };
  const toggleNoEquipment = () => {
    setEquipment([]);
    setNoEquipment((prev) => !prev);
  };

  const saveProfile = async (fields: Record<string, unknown>): Promise<boolean> => {
    if (!profile?.id) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update(fields).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      return true;
    } catch (e: any) {
      console.warn('Coach setup save failed:', e?.message);
      Alert.alert(t('intake.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveGoalAndDays = async () => {
    if (!canContinueGoal) return;
    const trimmedOther = hasOther ? otherText.trim().slice(0, OTHER_GOAL_MAX_LEN) : null;
    const ok = await saveProfile({ goals, goal_other_text: trimmedOther, training_days_per_week: daysPerWeek });
    if (!ok) return;
    track('coach_setup_step', { step: 'goal', access: isPro ? 'paid' : 'free' });
    setStep('equipment');
  };

  const saveEquipment = async () => {
    if (!canContinueEquipment) return;
    const ok = await saveProfile({ available_equipment: noEquipment ? [] : equipment });
    if (!ok) return;
    track('coach_setup_step', { step: 'equipment', access: isPro ? 'paid' : 'free' });
    if (isPro) onComplete?.();
    else setStep('ready');
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

  const dayCountLabel = daysPerWeek ? t('intake.daysPerWeek', { count: daysPerWeek }) : undefined;
  const steps: SetupStep[] = isPro ? ['goal', 'equipment'] : ['goal', 'equipment', 'ready'];
  const stepIndex = steps.indexOf(step);

  const chipStyle = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? theme.accent : c.cardBorder, backgroundColor: selected ? theme.accent : c.cardBg },
  ];
  const chipTextColor = (selected: boolean) => ({ color: selected ? '#FFFFFF' : c.secondaryText });

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.stepDots}>
          {steps.map((s, i) => (
            <View key={s} style={[styles.dot, { backgroundColor: i <= stepIndex ? theme.accent : c.cardBorder }]} />
          ))}
        </View>

        {step === 'goal' && (
          <View>
            <Text style={[styles.heading, { color: c.bodyText }]}>{t('intake.goalQ')}</Text>
            <Text style={[styles.subheading, { color: c.secondaryText }]}>
              {goals.length ? t('intake.prefilled') : t('intake.pickAny')}
            </Text>
            <View style={styles.chipWrap}>
              {GOALS.map((g) => {
                const selected = goals.includes(g.id);
                return (
                  <TouchableOpacity key={g.id} onPress={() => toggleGoal(g.id)} style={chipStyle(selected)}>
                    <MaterialCommunityIcons name={g.icon as any} size={13} color={selected ? '#FFFFFF' : c.secondaryText} style={styles.chipIcon} />
                    <Text style={[styles.chipText, chipTextColor(selected)]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasOther && (
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder={t('intake.describe')}
                placeholderTextColor={c.faint}
                maxLength={OTHER_GOAL_MAX_LEN}
                multiline
                style={[styles.otherInput, { color: c.bodyText, borderColor: c.cardBorder, backgroundColor: c.cardBg }]}
              />
            )}

            <Text style={[styles.heading, { color: c.bodyText, marginTop: 28 }]}>{t('intake.daysQ')}</Text>
            <Text style={[styles.subheading, { color: c.secondaryText }]}>{t('intake.daysSub')}</Text>
            <View style={styles.chipWrap}>
              {DAY_OPTIONS.map((n) => {
                const selected = daysPerWeek === n;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setDaysPerWeek(n)}
                    style={[styles.dayChip, { borderColor: selected ? theme.accent : c.cardBorder, backgroundColor: selected ? theme.accent : c.cardBg }]}
                  >
                    <Text style={[styles.chipText, chipTextColor(selected)]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.stepButtons}>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: theme.accent, opacity: !canContinueGoal || saving ? 0.5 : 1 }]}
                onPress={saveGoalAndDays}
                disabled={!canContinueGoal || saving}
              >
                <Text style={styles.continueText}>{t('intake.continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'equipment' && (
          <View>
            <Text style={[styles.heading, { color: c.bodyText }]}>{t('intake.equipmentQ')}</Text>
            <Text style={[styles.subheading, { color: c.secondaryText }]}>{t('intake.equipmentSub')}</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity onPress={toggleNoEquipment} style={chipStyle(noEquipment)}>
                <MaterialCommunityIcons name="human" size={13} color={noEquipment ? '#FFFFFF' : c.secondaryText} style={styles.chipIcon} />
                <Text style={[styles.chipText, chipTextColor(noEquipment)]}>{t('intake.noEquipment')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleAllEquipment} style={chipStyle(allEquipmentSelected)}>
                <Text style={[styles.chipText, chipTextColor(allEquipmentSelected)]}>{t('intake.allAbove')}</Text>
              </TouchableOpacity>
              {EQUIPMENT.map((e) => {
                const selected = equipment.includes(e.id);
                return (
                  <TouchableOpacity key={e.id} onPress={() => toggleEquipment(e.id)} style={chipStyle(selected)}>
                    <Text style={[styles.chipText, chipTextColor(selected)]}>{e.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.stepButtons}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep('goal')} disabled={saving}>
                <Text style={[styles.backText, { color: c.secondaryText }]}>{t('intake.back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: theme.accent, opacity: !canContinueEquipment || saving ? 0.5 : 1 }]}
                onPress={saveEquipment}
                disabled={!canContinueEquipment || saving}
              >
                <Text style={styles.continueText}>{isPro ? t('intake.startCoach') : t('intake.continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'ready' && (
          <View style={styles.finalCard}>
            <MaterialCommunityIcons name="brain" size={34} color={theme.accent} />
            <Text style={[styles.heading, { color: c.bodyText, textAlign: 'center', marginTop: 12 }]}>{t('intake.ready')}</Text>
            <Text style={[styles.subheading, { color: c.secondaryText, textAlign: 'center' }]}>
              {t('intake.readyBody')}
            </Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: theme.accent }]} onPress={openUpgradeModal}>
              <Text style={styles.continueText}>{t('intake.create')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('equipment')}>
              <Text style={[styles.backText, { color: c.secondaryText, marginTop: 14 }]}>{t('intake.back')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <UpgradeToSaveModal
        visible={upgradeModalVisible}
        theme={theme}
        title={t('intake.upgradeTitle')}
        body={t('intake.upgradeBody')}
        cancelLabel={t('intake.notYet')}
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
  chipIcon: { marginEnd: 6 },
  dayChip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  otherInput: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 56, fontSize: 13, textAlignVertical: 'top' },
  stepButtons: { flexDirection: 'row', gap: 10, marginTop: 28, alignItems: 'center' },
  backBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  backText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  continueBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  continueText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  finalCard: { alignItems: 'center', paddingTop: 24 },
  createBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, alignItems: 'center', alignSelf: 'stretch' },
});

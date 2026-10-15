import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWorldKitTokens, WorldKitTokens } from '../../../constants/worldKitTokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { kt } from '../worlds/kit';
import { invalidatePowerLeaderboardCache, invalidateStrengthLeaderboardCache } from '../../lib/leaderboard';
import {
  acceptReset, acknowledgeHold, appealHold, clearFairPlay, closeFairPlaySheet, describeFlag, FairPlayHold, openFairPlaySheet, refreshFairPlay,
  revealAfterInactivity, useFairPlay,
} from '../../services/FairPlayService';
import { ltr, t as tr } from '../../i18n';

/*
 * Fair Play notice (docs/features/FAIR_PLAY_MODERATION_PLAN.md, step 4).
 * Opens by itself for a new review (until acknowledged) and for an
 * inactivity hide (until the athlete taps to show themselves again);
 * Settings → Leaderboard review reopens it. Mounted once, in the tabs layout.
 */
export function FairPlayNotice() {
  const { profile } = useAuth();
  const { status, sheetOpen } = useFairPlay();

  // Check on sign-in and whenever the app comes back to the foreground.
  useEffect(() => {
    // A new account never sees the previous one's status.
    clearFairPlay();
    if (!profile?.id) return;
    const check = async () => {
      const s = await refreshFairPlay();
      if (s?.holds.some(h => (h.reason === 'fair_play' && !h.acknowledged_at) || h.reason === 'inactive')) openFairPlaySheet();
    };
    check();
    const sub = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => sub.remove();
  }, [profile?.id]);

  const holds = status?.holds ?? [];
  const visible = sheetOpen && holds.length > 0;

  const close = () => {
    // "Not now": the review notices count as seen (they stay in Settings).
    holds.filter(h => h.reason === 'fair_play' && !h.acknowledged_at).forEach(h => { acknowledgeHold(h.id).catch(() => {}); });
    closeFairPlaySheet();
    refreshFairPlay();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      {visible && <Sheet holds={holds} strikes={status?.strikes ?? 0} onClose={close} />}
    </Modal>
  );
}

function Sheet({ holds, strikes, onClose }: { holds: FairPlayHold[]; strikes: number; onClose: () => void }) {
  const { mode } = useTheme();
  const t = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: mode === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.42)' }}>
      <View style={{ maxHeight: '88%', backgroundColor: mode === 'dark' ? '#0b0b0b' : '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: t.border, paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.borderStrong }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
          {holds.map(h => <HoldCard key={h.id} t={t} hold={h} strikes={strikes} />)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => ({ height: 48, marginHorizontal: 22, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={kt('medium', 14, t.textMuted, 1)}>{tr('fairPlay.notNow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HoldCard({ t, hold, strikes }: { t: WorldKitTokens; hold: FairPlayHold; strikes: number }) {
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');

  const after = async () => {
    invalidateStrengthLeaderboardCache();
    invalidatePowerLeaderboardCache();
    await Promise.all([refreshFairPlay(), refreshProfile()]);
  };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await after(); }
    catch (err) { console.warn('Fair Play action failed:', err); Alert.alert(tr('fairPlay.failed')); }
    finally { setBusy(false); }
  };

  const scope = tr(`fairPlay.scope.${hold.scope}`);

  // Back after an inactivity hide: one tap.
  if (hold.reason === 'inactive') {
    return (
      <View style={{ gap: 10 }}>
        <Text style={kt('bold', 24, t.text, 1, 30)}>{tr('fairPlay.welcomeBack')}</Text>
        <Text style={kt('regular', 14, t.textSecondary, 0, 21)}>{tr('fairPlay.inactiveBody')}</Text>
        <PrimaryButton t={t} label={tr('fairPlay.showMeAgain')} busy={busy} onPress={() => run(() => revealAfterInactivity(hold.id))} />
      </View>
    );
  }

  const permanent = hold.status === 'permanent';
  const appeal = hold.appeal;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: permanent ? '#3a1414' : t.tint, borderWidth: 1, borderColor: permanent ? '#7a2a2a' : t.border }}>
        <Text style={kt('semibold', 10.5, permanent ? '#ff8a8a' : t.accentText, 1.6)}>{permanent ? tr('fairPlay.scope.permanent') : scope}</Text>
      </View>
      <Text style={kt('bold', 22, t.text, 0.6, 28)}>{tr(permanent ? 'fairPlay.permanentTitle' : 'fairPlay.reviewTitle')}</Text>
      <Text style={kt('regular', 14, t.textSecondary, 0, 21)}>
        {permanent ? tr('fairPlay.permanentBody') : tr('fairPlay.reviewBody', { scope })}
      </Text>

      {hold.flags.length > 0 && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: t.border, padding: 12, gap: 6 }}>
          <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('fairPlay.flaggedResults')}</Text>
          {hold.flags.map((f, i) => (
            <Text key={i} style={[kt('medium', 14, t.text, 0.2), { writingDirection: 'ltr', textAlign: 'left' }]}>{ltr(`• ${describeFlag(f)}`)}</Text>
          ))}
        </View>
      )}

      {!!hold.admin_note && (
        <Text style={kt('regular', 13.5, t.textSecondary, 0, 20)}>{tr('fairPlay.adminNote', { note: hold.admin_note })}</Text>
      )}
      {hold.counts_as_strike && <Text style={kt('semibold', 13, t.accentText, 0.4, 19)}>{tr('fairPlay.strike')}</Text>}
      {!permanent && strikes > 0 && <Text style={kt('regular', 13, t.textSecondary, 0, 19)}>{tr('fairPlay.strikeWarning')}</Text>}

      {appeal && (
        <View style={{ borderRadius: 14, backgroundColor: t.tint, padding: 12, gap: 4 }}>
          <Text style={kt('semibold', 13, t.text, 0.4)}>
            {tr(appeal.status === 'pending' ? 'fairPlay.appealPending' : 'fairPlay.appealRejected')}
          </Text>
          {!!appeal.admin_reply && <Text style={kt('regular', 13, t.textSecondary, 0, 19)}>{tr('fairPlay.reply', { reply: appeal.admin_reply })}</Text>}
        </View>
      )}

      {/* The ways forward. */}
      {!permanent && (
        <PrimaryButton
          t={t}
          label={tr('fairPlay.acceptReset')}
          busy={busy}
          onPress={() => Alert.alert(tr('fairPlay.resetTitle'), tr('fairPlay.resetBody'), [
            { text: tr('common.cancel'), style: 'cancel' },
            { text: tr('fairPlay.resetConfirm'), style: 'destructive', onPress: () => run(() => acceptReset(hold.id)) },
          ])}
        />
      )}
      {!appeal && !writing && (
        <Pressable accessibilityRole="button" onPress={() => setWriting(true)} style={({ pressed }) => ({ height: 46, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Text style={kt('semibold', 14, t.text, 1)}>{tr('fairPlay.sendNote')}</Text>
        </Pressable>
      )}
      {!appeal && writing && (
        <View style={{ gap: 8 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder={tr('fairPlay.notePlaceholder')}
            placeholderTextColor={t.textFaint}
            style={{ minHeight: 90, borderRadius: 12, borderWidth: 1, borderColor: t.borderStrong, padding: 12, color: t.text, textAlignVertical: 'top', fontSize: 14 }}
          />
          <PrimaryButton t={t} label={tr('fairPlay.send')} busy={busy} disabled={note.trim().length === 0} onPress={() => run(() => appealHold(hold.id, note.trim()))} />
          <Text style={kt('regular', 12, t.textMuted, 0, 17)}>{tr('fairPlay.noteHint')}</Text>
        </View>
      )}
    </View>
  );
}

function PrimaryButton({ t, label, busy, disabled, onPress }: { t: WorldKitTokens; label: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => ({ height: 50, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
    >
      {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={kt('bold', 14.5, t.onAccent, 1.4)}>{label}</Text>}
    </Pressable>
  );
}

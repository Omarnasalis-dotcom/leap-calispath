import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeMutation } from '../../hooks/useSafeMutation';
import { LeapLogo } from '../LeapLogo';
import { getMyCommunity, createCommunity, joinCommunity, leaveCommunity, formatCommunityError, MyCommunity } from '../../lib/community';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { useTutorial } from '../../contexts/TutorialContext';
import { WORLD_THEMES, WORLD_NEUTRALS, worldRgba } from '../../../constants/worldThemes';

const W = WORLD_THEMES.strength;
const NAME_MAX = 30;

// Auto-generated join code (design handoff): the user never invents their own
// code — it's generated (prefix from the community name, else LEAP, plus 4
// digits) with a Shuffle control to regenerate. Ambiguous chars (0/1) are
// excluded from the digit pool.
function generateJoinCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = (letters.slice(0, 4) || 'LEAP').padEnd(4, 'X');
  const digits = '23456789';
  let s = prefix;
  for (let i = 0; i < 4; i++) s += digits[Math.floor(Math.random() * digits.length)];
  return s;
}

interface CommunitySectionProps {
  userId: string;
  scrollRef?: React.RefObject<ScrollView | null>;
}

export function CommunitySection({ userId, scrollRef }: CommunitySectionProps) {
  const { theme } = useTheme();
  // profile.community_id (AuthContext) is what every leaderboard's PUBLIC/
  // MY COMMUNITY toggle actually reads — refreshing only this component's
  // own local `community` state would update the status card here but
  // leave every other screen's toggle stale until the next full profile
  // reload. refreshProfile() propagates the new community_id everywhere
  // that reads useAuth() in one shot.
  const { refreshProfile } = useAuth();
  const [community, setCommunity] = useState<MyCommunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState(() => generateJoinCode(''));
  const [joinCode, setJoinCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const { safeMutate, isMutating } = useSafeMutation();
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref: createButtonRef, onLayout: onCreateButtonLayout } = useTutorialTarget('community.createButton', scrollRef, true);
  const { ref: joinButtonRef, onLayout: onJoinButtonLayout } = useTutorialTarget('community.joinButton', scrollRef, true);
  const { requestRemeasure } = useTutorial();

  const canCreate = createName.trim().length > 0;

  const refresh = async () => {
    setLoading(true);
    const c = await getMyCommunity(userId);
    setCommunity(c);
    setLoading(false);
  };

  // This section renders nothing until its own fetch resolves (see the
  // `if (loading) return null` below) — that pop-in shifts whatever's
  // beneath it (e.g. the MY WORKOUT PROGRAM button), which a tutorial
  // target measured before this finished would miss entirely. Nudge a
  // re-measure once this actually settles instead of guessing a delay.
  useEffect(() => {
    if (!loading) requestAnimationFrame(requestRemeasure);
  }, [loading, requestRemeasure]);

  useEffect(() => {
    if (userId) refresh();
  }, [userId]);

  const openCreateModal = () => {
    setFormError(null);
    setCreateName('');
    setCreateCode(generateJoinCode(''));
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!canCreate) return;
    await safeMutate(async () => {
      const result = await createCommunity(createName, createCode);
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        setShowCreateModal(false);
        setCreateName('');
        setCreateCode(generateJoinCode(''));
        await Promise.all([refresh(), refreshProfile?.()]);
      },
      onError: (err) => {
        setFormError(err.message);
        // A code collision is recoverable without user thought — the code is
        // machine-generated, so just deal a fresh one for the retry.
        if (/join code is already in use/i.test(err.message)) {
          setCreateCode(generateJoinCode(createName));
        }
      },
      // NAME_TAKEN/CODE_TAKEN are expected, already-handled validation
      // outcomes (shown inline via formError), not bugs — skip the
      // console.error that otherwise triggers a dev-mode redbox on-device.
      skipConsoleError: true,
    });
  };

  const handleJoin = async () => {
    setFormError(null);
    if (!joinCode.trim()) {
      setFormError('Enter a join code.');
      return;
    }
    await safeMutate(async () => {
      const result = await joinCommunity(joinCode);
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        setShowJoinModal(false);
        setJoinCode('');
        await Promise.all([refresh(), refreshProfile?.()]);
      },
      onError: (err) => setFormError(err.message),
      // CODE_NOT_FOUND is an expected, already-handled validation outcome
      // (shown inline via formError) — not a bug. A mistyped code is the
      // most common way through this path, so it shouldn't look like a
      // crash on-device.
      skipConsoleError: true,
    });
  };

  const handleLeave = async () => {
    await safeMutate(async () => {
      const result = await leaveCommunity();
      if (!result.success) return { error: new Error(formatCommunityError(result.error)) };
      return { data: result, error: null };
    }, {
      onSuccess: async () => {
        await Promise.all([refresh(), refreshProfile?.()]);
      },
    });
  };

  const confirmLeave = () => {
    const warning = `You'll lose access to ${community?.name || 'this community'}'s leaderboards until you rejoin with a code.`;
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) handleLeave();
    } else {
      Alert.alert('LEAVE COMMUNITY?', warning, [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'LEAVE', style: 'destructive', onPress: handleLeave },
      ]);
    }
  };

  if (loading) return null;

  return (
    <View style={{ marginTop: 18 }}>
      {community ? (
        <View style={styles.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>MY COMMUNITY</Text>
            <Text style={styles.statusName} numberOfLines={1}>
              {community.name.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity onPress={confirmLeave} disabled={isMutating} style={styles.leaveBtn}>
            {isMutating ? <LeapLogo size={18} animated /> : (
              <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 12, letterSpacing: 1 }}>LEAVE</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            ref={createButtonRef}
            onLayout={onCreateButtonLayout}
            style={styles.createBtn}
            onPress={openCreateModal}
          >
            <MaterialCommunityIcons name="account-group-outline" size={15} color="rgba(255,255,255,0.7)" />
            <Text style={styles.createBtnText}>CREATE COMMUNITY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            ref={joinButtonRef}
            onLayout={onJoinButtonLayout}
            style={[styles.joinBtn, { backgroundColor: W.accent }]}
            onPress={() => { setFormError(null); setShowJoinModal(true); }}
          >
            <MaterialCommunityIcons name="login" size={15} color={W.ctaText} />
            <Text style={[styles.joinBtnText, { color: W.ctaText }]}>JOIN COMMUNITY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CREATE MODAL — bottom sheet (design handoff) */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { borderColor: worldRgba(W.accent, 0.25) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>CREATE COMMUNITY</Text>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={WORLD_NEUTRALS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>COMMUNITY NAME</Text>
              <Text style={styles.fieldCounter}>{createName.length}/{NAME_MAX}</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g. Iron Warriors Gym"
              placeholderTextColor={WORLD_NEUTRALS.textMuted}
              value={createName}
              onChangeText={(t) => setCreateName(t.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
            />

            <View style={[styles.fieldLabelRow, { marginTop: 20 }]}>
              <Text style={styles.fieldLabel}>JOIN CODE</Text>
            </View>
            {/* Read-only auto-generated code + Shuffle — the user never has
                to invent a unique code themselves (handoff's key fix). */}
            <View style={styles.codeRow}>
              <Text style={[styles.codeText, { color: W.accent }]}>{createCode}</Text>
              <TouchableOpacity
                style={styles.shuffleBtn}
                onPress={() => setCreateCode(generateJoinCode(createName))}
              >
                <MaterialCommunityIcons name="refresh" size={14} color={W.accent} />
                <Text style={[styles.shuffleText, { color: W.accent }]}>SHUFFLE</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              Generated automatically — share it with people you want to join. It can't be changed after you create the community.
            </Text>

            {formError && <Text style={styles.errorText}>{formError.toUpperCase()}</Text>}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                canCreate ? { backgroundColor: W.accent } : styles.submitBtnDisabled,
              ]}
              onPress={handleCreate}
              disabled={!canCreate || isMutating}
            >
              {isMutating ? <LeapLogo size={24} animated /> : (
                <Text style={[styles.submitBtnText, { color: canCreate ? W.ctaText : 'rgba(255,255,255,0.3)' }]}>CREATE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* JOIN MODAL — same bottom-sheet pattern */}
      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { borderColor: worldRgba(W.accent, 0.25) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>JOIN COMMUNITY</Text>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setShowJoinModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={WORLD_NEUTRALS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>JOIN CODE</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Enter the code you were given"
              placeholderTextColor={WORLD_NEUTRALS.textMuted}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              maxLength={20}
            />

            {formError && <Text style={styles.errorText}>{formError.toUpperCase()}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: W.accent }]}
              onPress={handleJoin}
              disabled={isMutating}
            >
              {isMutating ? <LeapLogo size={24} animated /> : (
                <Text style={[styles.submitBtnText, { color: W.ctaText }]}>JOIN</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 13,
    padding: 14,
  },
  statusLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: WORLD_NEUTRALS.textCaption,
    marginBottom: 2,
  },
  statusName: {
    fontSize: 15,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 0.5,
    color: WORLD_NEUTRALS.textPrimary,
  },
  leaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  createBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.border,
    borderRadius: 13,
  },
  createBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  joinBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
  },
  joinBtnText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#0e0908',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  sheetTitle: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
    color: WORLD_NEUTRALS.textPrimary,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: WORLD_NEUTRALS.textCaption,
  },
  fieldCounter: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    color: WORLD_NEUTRALS.textMuted,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: WORLD_NEUTRALS.textPrimary,
  },
  codeRow: {
    height: 50,
    borderWidth: 1.5,
    borderColor: WORLD_NEUTRALS.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 17,
    letterSpacing: 2,
  },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingLeft: 8,
  },
  shuffleText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  hint: {
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.4)',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  submitBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 2,
  },
});

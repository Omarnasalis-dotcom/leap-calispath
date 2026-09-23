import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeaderboardService } from '../../services/LeaderboardService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeMutation } from '../../hooks/useSafeMutation';
import { LeapLogo } from '../LeapLogo';
import { getMyCommunity, getCommunityById, getMyCommunityJoinCode, createCommunity, joinCommunity, leaveCommunity, formatCommunityError, MyCommunity } from '../../lib/community';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { useTutorial } from '../../contexts/TutorialContext';
import { WORLD_THEMES, getWorldNeutrals, worldRgba } from '../../../constants/worldThemes';

const W = WORLD_THEMES.strength;
const NAME_MAX = 30;
const LEADER_GOLD = '#FFD700';

// Rank within the community's WRA leaderboard. The RPC only returns members
// with points (and at most 100), so this is "ranked members", never a
// member count.
type CommunityRank = { rank: number | null; ranked: number };

// Session-lifetime caches, keyed by community id. Profile and Strength share
// one route and ProfileScreen unmounts this section when switching between
// them, so without these every tab switch re-showed the loading skeleton and
// refetched. Remounts now render the last-known values instantly and
// refresh quietly in the background.
const communityCache = new Map<string, MyCommunity>();
const rankCache = new Map<string, CommunityRank>();

interface CommunitySectionProps {
  userId: string;
  // profile.community_id, passed down from AuthContext — already known by
  // the time this mounts, so the initial fetch can skip straight to the
  // community-name lookup instead of re-deriving community_id itself. null
  // means "no fetch needed at all", so this renders immediately with the
  // rest of the profile screen instead of popping in after it.
  communityId: string | null | undefined;
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Opens the WRA leaderboard scoped to this community. */
  onOpenCommunityLeaderboard?: () => void;
}

export function CommunitySection({ userId, communityId, scrollRef, onOpenCommunityLeaderboard }: CommunitySectionProps) {
  const { theme, mode } = useTheme();
  const neutrals = getWorldNeutrals(mode);
  const subtleOverlay = mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const subtleOverlayStrong = mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  // profile.community_id (AuthContext) is what every leaderboard's PUBLIC/
  // MY COMMUNITY toggle actually reads — refreshing only this component's
  // own local `community` state would update the status card here but
  // leave every other screen's toggle stale until the next full profile
  // reload. refreshProfile() propagates the new community_id everywhere
  // that reads useAuth() in one shot.
  const { refreshProfile } = useAuth();
  const [community, setCommunity] = useState<MyCommunity | null>(
    () => (communityId ? communityCache.get(communityId) ?? null : null)
  );
  // Only true when there's actually something to fetch (the user already
  // has a community_id) — with no community yet, there's nothing async to
  // wait on, so this starts (and stays) false.
  const [loading, setLoading] = useState(!!communityId && !communityCache.has(communityId));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [leaderCode, setLeaderCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  // undefined = loading / unknown (subline hidden rather than guessing).
  const [rankInfo, setRankInfo] = useState<CommunityRank | undefined>(
    () => (communityId ? rankCache.get(communityId) : undefined)
  );
  const { safeMutate, isMutating } = useSafeMutation();
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref: createButtonRef, onLayout: onCreateButtonLayout } = useTutorialTarget('community.createButton', scrollRef, true);
  const { ref: joinButtonRef, onLayout: onJoinButtonLayout } = useTutorialTarget('community.joinButton', scrollRef, true);
  const { requestRemeasure } = useTutorial();

  const canCreate = createName.trim().length > 0 && createCode.trim().length > 0;
  const isLeader = !!community && community.created_by === userId;

  const toggleLeaderCode = async () => {
    if (leaderCode) {
      setLeaderCode(null);
      return;
    }
    if (!community) return;
    setCodeLoading(true);
    const code = await getMyCommunityJoinCode(community.id);
    setLeaderCode(code);
    setCodeLoading(false);
  };

  const refresh = async () => {
    setLoading(true);
    const c = await getMyCommunity(userId);
    if (c) communityCache.set(c.id, c);
    setCommunity(c);
    setLeaderCode(null);
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

  // Initial load uses the communityId already handed down from
  // AuthContext — skips getMyCommunity's redundant profiles.community_id
  // lookup entirely when there's no community (the common case), and goes
  // straight to the single communities-table query when there is one.
  useEffect(() => {
    if (!communityId) {
      setCommunity(null);
      setLoading(false);
      return;
    }
    // Cached: show it now, no skeleton; the fetch below just refreshes it.
    const cached = communityCache.get(communityId);
    if (cached) {
      setCommunity(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    getCommunityById(communityId).then((c) => {
      if (!cancelled) {
        if (c) communityCache.set(c.id, c);
        // A failed refresh keeps the cached community instead of blanking it.
        if (c || !cached) setCommunity(c);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [communityId]);

  useEffect(() => {
    // Keep the cached rank on screen while refreshing; only blank it when
    // there's nothing known for this community yet.
    setRankInfo(community?.id ? rankCache.get(community.id) : undefined);
    if (!community?.id) return;
    const id = community.id;
    let cancelled = false;
    LeaderboardService.getGlobalWellRoundedLeaderboard(userId, community.id).then((entries) => {
      if (cancelled) return;
      // The service returns [] on error too — indistinguishable from an
      // empty board, so an empty result shows nothing instead of a claim.
      if (entries.length === 0) return;
      const me = entries.find((e) => e.user_id === userId);
      const info = { rank: me?.rank ?? null, ranked: entries.length };
      rankCache.set(id, info);
      setRankInfo(info);
    });
    return () => { cancelled = true; };
  }, [community?.id, userId]);

  const openCreateModal = () => {
    setFormError(null);
    setCreateName('');
    setCreateCode('');
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
        setCreateCode('');
        await Promise.all([refresh(), refreshProfile?.()]);
      },
      onError: (err) => setFormError(err.message),
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

  // loading is only ever true when communityId is already known to exist
  // (see the mount effect above), so the statusCard shape — not the
  // create/join buttons — is the correct skeleton: it reserves the same
  // height the real card will occupy, instead of the section popping in
  // and shifting everything below it once the name arrives.
  if (loading) {
    return (
      <View style={{ marginTop: 8 }}>
        <View style={[styles.statusCard, { borderColor: neutrals.border, backgroundColor: subtleOverlay, opacity: 0.5 }]}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={neutrals.textSecondary} />
          <View style={styles.nameWrap} />
          <LeapLogo size={16} animated />
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      {community ? (
        // One slim row: whole row opens the community leaderboard; the key
        // (leader) and leave icons are their own nested buttons.
        <TouchableOpacity
          style={[styles.statusCard, { borderColor: neutrals.border, backgroundColor: subtleOverlay }]}
          activeOpacity={0.7}
          disabled={!onOpenCommunityLeaderboard}
          onPress={onOpenCommunityLeaderboard}
          accessibilityRole="button"
          accessibilityLabel={`${community.name} community${rankInfo?.rank ? `, rank ${rankInfo.rank} of ${rankInfo.ranked}` : ''}. Open community leaderboard`}
        >
          <MaterialCommunityIcons name="account-group-outline" size={18} color={neutrals.textSecondary} />
          <View style={styles.nameWrap}>
            <Text style={[styles.statusName, { color: neutrals.textPrimary }]} numberOfLines={1}>
              {community.name.toUpperCase()}
            </Text>
            {isLeader && <MaterialCommunityIcons name="crown" size={12} color={LEADER_GOLD} />}
          </View>

          {/* Pill: join code while the leader has it revealed, else rank. */}
          {isLeader && leaderCode ? (
            <View style={[styles.pill, { backgroundColor: subtleOverlayStrong }]}>
              <Text style={[styles.pillCode, { color: neutrals.textPrimary }]}>{leaderCode}</Text>
            </View>
          ) : rankInfo ? (
            <View style={[styles.pill, { backgroundColor: subtleOverlayStrong }]}>
              <Text style={[styles.pillText, { color: neutrals.textSecondary }]}>
                {rankInfo.rank ? `#${rankInfo.rank} of ${rankInfo.ranked}${rankInfo.ranked >= 100 ? '+' : ''}` : 'UNRANKED'}
              </Text>
            </View>
          ) : null}

          {isLeader && (
            <TouchableOpacity
              onPress={toggleLeaderCode}
              disabled={codeLoading}
              style={styles.iconBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={leaderCode ? 'Hide join code' : 'Show join code'}
            >
              {codeLoading ? <LeapLogo size={14} animated /> : (
                <MaterialCommunityIcons name={leaderCode ? 'eye-off-outline' : 'key-outline'} size={16} color={neutrals.textMuted} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={confirmLeave}
            disabled={isMutating}
            style={[styles.iconBtn, { marginRight: -5 }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Leave community"
          >
            {isMutating ? <LeapLogo size={14} animated /> : (
              <MaterialCommunityIcons name="logout" size={16} color={neutrals.textMuted} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      ) : (
        // Same slim row shape as the joined state, with the two actions as
        // compact pills on the right.
        <View style={[styles.statusCard, { borderColor: neutrals.border, backgroundColor: subtleOverlay }]}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={neutrals.textSecondary} />
          <View style={styles.nameWrap}>
            <Text style={[styles.statusName, { color: neutrals.textPrimary }]} numberOfLines={1}>COMMUNITY</Text>
          </View>
          <TouchableOpacity
            ref={createButtonRef}
            onLayout={onCreateButtonLayout}
            style={[styles.actionPill, { borderColor: neutrals.border, borderWidth: 1 }]}
            onPress={openCreateModal}
            accessibilityRole="button"
            accessibilityLabel="Create community"
          >
            <MaterialCommunityIcons name="plus" size={13} color={neutrals.textPrimary} />
            <Text style={[styles.actionPillText, { color: neutrals.textPrimary }]}>CREATE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            ref={joinButtonRef}
            onLayout={onJoinButtonLayout}
            style={[styles.actionPill, { backgroundColor: W.accent, marginRight: -4 }]}
            onPress={() => { setFormError(null); setShowJoinModal(true); }}
            accessibilityRole="button"
            accessibilityLabel="Join community"
          >
            <MaterialCommunityIcons name="login" size={13} color="#FFFFFF" />
            <Text style={[styles.actionPillText, { color: '#FFFFFF' }]}>JOIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CREATE MODAL — bottom sheet (design handoff) */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { borderColor: worldRgba(W.accent, 0.25), backgroundColor: theme.background.primary }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: neutrals.textPrimary }]}>CREATE COMMUNITY</Text>
              <TouchableOpacity style={[styles.sheetClose, { backgroundColor: subtleOverlayStrong }]} onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={neutrals.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: neutrals.textCaption }]}>COMMUNITY NAME</Text>
              <Text style={[styles.fieldCounter, { color: neutrals.textMuted }]}>{createName.length}/{NAME_MAX}</Text>
            </View>
            <TextInput
              style={[styles.input, { borderColor: neutrals.borderStrong, color: neutrals.textPrimary }]}
              placeholder="e.g. Iron Warriors Gym"
              placeholderTextColor={neutrals.textMuted}
              value={createName}
              onChangeText={(t) => setCreateName(t.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
            />

            <View style={[styles.fieldLabelRow, { marginTop: 20 }]}>
              <Text style={[styles.fieldLabel, { color: neutrals.textCaption }]}>JOIN CODE</Text>
            </View>
            <View style={[styles.codeRow, { borderColor: neutrals.borderStrong }]}>
              <TextInput
                style={[styles.codeInput, { color: W.accent }]}
                value={createCode}
                onChangeText={(t) => setCreateCode(t.toUpperCase().slice(0, 20))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                placeholder="e.g. IRONWARRIORS"
                placeholderTextColor={neutrals.textMuted}
              />
            </View>
            <Text style={[styles.hint, { color: neutrals.textMuted }]}>
              Pick a code and share it with people you want to join. As the community leader, you can view it
              again anytime from your profile.
            </Text>

            {formError && <Text style={styles.errorText}>{formError.toUpperCase()}</Text>}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                canCreate ? { backgroundColor: W.accent } : { backgroundColor: subtleOverlayStrong },
              ]}
              onPress={handleCreate}
              disabled={!canCreate || isMutating}
            >
              {isMutating ? <LeapLogo size={24} animated /> : (
                <Text style={[styles.submitBtnText, { color: canCreate ? W.ctaText : neutrals.textMuted }]}>CREATE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* JOIN MODAL — same bottom-sheet pattern */}
      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { borderColor: worldRgba(W.accent, 0.25), backgroundColor: theme.background.primary }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: neutrals.textPrimary }]}>JOIN COMMUNITY</Text>
              <TouchableOpacity style={[styles.sheetClose, { backgroundColor: subtleOverlayStrong }]} onPress={() => setShowJoinModal(false)}>
                <MaterialCommunityIcons name="close" size={18} color={neutrals.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: neutrals.textCaption }]}>JOIN CODE</Text>
            </View>
            <TextInput
              style={[styles.input, { borderColor: neutrals.borderStrong, color: neutrals.textPrimary }]}
              placeholder="Enter the code you were given"
              placeholderTextColor={neutrals.textMuted}
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
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusName: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 0.5,
  },
  pill: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 999,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  pillCode: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 12,
    letterSpacing: 1.8,
  },
  iconBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  actionPillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
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
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  },
  fieldCounter: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  codeRow: {
    height: 50,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeInput: {
    flex: 1,
    height: '100%',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 17,
    letterSpacing: 2,
    paddingVertical: 0,
  },
  codeText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 17,
    letterSpacing: 2,
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
  submitBtnText: {
    fontSize: 15,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 2,
  },
});

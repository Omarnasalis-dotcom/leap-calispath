import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorldKitTokens, WorldKitTokens, WORLD_FONTS } from '../../../constants/worldKitTokens';
import { getCompletedTrialTiers, getTierLeaderboard, LeaderboardEntry } from '../../lib/leaderboard';
import { getCountryCode } from '../../constants/countries';
import { initials } from '../../lib/worldStanding';
import {
  cardStats, climbPercent, fmtTime, isBehind, MAX_STRENGTH_TIER, TIER_COUNT, tierBarFill, tierCaption, tierName,
  tierStatus, TierStatus, warriorsLabel,
} from '../../lib/strengthClimb';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { useMountedRef } from '../../hooks/useMountedRef';
import { SkillCarousel } from '../worlds/SkillCarousel';
import {
  BoardFilters, filterByGender, KIT_EASE, kt, rankColor, WorldPage, WorldSheet, YouBadge, Gender, Scope,
} from '../worlds/kit';
import { t as tr, isArabic } from '../../i18n';

interface Props {
  profile: any;
  /** Progression trial when tier is undefined, practice for a lower tier. */
  onStartTrial: (tier?: number) => void;
  /** Tapping the centred card's tier name → the existing Tier Details modal. */
  onShowTierDetails: (tier: number) => void;
}

const TIERS = Array.from({ length: TIER_COUNT }, (_, i) => i);

/** Strength-only colours (handoff tokens) with a derived light variant. */
function climbColors(t: WorldKitTokens) {
  const dark = t.mode === 'dark';
  return {
    green: dark ? '#4CC38A' : '#1E8A56',
    greenBorder: dark ? 'rgba(76,195,138,0.45)' : 'rgba(30,138,86,0.45)',
    cardCurrentBg: t.tint,
    cardCurrentBorder: `${t.accent}73`,
    cardBg: dark ? '#0d0d0d' : '#FFFFFF',
    cardDoneBorder: dark ? '#1f1f1f' : t.border,
    cardLockedBorder: dark ? '#181818' : t.emptyRowBorder,
    divider: dark ? '#1f1f1f' : t.border,
    ghostCurrent: dark ? 'rgba(252,84,84,0.22)' : 'rgba(252,84,84,0.28)',
    ghostOther: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    lockedName: dark ? '#5a5a5a' : '#A2A2AA',
    lockedBtnBg: dark ? '#141414' : t.button,
    outlineBtn: dark ? '#3a3a3a' : t.borderStrong,
    dotDoneBg: dark ? '#1a1a1a' : '#EDEDF0',
    dotDoneText: dark ? '#e6e6e6' : t.textSecondary,
    dotLockedBg: dark ? '#000000' : '#FFFFFF',
    dotLockedBorder: dark ? '#222222' : t.border,
    avatarBg: dark ? '#141414' : t.button,
    podiumFirst: dark ? ['#1c1710', '#0c0c0c'] : ['#FFF3D6', '#FFFFFF'],
    podiumOther: dark ? ['#161616', '#0c0c0c'] : ['#EFEFF2', '#FFFFFF'],
    dashed: dark ? '#2a2a2a' : t.borderStrong,
  } as const;
}

const NO_ENTRIES: LeaderboardEntry[] = [];

export function StrengthClimbView({ profile, onStartTrial, onShowTierDetails }: Props) {
  const { mode } = useTheme();
  // Memoized so the tier cards (React.memo) only re-render when their own
  // props change, not on every swipe.
  const t = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const c = useMemo(() => climbColors(t), [t]);
  const isMounted = useMountedRef();
  const scrollRef = useRef<ScrollView>(null);
  const userId: string | undefined = profile?.id;
  const currentTier = Math.min(MAX_STRENGTH_TIER, Math.max(0, profile?.strength_tier ?? 0));

  const [selected, setSelected] = useState(currentTier);
  useEffect(() => { setSelected(currentTier); }, [currentTier]);

  // Public boards for every tier (card stats show all ten at once).
  const [boards, setBoards] = useState<(LeaderboardEntry[] | null)[]>(() => TIERS.map(() => null));
  const [communityBoard, setCommunityBoard] = useState<{ tier: number; entries: LeaderboardEntry[] } | null>(null);
  // Tiers you've completed a trial on yourself; tiers below yours that
  // aren't in here were placed by the onboarding assessment.
  const [completedTiers, setCompletedTiers] = useState<Set<number> | undefined>(undefined);
  const [scope, setScope] = useState<Scope>('public');
  const [gender, setGender] = useState<Gender>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  // Page scrolling is off while a tier card is being swiped (see SkillCarousel).
  const [swiping, setSwiping] = useState(false);

  const loadBoards = useCallback(async () => {
    if (!userId) return;
    const results = await Promise.all(TIERS.map(tier =>
      getTierLeaderboard(tier, userId, null).then(r => r.entries).catch(() => null)));
    if (isMounted.current) setBoards(prev => results.map((r, i) => r ?? prev[i]));
  }, [userId, isMounted]);

  const loadCompleted = useCallback(async () => {
    if (!userId) return;
    // null = the lookup failed: keep what we had (undefined reads as
    // 'complete'), never mark real passes as PLACED because of a blip.
    const tiers = await getCompletedTrialTiers(userId).catch(() => null);
    if (tiers && isMounted.current) setCompletedTiers(tiers);
  }, [userId, isMounted]);

  useFocusEffect(useCallback(() => { loadBoards(); loadCompleted(); }, [loadBoards, loadCompleted]));

  useEffect(() => {
    if (scope !== 'community' || !userId || !profile?.community_id) return;
    let live = true;
    getTierLeaderboard(selected, userId, profile.community_id)
      .then(r => { if (live && isMounted.current) setCommunityBoard({ tier: selected, entries: r.entries }); })
      .catch(() => {});
    return () => { live = false; };
  }, [scope, selected, userId, profile?.community_id, isMounted]);

  const selectedStatus = tierStatus(selected, currentTier, completedTiers);
  const source = scope === 'community'
    ? (communityBoard?.tier === selected ? communityBoard.entries : null)
    : boards[selected];
  const list = useMemo(() => filterByGender(
    (source ?? []).map(e => ({ user_id: e.user_id, name: e.display_name, points: e.best_time_seconds, country: e.country, gender: e.gender })),
    gender,
  ), [source, gender]);
  const loading = source == null;

  // Mount animations: bars, climb fill and podium grow from zero after 120ms.
  const drawn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(drawn, { toValue: 1, duration: 900, delay: 120, easing: KIT_EASE, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [drawn]);

  const { ref: trialButtonRef, onLayout: onTrialButtonLayout } = useTutorialTarget('strength.trialButton', scrollRef, true);
  // Tour targets for the redesigned screen: the tier cards replaced the old
  // tier chips, and the podium replaced the first leaderboard row.
  const { ref: tierCardsRef, onLayout: onTierCardsLayout } = useTutorialTarget('strength.tierChips', scrollRef, true);
  const { ref: podiumRef, onLayout: onPodiumLayout } = useTutorialTarget('strength.leaderboardFirstRow', scrollRef, true);

  // Stable handlers for the memoized cards; the latest props are read at
  // press time.
  const onStartTrialRef = useRef(onStartTrial);
  onStartTrialRef.current = onStartTrial;
  const onShowTierDetailsRef = useRef(onShowTierDetails);
  onShowTierDetailsRef.current = onShowTierDetails;
  const startTrialFor = useCallback((tier: number) => {
    onStartTrialRef.current(tier < currentTier ? tier : undefined);
  }, [currentTier]);
  const showDetailsFor = useCallback((tier: number) => onShowTierDetailsRef.current(tier), []);

  return (
    <WorldPage tokens={t}>
      <ClimbHeader tokens={t} />
      <ScrollView ref={scrollRef} scrollEnabled={!swiping} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ marginTop: 14 }}>
          <SkillCarousel
            count={TIER_COUNT}
            index={selected}
            onIndexChange={setSelected}
            // Arabic lines (Cairo) are taller; the fixed card needs the room
            // or the start-trial button spills over its bottom edge.
            cardHeight={isArabic ? 380 : 336}
            maxCardWidth={318}
            inactiveOpacity={0.45}
            containerRef={tierCardsRef}
            onContainerLayout={onTierCardsLayout}
            swipeHintKey="strength"
            onSwipingChange={setSwiping}
            renderCard={(tier, active) => (
              <TierCard
                tokens={t}
                colors={c}
                tier={tier}
                currentTier={currentTier}
                completedTiers={completedTiers}
                active={active}
                entries={boards[tier] ?? NO_ENTRIES}
                userId={userId}
                drawn={drawn}
                onPress={startTrialFor}
                onShowDetails={showDetailsFor}
                buttonRef={tier === currentTier ? trialButtonRef : undefined}
                onButtonLayout={tier === currentTier ? onTrialButtonLayout : undefined}
              />
            )}
          />
        </View>

        <ClimbLine tokens={t} colors={c} currentTier={currentTier} completedTiers={completedTiers} selected={selected} onSelect={setSelected} drawn={drawn} />

        <View style={{ paddingTop: 30, paddingHorizontal: 24, paddingBottom: 28, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={kt('semibold', 19, t.text, 2)}>{tr('strength.leaderboardTitle', { tier: tierName(selected) })}</Text>
            <Text style={kt('medium', 12, t.textMuted, 1.4)}>{loading ? ' ' : warriorsLabel(list.length)}</Text>
          </View>
          <BoardFilters
            tokens={t}
            inCommunity={!!profile?.community_id}
            scope={scope}
            onScope={setScope}
            gender={gender}
            onGender={setGender}
          />

          {list.length > 0 ? (
            <>
              <View ref={podiumRef} onLayout={onPodiumLayout} collapsable={false}>
                <Podium tokens={t} colors={c} rows={list} userId={userId} drawn={drawn} />
              </View>
              <YouRow tokens={t} colors={c} rows={list} userId={userId} status={selectedStatus} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('strength.seeFullBoard')}
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => ({ height: 48, borderRadius: 14, backgroundColor: t.pillTrack, borderWidth: 1, borderColor: c.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}
              >
                <Text style={kt('semibold', 13, t.textSecondary, 2)}>{tr('strength.seeMore')}</Text>
                <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M9 6l6 6-6 6" fill="none" stroke={t.textSecondary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              </Pressable>
            </>
          ) : loading ? (
            <Text style={[kt('medium', 13, t.textFaint, 1.2), { textAlign: 'center', paddingVertical: 24 }]}>{tr('strength.loading')}</Text>
          ) : (
            <EmptyBoard tokens={t} colors={c} />
          )}
        </View>
      </ScrollView>

      <WorldSheet
        tokens={t}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        variant="log"
        maxHeight="72%"
        title={tr('strength.leaderboardTitle', { tier: tierName(selected) })}
        titleSize={19}
        subtitle={warriorsLabel(list.length)}
      >
        <View style={{ paddingTop: 12 }}>
          {list.map((r, i) => (
            <SheetRow key={r.user_id} tokens={t} row={r} index={i} leader={list[0].points} you={r.user_id === userId} />
          ))}
        </View>
      </WorldSheet>
    </WorldPage>
  );
}

// ---------------------------------------------------------------- header

function ClimbHeader({ tokens: t }: { tokens: WorldKitTokens }) {
  // The handoff's coral "levels" button is omitted: it's visually identical
  // to the floating AI Coach button that already sits top-right here.
  return (
    <View style={{ paddingTop: 16, paddingHorizontal: 24, paddingBottom: 4 }}>
      <Text style={kt('bold', 26, t.text, 1.4, 29)}>{tr('strength.title')}</Text>
    </View>
  );
}

// ------------------------------------------------------------- tier card

type Colors = ReturnType<typeof climbColors>;

// Memoized: a swipe only re-renders the two cards whose `active` changed.
const TierCard = React.memo(function TierCard({ tokens: t, colors: c, tier, currentTier, completedTiers, active, entries, userId, drawn, onPress: onPressTier, onShowDetails: onShowDetailsTier, buttonRef, onButtonLayout }: {
  tokens: WorldKitTokens; colors: Colors; tier: number; currentTier: number; completedTiers?: ReadonlySet<number>; active: boolean;
  entries: LeaderboardEntry[]; userId?: string; drawn: Animated.Value; onPress: (tier: number) => void; onShowDetails: (tier: number) => void;
  buttonRef?: React.Ref<View>; onButtonLayout?: () => void;
}) {
  const onPress = () => onPressTier(tier);
  const onShowDetails = () => onShowDetailsTier(tier);
  const status = tierStatus(tier, currentTier, completedTiers);
  const isCurrent = status === 'current';
  const locked = status === 'locked';
  const placed = status === 'placed';
  const name = tierName(tier);
  const stats = cardStats(entries, userId, status);
  const fill = tierBarFill(status);

  const chip = isCurrent
    ? { text: tr('strength.current'), bg: t.accent, fg: t.onAccent, border: 'transparent' }
    : status === 'complete'
      ? { text: tr('strength.complete'), bg: 'transparent', fg: c.green, border: c.greenBorder }
      : placed
        // Neutral, not green: behind you, but never earned by a trial.
        ? { text: tr('strength.placed'), bg: 'transparent', fg: t.textSecondary, border: t.borderStrong }
        : { text: tr('strength.locked'), bg: 'transparent', fg: t.textDisabled, border: t.borderStrong };

  return (
    <View style={{
      flex: 1, borderRadius: 26, padding: 22, gap: 16, overflow: 'hidden',
      backgroundColor: isCurrent ? c.cardCurrentBg : c.cardBg,
      borderWidth: 1, borderColor: isCurrent ? c.cardCurrentBorder : locked ? c.cardLockedBorder : c.cardDoneBorder,
    }}>
      {/* Ghost numeral: outlined, decorative only. */}
      <Svg pointerEvents="none" width={230} height={200} style={{ position: 'absolute', right: -8, top: -26 }}>
        <SvgText
          x={222} y={168} textAnchor="end" fontSize={190} fontFamily={WORLD_FONTS.bold} letterSpacing={-4}
          fill="none" stroke={isCurrent ? c.ghostCurrent : c.ghostOther} strokeWidth={1.5}
        >
          {String(tier).padStart(2, '0')}
        </SvgText>
      </Svg>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={kt('semibold', 11, isCurrent ? t.accentText : t.textMuted, 2.2)}>{tr('strength.cardTier', { tier, max: MAX_STRENGTH_TIER })}</Text>
        <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: chip.bg, borderWidth: isCurrent ? 0 : 1, borderColor: chip.border }}>
          <Text style={kt('bold', 10.5, chip.fg, 1.6)}>{chip.text}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('strength.tierDetailsA11y', { name })}
        disabled={!active}
        onPress={onShowDetails}
        style={{ marginTop: 18, alignSelf: 'flex-start', maxWidth: '100%' }}
      >
        <Text
          style={kt('bold', name.length > 8 ? 40 : 46, locked ? c.lockedName : t.text, 1.4, name.length > 8 ? 44 : 50)}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {name}
        </Text>
      </Pressable>

      <View style={{ gap: 8 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden' }}>
          <Animated.View style={{
            height: '100%', borderRadius: 2, backgroundColor: placed ? c.outlineBtn : c.green,
            width: drawn.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${fill * 100}%`] }),
          }} />
        </View>
        <Text style={kt('regular', 12.5, isCurrent ? t.textSecondary : status === 'complete' ? c.green : placed ? t.textMuted : t.textFaint, 0.4)}>
          {tierCaption(tier, currentTier, completedTiers)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('strength.rank')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
            <Text style={kt('semibold', 26, stats.ranked ? t.text : t.textDisabled, 0, 30)}>{stats.rank}</Text>
            <Text style={kt('regular', 12, t.textFaint)} numberOfLines={1}>{stats.rankOf}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: c.divider, paddingLeft: 16 }}>
          <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('strength.gapToFirst')}</Text>
          <Text style={[kt('semibold', 26, stats.king ? t.gold : stats.ranked ? t.text : t.textDisabled, 0, 30), { marginTop: 3 }]}>{stats.gap}</Text>
        </View>
      </View>

      <View ref={buttonRef} onLayout={onButtonLayout} collapsable={false} style={{ marginTop: 'auto' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: locked || !active }}
          disabled={locked || !active}
          onPress={onPress}
          style={({ pressed }) => ({
            height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
            backgroundColor: isCurrent ? (pressed ? t.accentHover : t.accent) : locked ? c.lockedBtnBg : 'transparent',
            borderWidth: isBehind(status) ? 1.5 : 0, borderColor: c.outlineBtn,
            opacity: pressed && !isCurrent ? 0.8 : 1,
          })}
        >
          <Text style={kt('bold', 15, isCurrent ? t.onAccent : locked ? t.textDisabled : t.text, 2.4)} numberOfLines={1} adjustsFontSizeToFit>
            {isCurrent ? tr('strength.startTrial', { name }) : locked ? tr('strength.locked') : tr('strength.practice', { name })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// ------------------------------------------------------------ climb line

function ClimbLine({ tokens: t, colors: c, currentTier, completedTiers, selected, onSelect, drawn }: {
  tokens: WorldKitTokens; colors: Colors; currentTier: number; completedTiers?: ReadonlySet<number>;
  selected: number; onSelect: (i: number) => void; drawn: Animated.Value;
}) {
  const { width } = useWindowDimensions();
  const step = (width - 48 - 34) / MAX_STRENGTH_TIER;
  return (
    <View style={{ paddingTop: 22, paddingHorizontal: 24, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={kt('medium', 11, t.textMuted, 2)}>{tr('strength.yourClimb')}</Text>
        <Text style={kt('medium', 12, t.textSecondary, 1.4)}>{tr('strength.climbProgress', { tier: currentTier, max: MAX_STRENGTH_TIER, pct: climbPercent(currentTier) })}</Text>
      </View>
      <View style={{ height: 34 }}>
        <View style={{ position: 'absolute', left: 17, right: 17, top: 16, height: 2, backgroundColor: c.divider }} />
        <Animated.View style={{
          position: 'absolute', left: 17, top: 16, height: 2, backgroundColor: t.accent,
          width: drawn.interpolate({ inputRange: [0, 1], outputRange: [0, step * currentTier] }),
        }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {TIERS.map(k => {
            const status = tierStatus(k, currentTier, completedTiers);
            const behind = isBehind(status);
            const on = k === selected;
            const now = status === 'current';
            const size = on ? 30 : 22;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityLabel={`Tier ${k}, ${tierName(k)}, ${status}`}
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(k)}
                style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
              >
                {now && <View style={{ position: 'absolute', width: size + 10, height: size + 10, borderRadius: (size + 10) / 2, backgroundColor: `${t.accent}29` }} />}
                <View style={{
                  width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: now ? t.accent : behind ? c.dotDoneBg : c.dotLockedBg,
                  borderWidth: now ? 0 : on ? 2 : 1.5,
                  borderColor: on ? t.text : behind ? c.outlineBtn : c.dotLockedBorder,
                }}>
                  <Text style={kt('bold', on ? 13 : 11, now ? t.onAccent : behind ? c.dotDoneText : t.textDisabled)}>{k}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------- leaderboard

type Row = { user_id: string; name: string; points: number; country?: string | null };

const BLOCK_HEIGHTS = [84, 60, 46];

function Podium({ tokens: t, colors: c, rows, userId, drawn }: {
  tokens: WorldKitTokens; colors: Colors; rows: Row[]; userId?: string; drawn: Animated.Value;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6 }}>
      {[1, 0, 2].map(i => {
        const r = rows[i];
        const h = BLOCK_HEIGHTS[i];
        const col = rankColor(t, i, false);
        if (!r) {
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: c.dashed }} />
              <Text style={kt('regular', 12, t.textDisabled)}>—</Text>
              <View style={{ width: '100%', height: h, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 1, borderBottomWidth: 0, borderStyle: 'dashed', borderColor: c.dashed, alignItems: 'center', paddingTop: 8 }}>
                <Text style={kt('bold', 20, t.textDisabled)}>{i + 1}</Text>
              </View>
            </View>
          );
        }
        const you = r.user_id === userId;
        const av = i === 0 ? 56 : 44;
        return (
          <View key={r.user_id} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
            <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: c.avatarBg, borderWidth: 2, borderColor: you ? t.accent : col, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={kt('semibold', i === 0 ? 18 : 15, t.text)}>{initials(r.name)}</Text>
            </View>
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text style={kt(you ? 'semibold' : 'regular', 12, you ? t.accentText : t.textMuted)} numberOfLines={1}>{r.name}</Text>
              <Text style={[kt('semibold', 16, t.text), { marginTop: 1 }]}>{fmtTime(r.points)}</Text>
            </View>
            <Animated.View style={{
              width: '100%', overflow: 'hidden', borderTopLeftRadius: 12, borderTopRightRadius: 12,
              borderTopWidth: 2, borderTopColor: col,
              height: drawn.interpolate({ inputRange: [0, 1], outputRange: [0, h] }),
            }}>
              {/* Fixed-height gradient inside the animated clip — never an
                  auto-sized gradient wrapper (see the LinearGradient gotcha). */}
              <LinearGradient colors={(i === 0 ? c.podiumFirst : c.podiumOther) as unknown as [string, string]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h }} />
              <View style={{ alignItems: 'center', gap: 2, paddingTop: 8 }}>
                <Text style={kt('bold', i === 0 ? 26 : 20, col, 0, i === 0 ? 28 : 22)}>{i + 1}</Text>
                <Text style={kt('semibold', 10, t.textFaint, 1)}>{getCountryCode(r.country)}</Text>
              </View>
            </Animated.View>
          </View>
        );
      })}
    </View>
  );
}

function YouRow({ tokens: t, colors: c, rows, userId, status }: {
  tokens: WorldKitTokens; colors: Colors; rows: Row[]; userId?: string; status: TierStatus;
}) {
  const idx = userId ? rows.findIndex(r => r.user_id === userId) : -1;
  if (idx > 2) {
    const me = rows[idx];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingHorizontal: 16, borderRadius: 16, backgroundColor: `${t.accent}12`, borderWidth: 1, borderColor: `${t.accent}66` }}>
        <Text style={[kt('bold', 18, t.accentText), { width: 34 }]}>{`#${idx + 1}`}</Text>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[kt('medium', 14, t.text), { flexShrink: 1 }]} numberOfLines={1}>{me.name}</Text>
          <YouBadge tokens={t} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={kt('semibold', 16, t.text)}>{fmtTime(me.points)}</Text>
          <Text style={kt('medium', 11, t.textMuted)}>{`+${fmtTime(me.points - rows[0].points)}`}</Text>
        </View>
      </View>
    );
  }
  if (idx < 0 && status !== 'locked') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: c.dashed }}>
        <Text style={[kt('bold', 18, t.textDisabled), { width: 34 }]}>—</Text>
        <Text style={[kt('regular', 13, t.textMuted), { flex: 1 }]}>
          {status === 'current' ? tr('strength.rankUpHint') : tr('strength.practiceHint')}
        </Text>
      </View>
    );
  }
  return null;
}

function EmptyBoard({ tokens: t, colors: c }: { tokens: WorldKitTokens; colors: Colors }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, opacity: 0.5 }}>
        {[56, 84, 42].map((h, i) => (
          <View key={i} style={{ flex: 1, height: h, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 1, borderBottomWidth: 0, borderStyle: 'dashed', borderColor: c.dashed }} />
        ))}
      </View>
      <Text style={[kt('regular', 13, t.textMuted, 0.3), { textAlign: 'center' }]}>{tr('strength.noAttempts')}</Text>
    </View>
  );
}

function SheetRow({ tokens: t, row, index, leader, you }: { tokens: WorldKitTokens; row: Row; index: number; leader: number; you: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, paddingHorizontal: 24,
      borderTopWidth: 1, borderTopColor: t.divider, backgroundColor: you ? `${t.accent}12` : 'transparent',
    }}>
      <Text style={[kt('bold', 17, index < 3 ? rankColor(t, index, false) : t.textFaint), { width: 22, textAlign: 'center' }]}>{index + 1}</Text>
      <View style={{ width: 26, height: 18, borderRadius: 4, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={kt('semibold', 10, t.textMuted, 0.6)}>{getCountryCode(row.country) || '—'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[kt(you ? 'medium' : 'regular', 14, you ? t.text : t.textSecondary), { flexShrink: 1 }]} numberOfLines={1}>{row.name}</Text>
        {you && <YouBadge tokens={t} />}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={kt('semibold', 16, t.text)}>{fmtTime(row.points)}</Text>
        <Text style={kt('medium', 11, t.textFaint, 0.4)}>{index === 0 ? tr('strength.leader') : `+${fmtTime(row.points - leader)}`}</Text>
      </View>
    </View>
  );
}


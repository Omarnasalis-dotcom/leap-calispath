import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getWorldKitTokens, WorldKitTokens } from '../../../../constants/worldKitTokens';
import { useTheme } from '../../../contexts/ThemeContext';
import { BoardKicker, KitButton, KitIcon, kt, WorldSheet } from '../../worlds/kit';
import { JourneyBadge } from '../badges/JourneyBadge';
import { BoardShareButton, LeaderboardShareCard } from '../../leaderboard/LeaderboardShareCard';
import { achievementFor } from '../../../lib/journeyAchievements';
import { CommunityBoard, CommunityBoardRow, JourneyAchievementState } from '../../../lib/journeyPoints';
import { usernameInitials } from '../../../lib/leaderboardShare';
import { ltr, t as tr } from '../../../i18n';

/*
 * Opened from the badge in the Journey top bar: your badge and progress to
 * the next one, then your community's ranking for the last 7 days
 * (docs/features/JOURNEY_ACHIEVEMENTS_PLAN.md). Built on the Worlds'
 * leaderboard sheet. Light by design: badges are static SVG, only the
 * podium and the first rows fade in once (Reanimated entering, UI thread).
 */

const ROW_FADE_LIMIT = 8;

function badgeName(level: number): string {
  const def = achievementFor(level);
  return def ? tr(`journeyAchievements.${def.key}` as 'journeyAchievements.rising') : tr('journeyAchievements.noBadge');
}

/** Light tones (gold) lose contrast on white; darken them for text there. */
function toneForText(hex: string, light: boolean): string {
  if (!light) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * 0.62).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const pts = (n: number) => n.toLocaleString('en-US');

// ── Your badge ────────────────────────────────────────────────────────────

function YourBadge({ t, state }: { t: WorldKitTokens; state: JourneyAchievementState }) {
  const light = t.mode === 'light';
  const def = achievementFor(state.level);
  const next = state.next_level ? achievementFor(state.next_level) : undefined;
  const progress = state.next_threshold ? Math.min(1, state.lifetime / state.next_threshold) : 1;
  return (
    <View style={{ marginHorizontal: 24, marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: t.border, backgroundColor: t.tint, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <JourneyBadge level={state.level} size={64} slotColor={light ? '#a8a2a0' : '#5a5a5a'} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={kt('medium', 10, t.textMuted, 2)}>{tr('journeyAchievements.yourBadge')}</Text>
        <Text style={kt('bold', 20, def ? toneForText(def.tone, light) : t.textFaint, 1.4, 24)} numberOfLines={1}>{badgeName(state.level)}</Text>
        {def ? (
          <>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.track, overflow: 'hidden' }}>
              <View style={{ width: `${progress * 100}%`, height: 6, borderRadius: 3, backgroundColor: next ? next.tone : def.tone }} />
            </View>
            <Text style={kt('medium', 11, t.textMuted, 1)} numberOfLines={1}>
              {next
                ? `${ltr(`${pts(state.lifetime)} / ${pts(state.next_threshold ?? 0)}`)} ${tr('journeyAchievements.toNext', { name: badgeName(next.level) })}`
                : tr('journeyAchievements.allEarned')}
            </Text>
          </>
        ) : (
          <Text style={kt('regular', 12, t.textMuted, 0, 17)}>{tr('journeyAchievements.noBadgeHint')}</Text>
        )}
      </View>
    </View>
  );
}

// ── Podium + rows ─────────────────────────────────────────────────────────

const PODIUM = [{ av: 54, h: 72, num: 26 }, { av: 44, h: 54, num: 20 }, { av: 44, h: 42, num: 18 }];

function Avatar({ t, row, size, ring }: { t: WorldKitTokens; row: CommunityBoardRow; size: number; ring: string }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={kt('semibold', size > 48 ? 18 : 15, t.text)}>{usernameInitials(row.username)}</Text>
      </View>
      <View style={{ position: 'absolute', right: -4, bottom: -4 }}>
        <JourneyBadge level={row.badge_level} size={20} simple slotColor="transparent" />
      </View>
    </View>
  );
}

function Podium({ t, rows }: { t: WorldKitTokens; rows: CommunityBoardRow[] }) {
  const medals = [t.gold, t.silver, t.bronze];
  return (
    // Visual order 2nd · 1st · 3rd, left to right in every language.
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 24, paddingTop: 22, direction: 'ltr' }}>
      {[1, 0, 2].map((i, k) => {
        const g = PODIUM[i];
        const r = rows[i];
        const medal = medals[i];
        return (
          <Animated.View key={i} entering={FadeInDown.delay(120 + k * 90).duration(320)} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            {r ? (
              <>
                <Avatar t={t} row={r} size={g.av} ring={r.is_you ? t.accent : medal} />
                <Text style={[kt('medium', 12, r.is_you ? t.accentText : t.textSecondary), { marginTop: 7, maxWidth: '100%' }]} numberOfLines={1}>{r.username}</Text>
                <Text style={kt('bold', i === 0 ? 17 : 14, t.text)}>{ltr(`${pts(r.weekly_points)} ${tr('journeyAchievements.pts')}`)}</Text>
              </>
            ) : (
              <View style={{ width: g.av, height: g.av, borderRadius: g.av / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.borderStrong, opacity: 0.7 }} />
            )}
            <View style={{
              width: '100%', height: g.h, marginTop: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', alignItems: 'center', paddingTop: 6,
              ...(r ? { borderTopWidth: 2, borderTopColor: medal } : { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: t.borderStrong, opacity: 0.6 }),
            }}>
              {r && <LinearGradient colors={[`${medal}4D`, `${medal}0A`]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />}
              {r?.is_you && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderWidth: 2, borderColor: t.accent, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />}
              <Text style={kt('bold', g.num, r ? medal : t.textFaint, 0, g.num + 4)}>{i + 1}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const Row = React.memo(function Row({ t, row, index }: { t: WorldKitTokens; row: CommunityBoardRow; index: number }) {
  const body = (
    <View style={{
      height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14,
      backgroundColor: row.is_you ? `${t.accent}14` : t.tint, borderWidth: 1, borderColor: row.is_you ? `${t.accent}66` : t.border,
    }}>
      <Text style={[kt('semibold', 16, row.is_you ? t.accentText : t.textMuted), { width: 30, writingDirection: 'ltr' }]} numberOfLines={1}>{row.rank != null ? ltr(`${row.rank}`) : '—'}</Text>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={kt('semibold', 12, t.text)}>{usernameInitials(row.username)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[kt('medium', 14, t.text), { flexShrink: 1 }]} numberOfLines={1}>{row.username}</Text>
        <JourneyBadge level={row.badge_level} size={20} simple slotColor="transparent" />
        {row.is_you && (
          <View style={{ height: 16, paddingHorizontal: 6, borderRadius: 5, backgroundColor: t.accent, justifyContent: 'center' }}>
            <Text style={kt('bold', 9, '#ffffff', 1.4)}>{tr('journeyAchievements.you')}</Text>
          </View>
        )}
      </View>
      <Text style={[kt('bold', 16, row.rank != null ? t.text : t.textFaint), { writingDirection: 'ltr' }]}>
        {row.rank != null ? ltr(`${pts(row.weekly_points)} ${tr('journeyAchievements.pts')}`) : '—'}
      </Text>
    </View>
  );
  return index < ROW_FADE_LIMIT
    ? <Animated.View entering={FadeInDown.delay(380 + index * 40).duration(260)}>{body}</Animated.View>
    : body;
});

function Note({ t, title, cta }: { t: WorldKitTokens; title: string; cta: string }) {
  return (
    <View style={{ marginHorizontal: 24, marginTop: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, padding: 16, alignItems: 'center', gap: 4 }}>
      <Text style={[kt('semibold', 14, t.text), { textAlign: 'center' }]}>{title}</Text>
      <Text style={[kt('regular', 13, t.textMuted, 0, 18), { textAlign: 'center' }]}>{cta}</Text>
    </View>
  );
}

function Locked({ t, onJoin }: { t: WorldKitTokens; onJoin: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 28, gap: 12 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: `${t.accent}1F`, alignItems: 'center', justifyContent: 'center' }}>
        <KitIcon name="podium" size={28} color={t.accent} />
      </View>
      <Text style={[kt('bold', 22, t.text, 1, 27), { textAlign: 'center' }]}>{tr('journeyAchievements.joinToCompete')}</Text>
      <Text style={[kt('regular', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{tr('journeyAchievements.joinBody')}</Text>
      <KitButton tokens={t} label={tr('journeyAchievements.joinButton')} onPress={onJoin} style={{ alignSelf: 'stretch', marginTop: 8 }} />
    </View>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────

export function AchievementsSheet({ visible, onClose, state, board, myName }: {
  visible: boolean;
  onClose: () => void;
  state: JourneyAchievementState;
  /** null while loading or unavailable. */
  board: CommunityBoard | null;
  myName: string;
}) {
  const { mode } = useTheme();
  const t = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const [shareOpen, setShareOpen] = useState(false);

  const locked = board != null && board.community == null;
  const ranked = useMemo(() => (board?.rows ?? []).filter(r => r.rank != null), [board]);
  const you = board?.rows.find(r => r.is_you) ?? null;
  const youOnPodium = !!you?.rank && you.rank <= 3;
  const rest = ranked.slice(3);

  return (
    <WorldSheet
      tokens={t}
      visible={visible}
      onClose={onClose}
      variant="board"
      kicker={<BoardKicker tokens={t} icon="podium" text={tr('journeyAchievements.journey')} />}
      title={board?.community ?? tr('journeyAchievements.community')}
      subtitle={board?.community ? tr('journeyAchievements.weekMembers', { n: ltr(String(board.members)) }) : undefined}
      headerAction={ranked.length > 0
        ? <BoardShareButton round color={t.textSecondary} borderColor={t.border} background={t.button} onPress={() => setShareOpen(true)} />
        : undefined}
      footer={board?.community && you && !youOnPodium ? <Row t={t} row={you} index={ROW_FADE_LIMIT} /> : undefined}
      overlay={board?.community ? (
        <LeaderboardShareCard
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          variant="journey"
          title={tr('journeyAchievements.community')}
          subLine={tr('journeyAchievements.thisWeek')}
          communityScoped
          scoreType="reps"
          rows={ranked.map((r, i) => ({ user_id: r.is_you ? 'me' : `r${i}`, username: r.username, score: r.weekly_points }))}
          myId="me"
          myName={myName}
        />
      ) : undefined}
    >
      <YourBadge t={t} state={state} />
      {locked ? (
        <Locked t={t} onJoin={() => { onClose(); router.push('/profile'); }} />
      ) : board ? (
        <>
          <Text style={[kt('light', 12, t.textMuted, 0.4), { paddingHorizontal: 24, paddingTop: 16 }]}>{tr('journeyAchievements.rollingNote')}</Text>
          <Podium t={t} rows={ranked.slice(0, 3)} />
          {ranked.length === 0 && <Note t={t} title={tr('journeyAchievements.emptyWeek')} cta={tr('journeyAchievements.emptyWeekCta')} />}
          {board.members === 1 && ranked.length > 0 && <Note t={t} title={tr('journeyAchievements.solo')} cta={tr('journeyAchievements.soloCta')} />}
          <View style={{ paddingHorizontal: 24, paddingTop: 14, gap: 6 }}>
            {rest.map((r, i) => <Row key={`${r.rank}-${r.username}`} t={t} row={r} index={i} />)}
          </View>
        </>
      ) : null}
    </WorldSheet>
  );
}

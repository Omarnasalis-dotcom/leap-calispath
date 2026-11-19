import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import type { GiftClaim, InboxItem } from '../../../lib/inbox';
import {
  boardLabel,
  dateLabel,
  isPastChallenge,
  itemRoute,
  tierLabel,
  timelineText,
  whoName,
  type ActionEntry,
  type ActionKind,
  type Segment,
} from '../../../lib/inboxFeed';
import { formatUntilDate } from '../../../lib/coachUsage';
import { track } from '../../../lib/analytics';
import { isArabic, t } from '../../../i18n';
import { TC_COLORS, TCPalette } from '../../../../constants/trainingCenterTokens';
import { giftLabelFor } from '../MessageCard';
import { canCopy, copyCode, useGiftClaim } from '../useGiftClaim';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Tone = 'tint' | 'neutral' | 'ink' | 'solid';
const locale = () => (isArabic ? 'ar' : undefined);

// Each type keeps its own icon and tile, in the app's colours (red accent,
// neutrals, and an "ink" tile for the leaderboard) rather than new hues.
function visualFor(item: InboxItem, where: 'card' | 'timeline'): { icon: IconName; tone: Tone } {
  if (item.kind === 'gift') return { icon: 'gift-outline', tone: 'solid' };
  if (item.kind === 'discount') return { icon: 'ticket-percent-outline', tone: 'tint' };
  switch (item.type) {
    case 'weekly_challenge_started': return { icon: 'trophy-outline', tone: 'tint' };
    case 'week_complete_nudge': return { icon: where === 'card' ? 'creation' : 'check', tone: 'neutral' };
    case 'leaderboard_overtaken': return { icon: 'trending-down', tone: 'ink' };
    case 'client_program_update': return { icon: 'clipboard-text-outline', tone: 'neutral' };
    case 'program_review_ready': return { icon: 'shield-check-outline', tone: 'neutral' };
    case 'admin_message': return { icon: 'bullhorn-outline', tone: 'neutral' };
    default: return { icon: 'bell-outline', tone: 'neutral' };
  }
}

function toneColors(c: TCPalette, tone: Tone, dark: boolean): { bg: string; fg: string; border?: string } {
  switch (tone) {
    case 'tint': return { bg: c.iconWell, fg: c.coral };
    // Light: a dark tile on the pale page. Dark: a lifted grey, not a white
    // block that would outshine the gift and challenge tiles.
    case 'ink': return dark
      ? { bg: 'rgba(255,255,255,0.14)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.22)' }
      : { bg: c.textPrimary, fg: c.screenBg };
    case 'solid': return { bg: c.coral, fg: '#000' };
    default: return { bg: c.inputBg, fg: c.textPrimary, border: c.border };
  }
}

function Tile({ item, where, size }: { item: InboxItem; where: 'card' | 'timeline'; size: number }) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const { icon, tone } = visualFor(item, where);
  const col = toneColors(c, tone, mode === 'dark');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: where === 'card' ? 14 : size / 2,
        backgroundColor: col.bg,
        borderWidth: col.border ? StyleSheet.hairlineWidth : 0,
        borderColor: col.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={icon} size={where === 'card' ? 22 : 16} color={col.fg} />
    </View>
  );
}

function go(item: InboxItem, onActed: (id: string) => void, kind?: ActionKind) {
  track('admin_message_action', { kind: item.kind, source: 'inbox', type: item.type });
  onActed(item.id);
  if (item.url && !(item.kind === 'discount')) {
    Linking.openURL(item.url).catch(() => { });
    return;
  }
  const to = itemRoute(item, kind);
  if (to) router.push(to as never);
}

// ─── Hero: the AI Coach week ────────────────────────────────────────────────

export function HeroCoachCard({ entry, onActed }: { entry: ActionEntry; onActed: (id: string) => void }) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => heroStyles(c, mode === 'dark'), [c, mode]);
  const week = entry.item.fields.week ?? 1;
  const build = () => {
    track('ai_week_review_tapped', { from: 'notifications' });
    onActed(entry.item.id);
    router.push({ pathname: '/coach', params: { firstPrompt: t('journey.aiReviewPrompt') } } as never);
  };
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <MaterialCommunityIcons name="creation" size={18} color={c.coral} />
          <Text style={styles.label}>{t('inboxFeed.aiCoach')}</Text>
        </View>
        <Text style={styles.date}>{dateLabel(entry.item.createdAt, Date.now(), locale())}</Text>
      </View>
      <Text style={styles.headline} accessibilityRole="header">
        {t('inboxFeed.heroHeadline', { n: week, next: week + 1 })}
      </Text>
      <Text style={styles.body}>{t('inboxFeed.heroBody', { n: week })}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={build} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{t('inboxFeed.heroCta', { next: week + 1 })}</Text>
        <MaterialCommunityIcons name={isArabic ? 'arrow-left' : 'arrow-right'} size={18} color="#141414" />
      </TouchableOpacity>
    </View>
  );
}

function heroStyles(c: TCPalette, dark: boolean) {
  return StyleSheet.create({
    // Light: an ink card on the pale page. Dark: the app's raised red-black, outlined.
    card: {
      backgroundColor: dark ? c.selectedCardBg : '#141414',
      borderWidth: dark ? 1 : 0,
      borderColor: c.heroBorderActive,
      borderRadius: 22,
      padding: 20,
      gap: 10,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.2 },
    date: { color: '#BDBDBD', fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    headline: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 34, lineHeight: 36, letterSpacing: 0.5 },
    body: { color: '#CFCFCF', fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 20 },
    button: {
      marginTop: 6,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    buttonText: { color: '#141414', fontFamily: 'PlusJakartaSans-Bold', fontSize: 15 },
  });
}

// ─── Action card ────────────────────────────────────────────────────────────

function overlineLabel(kind: ActionKind): string {
  switch (kind) {
    case 'challenge': return t('inboxFeed.overChallenge');
    case 'overtaken': return t('inboxFeed.overLeaderboard');
    case 'gift': return t('inboxFeed.overGift');
    case 'discount': return t('inboxFeed.overOffer');
    case 'program': return t('inboxFeed.overProgram');
    default: return t('inboxFeed.overReview');
  }
}

function cardText(entry: ActionEntry, claim: GiftClaim | undefined): { title: string; body: string } {
  const { item, kind } = entry;
  const f = item.fields;
  switch (kind) {
    case 'challenge':
      return f.challengeName
        ? { title: t('inboxFeed.challengeTitle', { name: f.challengeName }), body: t('inboxFeed.challengeBody') }
        : { title: item.title, body: item.body };
    case 'overtaken':
      if (!f.overtakenKind) return { title: item.title, body: item.body };
      return {
        title: t('inboxFeed.overtakenTitle', { name: whoName(item) }),
        body: f.overtakenKind === 'time'
          ? t('inboxFeed.inTier', { tier: tierLabel(f.tier) })
          : t('inboxFeed.onBoard', { board: boardLabel(f.boardName) }),
      };
    case 'gift':
      return {
        title: giftLabelFor(item) ?? item.title,
        body: claim ? t('inbox.claimBy', { date: formatUntilDate(claim.claim_by) }) : item.body,
      };
    case 'program':
      return {
        title: f.programName ?? item.title,
        body: f.byName ? t('inboxFeed.programFrom', { name: f.byName }) : item.body,
      };
    default:
      return { title: item.title, body: item.body };
  }
}

export function ActionCard({
  entry,
  claim,
  onActed,
}: {
  entry: ActionEntry;
  claim?: GiftClaim;
  onActed: (id: string) => void;
}) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => cardStyles(c, mode === 'dark'), [c, mode]);
  const { fontScale } = useWindowDimensions();
  // Big text: the button moves under the words instead of squeezing them.
  const stacked = fontScale >= 1.35;
  const { item, kind } = entry;
  const gift = useGiftClaim(item, claim, 'inbox');
  const [copied, setCopied] = useState(false);
  const { title, body } = cardText(entry, claim);
  const overline = `${overlineLabel(kind)} · ${dateLabel(item.createdAt, Date.now(), locale())}`;
  const opens = kind !== 'gift';

  const cta = (() => {
    if (kind === 'gift') {
      if (gift.state === 'claimed') {
        return (
          <View style={styles.doneRow}>
            <MaterialCommunityIcons name="check-circle" size={16} color={c.coral} />
            <Text style={styles.doneText}>{t('inboxFeed.claimed')}</Text>
          </View>
        );
      }
      if (gift.state === 'expired') return <Text style={styles.doneText}>{t('inboxFeed.expired')}</Text>;
      return (
        <TouchableOpacity accessibilityRole="button" style={[styles.filled, gift.claiming && styles.disabled]} disabled={gift.claiming} onPress={gift.claimGift}>
          {gift.claiming ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.filledText}>{t('inboxFeed.claim')}</Text>}
        </TouchableOpacity>
      );
    }
    const filled = kind === 'challenge' || kind === 'discount';
    const label = kind === 'challenge' ? t('inboxFeed.join')
      : kind === 'overtaken' ? t('inboxFeed.defend')
      : kind === 'discount' ? t('inboxFeed.useCode')
      : t('inboxFeed.open');
    return (
      <TouchableOpacity accessibilityRole="button" style={filled ? styles.filled : styles.outline} onPress={() => go(item, onActed, kind)}>
        <Text style={filled ? styles.filledText : styles.outlineText}>{label}</Text>
      </TouchableOpacity>
    );
  })();

  const words = (
    <View style={styles.words}>
      <Text style={[styles.overline, kind === 'challenge' || kind === 'gift' || kind === 'discount' ? styles.overlineAccent : null]}>{overline}</Text>
      <Text style={styles.title}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {kind === 'discount' && item.code && (
        <View style={styles.codeChip}>
          <Text style={styles.code} selectable>{item.code}</Text>
          {canCopy() && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={copied ? t('inbox.copied') : t('inbox.copy')}
              onPress={() => copyCode(item.code ?? '', 'inbox').then((ok) => ok && setCopied(true))}
              hitSlop={12}
            >
              <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={15} color={c.coralText} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {gift.error && <Text style={styles.error}>{gift.error}</Text>}
    </View>
  );

  return (
    <View style={[styles.card, stacked && styles.cardStacked]}>
      <TouchableOpacity
        accessible
        accessibilityRole={opens ? 'link' : undefined}
        accessibilityLabel={`${overline}. ${title}. ${body}`}
        disabled={!opens}
        activeOpacity={0.7}
        onPress={() => go(item, onActed, kind)}
        style={styles.main}
      >
        <Tile item={item} where="card" size={44} />
        {words}
      </TouchableOpacity>
      <View style={stacked ? styles.ctaStacked : null}>{cta}</View>
    </View>
  );
}

function cardStyles(c: TCPalette, dark: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: dark ? c.cardRaised : '#FFFFFF',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 18,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cardStacked: { flexDirection: 'column', alignItems: 'stretch' },
    main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
    words: { flex: 1, gap: 2 },
    overline: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.2 },
    overlineAccent: { color: c.coralText },
    title: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, lineHeight: 20 },
    body: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, lineHeight: 18 },
    ctaStacked: { alignItems: 'flex-start' },
    filled: {
      minHeight: 44,
      minWidth: 76,
      paddingHorizontal: 18,
      borderRadius: 999,
      backgroundColor: c.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filledText: { color: '#000', fontFamily: 'PlusJakartaSans-Bold', fontSize: 14 },
    outline: {
      minHeight: 44,
      minWidth: 76,
      paddingHorizontal: 18,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: c.textPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outlineText: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14 },
    disabled: { opacity: 0.5 },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
    doneText: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 13 },
    codeChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
      backgroundColor: c.inputBg,
    },
    code: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, letterSpacing: 2 },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12.5, marginTop: 4 },
  });
}

// ─── Timeline row ───────────────────────────────────────────────────────────

const DOT = 36;
export const TIMELINE_INSET = 20;

export function TimelineRow({ item, onActed }: { item: InboxItem; onActed: (id: string) => void }) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => rowStyles(c), [c]);
  const [expanded, setExpanded] = useState(false);
  const { line, sub } = timelineText(item);
  const to = isPastChallenge(item, Date.now()) ? null : itemRoute(item) ?? (item.url ? item.url : null);
  const plain = line.map((s: Segment) => s.text).join('');

  return (
    <TouchableOpacity
      accessibilityRole={to ? 'link' : 'button'}
      accessibilityLabel={`${item.unread ? `${t('inbox.unread')}. ` : ''}${plain}${sub ? `. ${sub}` : ''}`}
      activeOpacity={0.7}
      onPress={() => (to ? go(item, onActed) : setExpanded((v) => !v))}
      style={styles.row}
    >
      {/* The ring in the page colour cuts the timeline line around the dot. */}
      <View style={styles.dotRing} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Tile item={item} where="timeline" size={DOT} />
      </View>
      <View style={styles.text}>
        <Text style={styles.line} numberOfLines={expanded ? undefined : 2}>
          {line.map((s, i) => (
            <Text key={i} style={s.bold ? styles.bold : null}>{s.text}</Text>
          ))}
        </Text>
        {!!sub && <Text style={styles.sub} numberOfLines={expanded ? undefined : 2}>{sub}</Text>}
      </View>
      <View style={styles.meta}>
        <Text style={styles.date}>{dateLabel(item.createdAt, Date.now(), locale())}</Text>
        {item.unread && <View style={styles.dot} />}
      </View>
    </TouchableOpacity>
  );
}

/**
 * A month's weekly-challenge starts as one row ("4 weekly challenges
 * started", their names under it); tapping shows each one.
 */
export function ChallengeGroupRow({ items, onActed }: { items: InboxItem[]; onActed: (id: string) => void }) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => rowStyles(c), [c]);
  const [open, setOpen] = useState(false);
  const headline = t('inboxFeed.challengesGroup', { count: items.length });
  const names = items
    .map((i) => i.fields.challengeName ?? i.title)
    .map((n) => (isArabic ? `\u2068${n}\u2069` : n))
    .join(isArabic ? '، ' : ', ');
  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${headline}. ${names}`}
        accessibilityHint={open ? t('inboxFeed.hideChallenges') : t('inboxFeed.showChallenges')}
        accessibilityState={{ expanded: open }}
        activeOpacity={0.7}
        onPress={() => setOpen((v) => !v)}
        style={styles.row}
      >
        <View style={styles.dotRing} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Tile item={items[0]} where="timeline" size={DOT} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.line, styles.bold]}>{headline}</Text>
          <Text style={styles.sub} numberOfLines={open ? undefined : 1}>{names}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.date}>{dateLabel(items[0].createdAt, Date.now(), locale())}</Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
        </View>
      </TouchableOpacity>
      {open && items.map((item) => <TimelineRow key={item.id} item={item} onActed={onActed} />)}
    </View>
  );
}

function rowStyles(c: TCPalette) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8, paddingHorizontal: TIMELINE_INSET },
    dotRing: { padding: 3, borderRadius: (DOT + 6) / 2, backgroundColor: c.screenBg, margin: -3 },
    text: { flex: 1, gap: 2 },
    line: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 20 },
    bold: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold' },
    sub: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, lineHeight: 18 },
    meta: { alignItems: 'flex-end', gap: 6 },
    date: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.coral },
  });
}

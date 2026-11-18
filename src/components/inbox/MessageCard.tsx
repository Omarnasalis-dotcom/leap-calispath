import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { INBOX_TYPE, routeFor, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { canCopy, copyCode as copyToClipboard, useGiftClaim } from './useGiftClaim';
import { formatUntilDate } from '../../lib/coachUsage';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';
import { TC_COLORS, TCPalette } from '../../../constants/trainingCenterTokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const ICON: Record<InboxItem['kind'], IconName> = {
  news: 'bullhorn-outline',
  gift: 'gift-outline',
  discount: 'ticket-percent-outline',
};

// The app's own notifications; any other type gets the bell.
const TYPE_ICON: Record<string, IconName> = {
  weekly_challenge_started: 'trophy-outline',
  leaderboard_overtaken: 'chevron-triple-up',
  client_program_update: 'clipboard-text-outline',
  week_complete_nudge: 'check-decagram-outline',
  program_review_ready: 'shield-check-outline',
};

export function iconFor(item: InboxItem): IconName {
  if (item.type === INBOX_TYPE) return ICON[item.kind];
  return TYPE_ICON[item.type] ?? 'bell-outline';
}

/** "PRO · 7 days free", or the gift's own text when it isn't a plan. */
export function giftLabelFor(item: InboxItem): string | null {
  return item.giftText
    ?? (item.giftTier && item.giftDays
      ? t('inbox.giftLabel', { plan: item.giftTier.toUpperCase(), count: item.giftDays })
      : null);
}

interface Props {
  item: InboxItem;
  claim?: GiftClaim;
  /** Where the card is shown, for analytics. */
  source: 'inbox' | 'prompt';
  /** Called before the card's button leaves the current screen (closes the pop-up). */
  onNavigate?: () => void;
  /** Called with the gift's new end date once claimed. */
  onClaimed?: (claimId: string) => void;
  /** The pop-up shows the card without its own frame. */
  bare?: boolean;
}

// One message from the Leap team (news, a discount code, or a gift to claim)
// as the app-open pop-up card. The Notifications screen uses InboxRow.
export function MessageCard({ item, claim, source, onNavigate, onClaimed, bare }: Props) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const { state, claimGift, claiming: isExecuting, claimedUntil, error } = useGiftClaim(item, claim, source, onClaimed);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!item.code) return;
    copyToClipboard(item.code, source).then((ok) => { if (ok) setCopied(true); });
  };

  const newsRoute = routeFor(item);

  const open = (route: string) => {
    track('admin_message_action', { kind: item.kind, source });
    onNavigate?.();
    router.push(route as never);
  };

  // A web link (a store page, a post, a form) opens outside the app.
  const openLink = (url: string) => {
    track('admin_message_action', { kind: item.kind, source });
    Linking.openURL(url).catch(() => { });
  };

  const giftLabel = giftLabelFor(item);

  return (
    <View style={bare ? styles.bare : styles.card}>
      <View style={styles.head}>
        <View style={styles.iconWell}>
          <MaterialCommunityIcons name={iconFor(item)} size={20} color={c.coral} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>{formatUntilDate(item.createdAt)}</Text>
        </View>
        {item.unread && !bare && <View style={styles.unreadDot} accessibilityLabel={t('inbox.unread')} />}
      </View>

      {item.imageUrl && (
        <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      )}

      <Text style={styles.body}>{item.body}</Text>

      {item.kind === 'news' && (item.url || newsRoute) && (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryBtn}
          onPress={() => (item.url ? openLink(item.url) : open(newsRoute as string))}
        >
          <Text style={styles.secondaryBtnText}>{item.buttonLabel ?? t('inbox.open')}</Text>
        </TouchableOpacity>
      )}

      {item.kind === 'discount' && item.code && (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>{t('inbox.yourCode')}</Text>
            {/* selectable: press and hold copies it (iPhone's code sheet can't be pre-filled). */}
            <Text style={styles.code} selectable>{item.code}</Text>
            {canCopy() ? (
              <TouchableOpacity accessibilityRole="button" style={styles.copyBtn} onPress={copyCode} hitSlop={8}>
                <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={14} color={c.coralText} />
                <Text style={styles.copyBtnText}>{copied ? t('inbox.copied') : t('inbox.copy')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.codeHint}>{t('inbox.copyHint')}</Text>
            )}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.primaryBtn}
            onPress={() => open(`/redeem-code?code=${encodeURIComponent(item.code ?? '')}`)}
          >
            <Text style={styles.primaryBtnText}>{t('inbox.useCode')}</Text>
          </TouchableOpacity>
        </>
      )}

      {item.kind === 'gift' && (
        <>
          {giftLabel && (
            <View style={styles.giftPill}>
              <Text style={styles.giftPillText}>{giftLabel}</Text>
            </View>
          )}
          {state === 'claimable' && (
            <>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.primaryBtn, isExecuting && styles.disabled]}
                disabled={isExecuting}
                onPress={claimGift}
              >
                {isExecuting ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>{t('inbox.claim')}</Text>}
              </TouchableOpacity>
              {claim && <Text style={styles.note}>{t('inbox.claimBy', { date: formatUntilDate(claim.claim_by) })}</Text>}
            </>
          )}
          {state === 'claimed' && (
            <View style={styles.stateRow}>
              <MaterialCommunityIcons name="check-circle" size={18} color={c.coral} />
              <Text style={styles.stateText}>
                {claimedUntil ? t('inbox.claimedUntil', { date: formatUntilDate(claimedUntil) }) : t('inbox.claimed')}
              </Text>
            </View>
          )}
          {state === 'expired' && <Text style={styles.note}>{t('inbox.expired')}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.cardRaised,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    bare: { alignSelf: 'stretch', gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWell: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    headText: { flex: 1, gap: 2 },
    title: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 16, lineHeight: 22 },
    date: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.coral },
    body: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 21 },
    // Width and ratio both set: a remote picture has no size of its own.
    image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: c.inputBg },
    codeBox: {
      borderColor: c.borderStrong,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.inputBg,
    },
    codeLabel: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    code: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 22, letterSpacing: 3 },
    codeHint: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 11 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.chipActiveBg, marginTop: 2 },
    copyBtnText: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold', fontSize: 12 },
    giftPill: {
      alignSelf: 'flex-start',
      backgroundColor: c.chipActiveBg,
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    giftPillText: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold', fontSize: 12 },
    primaryBtn: { backgroundColor: c.coral, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.6 },
    secondaryBtn: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    secondaryBtnText: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.4 },
    disabled: { opacity: 0.5 },
    note: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12, lineHeight: 18 },
    stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stateText: { flex: 1, color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, lineHeight: 20 },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13 },
  });
}

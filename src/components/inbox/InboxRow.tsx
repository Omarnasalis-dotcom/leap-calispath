import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { routeFor, timeLabel, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { formatUntilDate } from '../../lib/coachUsage';
import { track } from '../../lib/analytics';
import { isArabic, t } from '../../i18n';
import { TC_COLORS, TCPalette } from '../../../constants/trainingCenterTokens';
import { giftLabelFor, iconFor } from './MessageCard';
import { canCopy, copyCode, useGiftClaim } from './useGiftClaim';

interface Props {
  item: InboxItem;
  claim?: GiftClaim;
  /** Draws the hairline above the row (every row in a group but the first). */
  divider: boolean;
  onClaimed?: (claimId: string) => void;
}

/** Where tapping the row goes: a web link, a screen, the code screen, or nowhere (the text opens in place). */
export function rowTarget(item: InboxItem): { url: string } | { route: string } | null {
  if (item.url) return { url: item.url };
  const route = routeFor(item);
  if (route) return { route };
  if (item.kind === 'discount' && item.code) return { route: `/redeem-code?code=${encodeURIComponent(item.code)}` };
  return null;
}

// One notification on the Notifications screen: a flat row in a day group.
// New ones (unread when the screen opened) carry a red tint, a dot and a bold
// title. Tapping goes straight to what it's about, like the push does; one
// without a screen opens its full text in place. A gift or a code keeps its
// one action inside the row.
export function InboxRow({ item, claim, divider, onClaimed }: Props) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c, mode === 'dark'), [c, mode]);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const gift = useGiftClaim(item, claim, 'inbox', onClaimed);
  const target = rowTarget(item);
  const isNew = item.unread;

  const onPress = () => {
    if (!target) {
      setExpanded((v) => !v);
      return;
    }
    track('admin_message_action', { kind: item.kind, source: 'inbox', type: item.type });
    if ('url' in target) Linking.openURL(target.url).catch(() => { });
    else router.push(target.route as never);
  };

  const giftLabel = item.kind === 'gift' ? giftLabelFor(item) : null;

  return (
    <TouchableOpacity
      accessibilityRole={target ? 'link' : 'button'}
      accessibilityLabel={`${isNew ? `${t('inbox.unread')}. ` : ''}${item.title}. ${item.body}`}
      accessibilityState={target ? undefined : { expanded }}
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.row, isNew && styles.rowNew, divider && styles.divider]}
    >
      <View style={[styles.iconWell, isNew && styles.iconWellNew]}>
        <MaterialCommunityIcons name={iconFor(item)} size={18} color={isNew ? c.coral : c.textSecondary} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, isNew && styles.titleNew]} numberOfLines={2}>{item.title}</Text>
          <View style={styles.meta}>
            <Text style={[styles.time, isNew && styles.timeNew]}>{timeLabel(item.createdAt, Date.now(), isArabic ? 'ar' : undefined)}</Text>
            {isNew && <View style={styles.dot} />}
          </View>
        </View>

        <Text style={[styles.body, isNew && styles.bodyNew]} numberOfLines={expanded ? undefined : 2}>{item.body}</Text>

        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
        )}

        {item.kind === 'gift' && (
          <View style={styles.extra}>
            {gift.state === 'claimable' && (
              <View style={styles.actionLine}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.pillBtn, gift.claiming && styles.disabled]}
                  disabled={gift.claiming}
                  onPress={gift.claimGift}
                  hitSlop={6}
                >
                  {gift.claiming
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Text style={styles.pillBtnText}>{t('inbox.claim')}</Text>}
                </TouchableOpacity>
                <Text style={styles.extraText} numberOfLines={2}>
                  {[giftLabel, claim ? t('inbox.claimByShort', { date: formatUntilDate(claim.claim_by) }) : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
            {gift.state === 'claimed' && (
              <View style={styles.actionLine}>
                <MaterialCommunityIcons name="check-circle" size={15} color={c.coral} />
                <Text style={styles.extraText}>
                  {gift.claimedUntil
                    ? t('inbox.claimedUntil', { date: formatUntilDate(gift.claimedUntil) })
                    : [giftLabel, t('inbox.claimed')].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
            {gift.state === 'expired' && <Text style={styles.extraText}>{t('inbox.expired')}</Text>}
            {gift.error && <Text style={styles.error}>{gift.error}</Text>}
          </View>
        )}

        {item.kind === 'discount' && item.code && (
          <View style={[styles.extra, styles.actionLine]}>
            <View style={styles.codeChip}>
              <Text style={styles.code} selectable>{item.code}</Text>
              {canCopy() && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={copied ? t('inbox.copied') : t('inbox.copy')}
                  onPress={() => copyCode(item.code ?? '', 'inbox').then((ok) => ok && setCopied(true))}
                  hitSlop={10}
                >
                  <MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={15} color={c.coralText} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.pillBtn}
              onPress={() => router.push(`/redeem-code?code=${encodeURIComponent(item.code ?? '')}` as never)}
              hitSlop={6}
            >
              <Text style={styles.pillBtnText}>{t('inbox.useCode')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function getStyles(c: TCPalette, dark: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    // A wash of the brand red, just enough to pick new ones out at a glance.
    rowNew: { backgroundColor: dark ? 'rgba(252,84,84,0.08)' : 'rgba(252,84,84,0.06)' },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    iconWell: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    iconWellNew: { backgroundColor: c.iconWell, borderColor: 'transparent' },
    content: { flex: 1, gap: 4 },
    titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    title: { flex: 1, color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, lineHeight: 21 },
    titleNew: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold' },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
    time: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    timeNew: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.coral },
    body: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13.5, lineHeight: 20 },
    bodyNew: { color: c.textBody },
    image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, marginTop: 6, backgroundColor: c.inputBg },
    extra: { marginTop: 8, gap: 6 },
    actionLine: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    extraText: { flexShrink: 1, color: c.textSecondary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 12.5, lineHeight: 18 },
    pillBtn: {
      minWidth: 72,
      minHeight: 32,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: c.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.2 },
    disabled: { opacity: 0.5 },
    codeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 32,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
      backgroundColor: c.inputBg,
    },
    code: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, letterSpacing: 2 },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12.5 },
  });
}

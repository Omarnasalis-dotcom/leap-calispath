import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { giftState, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { formatUntilDate } from '../../lib/coachUsage';
import { FLIP_X, t } from '../../i18n';
import { TC_COLORS, TCPalette } from '../../../constants/trainingCenterTokens';
import { giftLabelFor, iconFor } from './MessageCard';

interface Props {
  item: InboxItem;
  claim?: GiftClaim;
  /** Draws the line above the row (every row in a group but the first). */
  divider: boolean;
  onPress: () => void;
}

/** The one line under the title: the gift and whether it was claimed, the code, or the text. */
export function rowSubtitle(item: InboxItem, claim: GiftClaim | undefined, nowMs: number): string {
  if (item.kind === 'gift') {
    const label = giftLabelFor(item);
    const state = giftState(claim, nowMs);
    const status = state === 'claimed' ? t('inbox.rowClaimed') : state === 'expired' ? t('inbox.rowExpired') : null;
    return [label, status].filter(Boolean).join(' · ') || item.body;
  }
  if (item.kind === 'discount' && item.code) return t('inbox.rowCode', { code: item.code });
  return item.body;
}

// A notification already opened, folded to one row on the Notifications
// screen. Tapping it opens the full card again (its button, code or text).
export function MessageRow({ item, claim, divider, onPress }: Props) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const claimed = item.kind === 'gift' && giftState(claim, Date.now()) === 'claimed';

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityHint={t('inbox.expandHint')}
      style={[styles.row, divider && styles.divider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconWell}>
        <MaterialCommunityIcons name={iconFor(item)} size={16} color={c.coral} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.date}>{formatUntilDate(item.createdAt)}</Text>
        </View>
        <View style={styles.subLine}>
          {claimed && <MaterialCommunityIcons name="check-circle" size={13} color={c.coral} />}
          <Text style={styles.sub} numberOfLines={1}>{rowSubtitle(item, claim, Date.now())}</Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={c.textMuted} style={FLIP_X} />
    </TouchableOpacity>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    iconWell: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    text: { flex: 1, gap: 2 },
    titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    title: { flex: 1, color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, lineHeight: 20 },
    date: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    subLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    sub: { flex: 1, color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, lineHeight: 18 },
  });
}

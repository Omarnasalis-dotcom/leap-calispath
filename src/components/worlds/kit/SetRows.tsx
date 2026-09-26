import React from 'react';
import { Text, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { kt } from './type';

/** "THIS SET" points + PB chip (handoff §0.7). */
export function ThisSetRow({ tokens: t, points, chip }: { tokens: WorldKitTokens; points: string; chip: { text: string; filled: boolean } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 4 }}>
      <View>
        <Text style={kt('medium', 10.5, t.textMuted, 2)}>THIS SET</Text>
        <Text style={kt('bold', 30, t.text, 0, 34)}>
          {points} <Text style={kt('medium', 13, t.textMuted, 1.4)}>PTS</Text>
        </Text>
      </View>
      <View style={{
        paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9,
        backgroundColor: chip.filled ? t.accent : 'transparent',
        borderWidth: chip.filled ? 0 : 1, borderColor: t.borderStrong,
      }}>
        <Text style={kt('bold', 11, chip.filled ? t.onAccent : t.textMuted, 1.4)}>{chip.text}</Text>
      </View>
    </View>
  );
}

export interface TopListRow {
  key: string;
  name: string;
  you: boolean;
  value: string;
}

export function rankColor(t: WorldKitTokens, index: number, you: boolean): string {
  if (index === 0) return t.gold;
  if (index === 1) return t.silver;
  if (index === 2) return t.bronze;
  return you ? t.accentText : t.textFaint;
}

/** In-sheet Top list (TOP 60S SETS / TOP LIFTS / TOP HOLDS), 6 rows. */
export function TopList({ tokens: t, title, rightLabel, rows, emptyText }: {
  tokens: WorldKitTokens; title: string; rightLabel: string; rows: TopListRow[]; emptyText: string;
}) {
  return (
    <View style={{ marginTop: 28, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={kt('semibold', 16, t.text, 1.8)}>{title}</Text>
        <Text style={kt('medium', 11.5, t.textMuted, 1.2)}>{rightLabel}</Text>
      </View>
      <View style={{ borderRadius: 16, backgroundColor: t.mode === 'dark' ? '#0f0f0f' : t.listBg, borderWidth: 1, borderColor: t.emptyRowBorder, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <Text style={[kt('medium', 12, t.textFaint, 1.2), { textAlign: 'center', paddingVertical: 20 }]}>{emptyText}</Text>
        ) : rows.slice(0, 6).map((r, i) => (
          <View key={r.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, paddingHorizontal: 16,
            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
            backgroundColor: r.you ? `${t.accent}17` : 'transparent',
          }}>
            <Text style={[kt('bold', 16, rankColor(t, i, r.you)), { width: 22, textAlign: 'center' }]}>{i + 1}</Text>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[kt(r.you ? 'medium' : 'regular', 14, r.you ? t.text : t.textSecondary), { flexShrink: 1 }]} numberOfLines={1}>{r.name}</Text>
              {r.you && <YouBadge tokens={t} />}
            </View>
            <Text style={kt('semibold', 15, t.text)}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function YouBadge({ tokens: t }: { tokens: WorldKitTokens }) {
  return (
    <View style={{ paddingVertical: 1, paddingHorizontal: 6, borderRadius: 5, backgroundColor: t.accent }}>
      <Text style={kt('bold', 10, t.onAccent, 1.2)}>YOU</Text>
    </View>
  );
}

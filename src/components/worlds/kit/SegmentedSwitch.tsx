import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { KitIcon } from './KitIcon';
import { kt } from './type';

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  /** Second line (two-line variant): "3/6 LOGGED". */
  sub?: string;
  /** Second line as dots (Static skills): true = logged. */
  dots?: boolean[];
  /** Leading crown (OVERALL / ALL tier tab). */
  crown?: boolean;
  /** Locked segment (tier-gated). Still pressable so the screen can explain why. */
  locked?: boolean;
}

interface Props<K extends string> {
  tokens: WorldKitTokens;
  items: SegmentItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Segment height; two-line variants use 46–50. */
  height?: number;
  fontSize?: number;
  accessibilityLabel?: string;
}

/** The shared "switch style" (handoff §0.5). */
export function SegmentedSwitch<K extends string>({
  tokens: t, items, active, onChange, height, fontSize = 12.5, accessibilityLabel,
}: Props<K>) {
  const twoLine = items.some(i => i.sub != null || i.dots != null);
  const h = height ?? (twoLine ? 50 : 40);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: t.segTrack, borderWidth: 1, borderColor: t.segBorder }}
    >
      {items.map(item => {
        const on = item.key === active;
        const fg = on ? t.onAccent : item.locked ? t.textDisabled : t.textMuted;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${item.label}${item.locked ? ', locked' : ''}`}
            onPress={() => onChange(item.key)}
            style={{ flex: 1, minWidth: 0, height: h, borderRadius: 11, backgroundColor: on ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {item.crown && <KitIcon name="crown" size={11} color={on ? t.onAccent : t.gold} />}
              {item.locked && <MaterialCommunityIcons name="lock" size={11} color={fg} />}
              <Text style={kt('semibold', fontSize, fg, 1.4)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {item.label}
              </Text>
            </View>
            {item.sub != null && (
              <Text style={kt('medium', 9.5, on ? 'rgba(255,255,255,0.85)' : t.textFaint, 1.2)} numberOfLines={1}>{item.sub}</Text>
            )}
            {item.dots && (
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
                {item.dots.map((d, i) => (
                  <View
                    key={i}
                    style={{
                      width: 5, height: 5, borderRadius: 2.5,
                      backgroundColor: on ? (d ? '#ffffff' : 'rgba(255,255,255,0.3)') : d ? t.accent : t.borderStrong,
                    }}
                  />
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

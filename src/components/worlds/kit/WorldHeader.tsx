import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { KitIcon, KitIconName } from './KitIcon';
import { kt } from './type';

interface Props {
  tokens: WorldKitTokens;
  icon: KitIconName;
  title: string;
  /** Shows the right-aligned "‹ JOURNEY" chip (handoff `fromJourney`, §0.3). */
  onBackToJourney?: () => void;
}

export function WorldHeader({ tokens: t, icon, title, onBackToJourney }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 16, paddingHorizontal: 24, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <KitIcon name={icon} size={18} color={t.accentText} />
        <Text style={kt('bold', 26, t.text, 1.4)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </Text>
      </View>
      {onBackToJourney && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Journey"
          onPress={onBackToJourney}
          style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: t.borderStrong, flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <KitIcon name="back" size={12} color={t.textSecondary} strokeWidth={2.6} />
          <Text style={kt('semibold', 11, t.textSecondary, 1.4)}>JOURNEY</Text>
        </Pressable>
      )}
    </View>
  );
}

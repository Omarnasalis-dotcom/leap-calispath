import React from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { LeapLogo } from '../../LeapLogo';
import { KitIcon, KitIconName } from './KitIcon';
import { kt } from './type';

interface Props {
  tokens: WorldKitTokens;
  label: string;
  onPress: () => void;
  /** primary = accent fill (§0.7 CTA) · outline = neutral border · white = STOP & LOG. */
  variant?: 'primary' | 'outline' | 'white';
  height?: number;
  icon?: KitIconName;
  disabled?: boolean;
  loading?: boolean;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function KitButton({
  tokens: t, label, onPress, variant = 'primary', height = 56, icon,
  disabled, loading, fontSize, style, testID,
}: Props) {
  const isPrimary = variant === 'primary';
  const isWhite = variant === 'white';
  const bg = isPrimary ? t.accent : isWhite ? (t.mode === 'dark' ? '#ffffff' : t.text) : 'transparent';
  const fg = isPrimary ? t.onAccent : isWhite ? (t.mode === 'dark' ? '#000000' : '#ffffff') : t.textMuted;
  const size = fontSize ?? (variant === 'outline' ? 15 : 17);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        height,
        borderRadius: 16,
        backgroundColor: isPrimary && pressed ? t.accentHover : bg,
        borderWidth: variant === 'outline' ? 1.5 : 0,
        borderColor: t.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
        opacity: disabled ? 0.45 : pressed && !isPrimary ? 0.8 : 1,
      }, style]}
    >
      {loading ? (
        <LeapLogo size={30} animated />
      ) : (
        <>
          {icon && <KitIcon name={icon} size={13} color={fg} />}
          <Text style={kt(variant === 'outline' ? 'semibold' : 'bold', size, fg, variant === 'outline' ? 2.4 : 2.6)}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** 40px circular close button used in every sheet header. */
export function KitCloseButton({ tokens: t, onPress }: { tokens: WorldKitTokens; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      onPress={onPress}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.button, alignItems: 'center', justifyContent: 'center' }}
    >
      <KitIcon name="close" size={14} color={t.textSecondary} strokeWidth={2.6} />
    </Pressable>
  );
}

export function KitDivider({ tokens: t }: { tokens: WorldKitTokens }) {
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

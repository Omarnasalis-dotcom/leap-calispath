import React, { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { KitIcon } from './KitIcon';
import { kt } from './type';
import { WORLD_FONTS } from '../../../../constants/worldKitTokens';

interface Props {
  tokens: WorldKitTokens;
  value: string;
  onChangeText: (raw: string) => void;
  unit: string;
  hint?: React.ReactNode;
  /** Decimal keypad (kg) vs whole numbers (reps, seconds). */
  decimal?: boolean;
  maxLength?: number;
  fontSize?: number;
  accessibilityLabel: string;
}

/**
 * Typeable number (handoff §0.7): big Oswald input sized to its content,
 * accent caret, select-all on focus, numeric keypad. The whole box is a tap
 * target that focuses the input.
 */
export function NumberField({
  tokens: t, value, onChangeText, unit, hint, decimal, maxLength = 3, fontSize = 60, accessibilityLabel,
}: Props) {
  const ref = useRef<TextInput>(null);
  // Oswald Bold digits are ~0.55em wide; +6 keeps the caret from clipping.
  const width = Math.max(1, value.length || 1) * fontSize * 0.56 + 6;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        onPress={() => ref.current?.focus()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: t.tintBorder, backgroundColor: t.inputBg }}
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={t.textDisabled}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          inputMode={decimal ? 'decimal' : 'numeric'}
          selectTextOnFocus
          maxLength={maxLength}
          selectionColor={t.accent}
          cursorColor={t.accent}
          accessibilityLabel={accessibilityLabel}
          style={{
            width,
            padding: 0,
            margin: 0,
            textAlign: 'center',
            fontFamily: WORLD_FONTS.bold,
            fontSize,
            lineHeight: fontSize * 1.15,
            color: t.text,
            includeFontPadding: false,
          }}
        />
        <Text style={kt('medium', 14, t.textMuted, 1.6)}>{unit}</Text>
        <View style={{ marginLeft: 2 }}>
          <KitIcon name="pencil" size={14} color={t.textFaint} strokeWidth={2.2} />
        </View>
      </Pressable>
      {typeof hint === 'string' ? <Text style={kt('medium', 10, t.textFaint, 1.6)}>{hint}</Text> : hint}
    </View>
  );
}

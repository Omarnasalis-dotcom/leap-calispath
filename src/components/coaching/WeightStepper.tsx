import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { t } from '../../i18n';
import { stepWeight } from '../../lib/weightStep';

interface Props {
  /** Typed kg text ('' = none). */
  value: string;
  onChange: (text: string) => void;
  /** Previous set/round weight: where + starts from an empty box. */
  suggested?: number;
  theme: any;
  accent: string;
}

/**
 * "WEIGHT  [−] [ 20 ] [+] KG" — the kg entry for weighted sets and superset
 * rounds. The − / + (2.5 kg) make it obvious there's a weight to fill in;
 * the number can also be typed.
 */
export function WeightStepper({ value, onChange, suggested, theme, accent }: Props) {
  const step = (direction: 1 | -1) => onChange(stepWeight(value, direction, suggested));
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.text.secondary }]}>{t('blocks.weight')}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.btn, { borderColor: accent }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.weight')} −`}
          onPress={() => step(-1)}
        >
          <Text style={[styles.btnText, { color: theme.text.primary }]}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: theme.text.primary, borderColor: accent }]}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.text.tertiary}
          value={value}
          selectTextOnFocus
          accessibilityLabel={t('blocks.weight')}
          onChangeText={onChange}
        />
        <TouchableOpacity
          style={[styles.btn, { borderColor: accent }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.weight')} +`}
          onPress={() => step(1)}
        >
          <Text style={[styles.btnText, { color: theme.text.primary }]}>+</Text>
        </TouchableOpacity>
        <Text style={[styles.unit, { color: theme.text.secondary }]}>{t('blocks.kg')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold' },
  input: {
    width: 72,
    height: 36,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 0,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
    textAlign: 'center',
  },
  unit: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12 },
});

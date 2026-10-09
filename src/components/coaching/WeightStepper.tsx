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
}

/**
 * "WEIGHT  [−] [ 20 ] [+] KG" — the kg entry for weighted sets and superset
 * rounds, styled like the reps stepper next to it (same 26pt buttons and
 * borders); the value sits in a lightly filled box so it reads as typeable.
 * − / + step 2.5 kg.
 */
export function WeightStepper({ value, onChange, suggested, theme }: Props) {
  const step = (direction: 1 | -1) => onChange(stepWeight(value, direction, suggested));
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.text.tertiary }]}>{t('blocks.weight')}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.btn, { borderColor: theme.card.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.weight')} −`}
          onPress={() => step(-1)}
        >
          <Text style={[styles.btnText, { color: theme.text.primary }]}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border }]}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.text.tertiary}
          value={value}
          selectTextOnFocus
          accessibilityLabel={t('blocks.weight')}
          onChangeText={onChange}
        />
        <TouchableOpacity
          style={[styles.btn, { borderColor: theme.card.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('blocks.weight')} +`}
          onPress={() => step(1)}
        >
          <Text style={[styles.btnText, { color: theme.text.primary }]}>+</Text>
        </TouchableOpacity>
        <Text style={[styles.unit, { color: theme.text.tertiary }]}>{t('blocks.kg')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  // Same as the reps label / stepper (SetRow, CircuitRoundCard).
  label: { fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontFamily: 'BarlowCondensed-Bold' },
  input: {
    width: 48,
    height: 26,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 0,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    textAlign: 'center',
  },
  unit: { fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5 },
});

import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TC_COLORS } from '../../../constants/trainingCenterTokens';

// Shared horizontal filter-chip row — was duplicated byte-for-byte across
// ProgramTemplatesScreen, CustomizeProgramScreen, and QuickWorkoutScreen.
export function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => onSelect(opt)}
          style={[
            styles.chip,
            selected === opt ? { backgroundColor: TC_COLORS.chipActiveBg, borderColor: TC_COLORS.coral } : { borderColor: TC_COLORS.borderStrong },
          ]}
        >
          <Text style={[styles.chipText, { color: selected === opt ? TC_COLORS.coral : TC_COLORS.textMuted }]}>
            {opt.toUpperCase().replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1 },
});

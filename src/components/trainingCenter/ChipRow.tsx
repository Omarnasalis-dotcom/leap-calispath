import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
// RNGH's ScrollView, not react-native's — CustomizeProgramScreen nests this
// component inside its own gesture-handler-based drag-and-drop grid
// (Gesture.Race/GestureDetector on each DraggableCard). A plain react-native
// ScrollView here doesn't negotiate with that separate gesture recognizer
// system: tapping a chip can desync RNGH's gesture state for the sibling
// cards, leaving them unresponsive to further taps/drags until the screen
// remounts (see CustomizeProgramScreen.tsx's own top-of-file comment, which
// applies the same fix to its outer ScrollView). Harmless drop-in for the
// other ChipRow consumers, which have no competing gesture system.
import { ScrollView } from 'react-native-gesture-handler';
import { TC_COLORS } from '../../../constants/trainingCenterTokens';
import { useTheme } from '../../contexts/ThemeContext';

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
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => onSelect(opt)}
          style={[
            styles.chip,
            selected === opt ? { backgroundColor: c.chipActiveBg, borderColor: c.coral } : { borderColor: c.borderStrong },
          ]}
        >
          <Text style={[styles.chipText, { color: selected === opt ? c.coral : c.textMuted }]}>
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

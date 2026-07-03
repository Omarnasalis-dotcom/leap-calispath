import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';

export type MissedReason = 'no_time' | 'too_tired' | 'injury' | 'other';

const REASON_OPTIONS: { value: MissedReason; label: string }[] = [
  { value: 'no_time', label: 'NO TIME' },
  { value: 'too_tired', label: 'TOO TIRED' },
  { value: 'injury', label: 'INJURY' },
  { value: 'other', label: 'OTHER' },
];

interface MissedReasonPickerProps {
  theme: any;
  missedReason: MissedReason | null;
  setMissedReason: (val: MissedReason) => void;
  missedDetail: string;
  setMissedDetail: (val: string) => void;
}

export const MissedReasonPicker: React.FC<MissedReasonPickerProps> = ({
  theme,
  missedReason,
  setMissedReason,
  missedDetail,
  setMissedDetail,
}) => {
  return (
    <View style={{ width: '100%', gap: 12 }}>
      <Text style={[styles.label, { color: theme.text.secondary }]}>WHY DID YOU MISS THIS BLOCK?</Text>
      <View style={styles.reasonGrid}>
        {REASON_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.reasonBtn,
              {
                borderColor: missedReason === opt.value ? '#FF6B6B' : theme.card.border,
                backgroundColor: missedReason === opt.value ? 'rgba(255,107,107,0.12)' : 'transparent',
              },
            ]}
            onPress={() => setMissedReason(opt.value)}
          >
            <Text style={{
              fontFamily: 'BarlowCondensed-Bold',
              fontSize: 11,
              letterSpacing: 0.5,
              color: missedReason === opt.value ? '#FF6B6B' : theme.text.secondary,
            }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[styles.detailInput, { color: theme.text.primary, borderColor: theme.card.border }]}
        placeholder="ANY DETAILS? (OPTIONAL)"
        placeholderTextColor="rgba(255,255,255,0.15)"
        value={missedDetail}
        onChangeText={setMissedDetail}
        multiline
      />
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonBtn: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  detailInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    minHeight: 50,
    textAlignVertical: 'top',
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type Feel = 'hard' | 'ok' | 'good' | 'strong' | 'beast';

const FEEL_OPTIONS: { value: Feel; label: string }[] = [
  { value: 'hard', label: 'HARD' },
  { value: 'ok', label: 'OK' },
  { value: 'good', label: 'GOOD' },
  { value: 'strong', label: 'STRONG' },
  { value: 'beast', label: 'BEAST' },
];

interface FeelRpePickerProps {
  theme: any;
  bronzeGold: string;
  feel: Feel | null;
  setFeel: (val: Feel) => void;
  rpe: number | null;
  setRpe: (val: number) => void;
}

export const FeelRpePicker: React.FC<FeelRpePickerProps> = ({
  theme,
  bronzeGold,
  feel,
  setFeel,
  rpe,
  setRpe,
}) => {
  return (
    <View style={{ width: '100%', gap: 20 }}>
      <View>
        <Text style={[styles.label, { color: theme.text.secondary }]}>HOW DID IT FEEL?</Text>
        <View style={styles.feelRow}>
          {FEEL_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.feelBtn,
                {
                  borderColor: feel === opt.value ? bronzeGold : theme.card.border,
                  backgroundColor: feel === opt.value ? 'rgba(200,160,64,0.12)' : 'transparent',
                },
              ]}
              onPress={() => setFeel(opt.value)}
            >
              <Text style={{
                fontFamily: 'BarlowCondensed-Bold',
                fontSize: 10,
                letterSpacing: 0.5,
                color: feel === opt.value ? bronzeGold : theme.text.secondary,
              }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.label, { color: theme.text.secondary }]}>RPE (EFFORT LEVEL, 1-10)</Text>
        <View style={styles.rpeRow}>
          {Array.from({ length: 10 }).map((_, i) => {
            const dotVal = i + 1;
            const filled = rpe !== null && dotVal <= rpe;
            return (
              <TouchableOpacity key={dotVal} onPress={() => setRpe(dotVal)} style={styles.rpeDotWrap}>
                <View
                  style={[
                    styles.rpeDot,
                    {
                      borderColor: filled ? '#FF7043' : theme.card.border,
                      backgroundColor: filled ? '#FF7043' : 'transparent',
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
        {rpe !== null && (
          <Text style={{ color: theme.text.tertiary, fontSize: 11, fontFamily: 'BarlowCondensed-Bold', marginTop: 4, textAlign: 'center' }}>
            RPE {rpe}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  feelRow: {
    flexDirection: 'row',
    gap: 6,
  },
  feelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rpeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rpeDotWrap: {
    padding: 2,
  },
  rpeDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CoachUsage, coachUsageText } from '../../lib/coachUsage';

/** Messages and budget left, above the message box. */
export function CoachUsageLine({ usage, color, lowColor }: {
  usage: CoachUsage;
  color: string;
  lowColor: string;
}) {
  const text = coachUsageText(usage);
  if (!text) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color }]}>{text.messages}</Text>
      {text.budget && (
        <Text style={[styles.text, { color: text.budgetLow ? lowColor : color }, text.budgetLow && styles.low]}>
          {text.budget}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 12,
    rowGap: 2,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  text: { fontSize: 11.5, fontWeight: '500', letterSpacing: 0.2 },
  low: { fontWeight: '700' },
});

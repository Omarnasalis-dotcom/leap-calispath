import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from './Skeleton';
import { useTheme } from '../contexts/ThemeContext';

export function LeaderboardSkeleton() {
  const { theme } = useTheme();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {[...Array(5)].map((_, i) => (
        <View
          key={i}
          style={[
            styles.row,
            { backgroundColor: theme.card.background, borderColor: theme.card.border }
          ]}
        >
          {/* Rank Circle */}
          <Skeleton width={32} height={32} borderRadius={16} />
          
          {/* User Info */}
          <View style={styles.info}>
            <Skeleton width={120} height={16} borderRadius={4} />
          </View>
          
          {/* Time Circles */}
          <View style={styles.times}>
            <Skeleton width={50} height={50} borderRadius={25} />
            {i === 1 && <Skeleton width={50} height={50} borderRadius={25} style={{ marginLeft: 8 }} />}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  times: {
    flexDirection: 'row',
  },
});

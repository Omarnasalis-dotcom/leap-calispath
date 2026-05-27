import React from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Skeleton } from '../Skeleton';
import { useTheme } from '../../contexts/ThemeContext';

export function ProfileSkeleton() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Header Avatar and Info */}
        <View style={styles.header}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <View style={styles.headerText}>
            <Skeleton width={150} height={24} borderRadius={4} style={{ marginBottom: 8 }} />
            <Skeleton width={100} height={16} borderRadius={4} />
          </View>
        </View>

        {/* Score Bars */}
        <View style={styles.scores}>
          <Skeleton width="100%" height={80} borderRadius={12} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={80} borderRadius={12} />
        </View>

        {/* World Selectors */}
        <View style={styles.worlds}>
          <Skeleton width="48%" height={100} borderRadius={12} />
          <Skeleton width="48%" height={100} borderRadius={12} />
        </View>

        {/* Tiers Scroll */}
        <View style={styles.tiers}>
          <Skeleton width={100} height={120} borderRadius={12} style={{ marginRight: 12 }} />
          <Skeleton width={100} height={120} borderRadius={12} style={{ marginRight: 12 }} />
          <Skeleton width={100} height={120} borderRadius={12} />
        </View>

        {/* Main Content Area */}
        <View style={styles.content}>
          <Skeleton width="100%" height={200} borderRadius={12} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  headerText: {
    marginLeft: 16,
  },
  scores: {
    marginBottom: 32,
  },
  worlds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  tiers: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  content: {
    marginBottom: 32,
  },
});

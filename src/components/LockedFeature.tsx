import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { TouchableOpacity } from 'react-native';

interface LockedFeatureProps {
  title: string;
  description: string;
  season?: number;
}

export function LockedFeature({ title, description, season = 2 }: LockedFeatureProps) {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="lock" size={64} color={theme.text.secondary} />
          <View style={[styles.glow, { backgroundColor: theme.accent }]} />
        </View>
        <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.text.secondary }]}>{description}</Text>
        <View style={[styles.badge, { borderColor: theme.accent, marginBottom: 40 }]}>
          <Text style={[styles.badgeText, { color: theme.accent }]}>COMING IN SEASON {season}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.backButton, { borderColor: theme.card.border }]} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.backButtonText, { color: theme.text.primary }]}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.1,
    zIndex: -1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Orbitron_700Bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_400Regular',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  backButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 1,
  },
});

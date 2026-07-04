import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { ONEMM_UNLOCK_TIER } from '../../lib/oneMMLogic';

export type ProfileTab = 'profile' | 'strength' | 'power' | 'static' | '1mm';

interface TabDef {
  id: ProfileTab;
  label: string;
  icon: string;
  unlockTier: number;
  route: string;
}

const TABS: TabDef[] = [
  { id: 'profile', label: 'PROFILE', icon: '👤', unlockTier: 0, route: '/profile' },
  { id: 'strength', label: 'STRENGTH', icon: '⚔️', unlockTier: 0, route: '/profile' },
  { id: 'power', label: 'POWER', icon: '⚡', unlockTier: 6, route: '/power-world' },
  { id: 'static', label: 'STATIC', icon: '🧊', unlockTier: 1, route: '/static-world' },
  { id: '1mm', label: '1MM', icon: '⏱️', unlockTier: ONEMM_UNLOCK_TIER, route: '/one-min-max' },
];

interface BottomTabBarProps {
  activeTab: ProfileTab;
  strengthTier: number;
  // Provided only by ProfileScreen — lets Profile/Strength switch via local
  // state instead of a route replace, since they're the same underlying route.
  onSelectProfileTab?: (tab: 'profile' | 'strength') => void;
}

export function BottomTabBar({ activeTab, strengthTier, onSelectProfileTab }: BottomTabBarProps) {
  const { theme } = useTheme();

  const handlePress = (tab: TabDef) => {
    if (tab.id === activeTab) return;

    const isUnlocked = strengthTier >= tab.unlockTier;
    if (!isUnlocked) {
      const message = `Reach Tier ${tab.unlockTier} to unlock ${tab.label}.`;
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Locked', message);
      return;
    }

    if ((tab.id === 'profile' || tab.id === 'strength')) {
      if (onSelectProfileTab) {
        onSelectProfileTab(tab.id);
      } else {
        router.replace({ pathname: '/profile', params: { activeTab: tab.id } });
      }
      return;
    }

    router.replace(tab.route as any);
  };

  return (
    <View style={[styles.bar, { backgroundColor: theme.card.background, borderTopColor: theme.card.border }]}>
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const isUnlocked = strengthTier >= tab.unlockTier;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => handlePress(tab)}
            style={styles.item}
            activeOpacity={0.7}
          >
            {isActive && <View style={[styles.activeIndicator, { backgroundColor: theme.accent }]} />}
            <Text style={[styles.icon, { opacity: isUnlocked ? 1 : 0.3 }]}>{tab.icon}</Text>
            <Text
              style={[
                styles.label,
                { color: isActive ? theme.accent : theme.text.tertiary, opacity: isUnlocked ? 1 : 0.5 },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  icon: {
    fontSize: 18,
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  activeIndicator: {
    position: 'absolute',
    top: -10,
    width: 20,
    height: 2,
    borderRadius: 1,
    alignSelf: 'center',
  },
});

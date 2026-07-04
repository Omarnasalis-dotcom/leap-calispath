import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ONEMM_UNLOCK_TIER } from '../../lib/oneMMLogic';

export type ProfileTab = 'profile' | 'strength' | 'power' | 'static' | '1mm';

interface TabDef {
  id: ProfileTab;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  unlockTier: number;
  route: string;
  // Each discipline owns one accent color (DESIGN.md's One World, One Color
  // rule) — the active tab must reflect the color of the screen it leads to,
  // not the shared theme accent, or the bar itself breaks that rule.
  accentColor: string;
}

const TABS: TabDef[] = [
  { id: 'profile', label: 'PROFILE', icon: 'account', unlockTier: 0, route: '/profile', accentColor: '#FF5252' },
  { id: 'strength', label: 'STRENGTH', icon: 'sword-cross', unlockTier: 0, route: '/profile', accentColor: '#FF5252' },
  { id: 'power', label: 'POWER', icon: 'lightning-bolt', unlockTier: 6, route: '/power-world', accentColor: '#FF5252' },
  { id: 'static', label: 'STATIC', icon: 'snowflake', unlockTier: 1, route: '/static-world', accentColor: '#7E57C2' },
  { id: '1mm', label: '1MM', icon: 'timer-outline', unlockTier: ONEMM_UNLOCK_TIER, route: '/one-min-max', accentColor: '#FF7043' },
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
            {isActive && <View style={[styles.activeIndicator, { backgroundColor: tab.accentColor }]} />}
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons
                name={tab.icon}
                size={18}
                color={isActive ? tab.accentColor : theme.text.secondary}
                style={{ opacity: isUnlocked ? 1 : 0.3 }}
              />
              {!isUnlocked && (
                <View style={[styles.lockBadge, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                  <MaterialCommunityIcons name="lock" size={9} color={theme.text.secondary} />
                </View>
              )}
            </View>
            <Text
              style={[
                styles.label,
                { color: isActive ? tab.accentColor : theme.text.secondary, opacity: isUnlocked ? 1 : 0.5 },
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
  iconWrap: {
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

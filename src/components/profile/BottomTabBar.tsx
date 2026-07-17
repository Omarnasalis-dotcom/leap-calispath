import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ONEMM_UNLOCK_TIER } from '../../lib/oneMMLogic';
import { WORLD_THEMES } from '../../../constants/worldThemes';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { TargetId } from '../../types/tutorial';

export type ProfileTab = 'profile' | 'strength' | 'power' | 'static' | '1mm';

const TAB_TARGET_IDS: Partial<Record<ProfileTab, TargetId>> = {
  profile: 'bottomTab.profile',
  strength: 'bottomTab.strength',
  power: 'bottomTab.power',
  static: 'bottomTab.static',
  '1mm': 'bottomTab.1mm',
};

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
  { id: 'profile', label: 'PROFILE', icon: 'account', unlockTier: 0, route: '/profile', accentColor: WORLD_THEMES.strength.accent },
  { id: 'strength', label: 'STRENGTH', icon: 'sword-cross', unlockTier: 0, route: '/profile', accentColor: WORLD_THEMES.strength.accent },
  { id: 'power', label: 'POWER', icon: 'lightning-bolt', unlockTier: 6, route: '/power-world', accentColor: WORLD_THEMES.power.accent },
  { id: 'static', label: 'STATIC', icon: 'snowflake', unlockTier: 1, route: '/static-world', accentColor: WORLD_THEMES.static.accent },
  { id: '1mm', label: '1MM', icon: 'timer-outline', unlockTier: ONEMM_UNLOCK_TIER, route: '/one-min-max', accentColor: WORLD_THEMES.onemm.accent },
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
  const insets = useSafeAreaInsets();
  const { ref: barRef, onLayout: onBarLayout } = useTutorialTarget('bottomTab.bar');

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
    <View
      ref={barRef}
      onLayout={onBarLayout}
      style={[
        styles.bar,
        {
          backgroundColor: theme.card.background,
          borderTopColor: theme.card.border,
          // Extends the bar's own background through the Home Indicator
          // inset so it reads as one continuous surface flush with the
          // bottom edge, instead of floating 8pt above a gap that shows
          // whatever's behind it (the screen/root background).
          paddingBottom: 8 + insets.bottom,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const isUnlocked = strengthTier >= tab.unlockTier;
        return (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={isActive}
            isUnlocked={isUnlocked}
            onPress={() => handlePress(tab)}
          />
        );
      })}
    </View>
  );
}

interface TabButtonProps {
  tab: TabDef;
  isActive: boolean;
  isUnlocked: boolean;
  onPress: () => void;
}

function TabButton({ tab, isActive, isUnlocked, onPress }: TabButtonProps) {
  const { theme } = useTheme();
  // useScreenMeasure=true: this button sits outside any ScrollView, in the
  // fixed bottom tab bar — see useTutorialTarget's own comment for why that
  // needs the pageX/pageY measurement path on Android.
  const { ref, onLayout, reportInteraction } = useTutorialTarget(TAB_TARGET_IDS[tab.id], undefined, true);

  return (
    <TouchableOpacity
      ref={ref}
      onLayout={onLayout}
      onPress={() => {
        onPress();
        reportInteraction();
      }}
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
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    // paddingBottom is set inline (8 + insets.bottom) — see JSX below.
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

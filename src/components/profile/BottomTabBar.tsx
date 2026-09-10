import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert, Platform, Animated } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ONEMM_UNLOCK_TIER } from '../../lib/oneMMLogic';
import { WORLD_THEMES, worldRgba, WorldKey } from '../../../constants/worldThemes';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { TargetId } from '../../types/tutorial';

export type ProfileTab = 'profile' | 'strength' | 'power' | 'static' | '1mm' | 'champions' | 'journey';

const TAB_TARGET_IDS: Partial<Record<ProfileTab, TargetId>> = {
  profile: 'bottomTab.profile',
  strength: 'bottomTab.strength',
  power: 'bottomTab.power',
  static: 'bottomTab.static',
  '1mm': 'bottomTab.1mm',
  champions: 'bottomTab.champions',
  journey: 'bottomTab.journey',
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
  // unlockTier 0: open to everyone as a spectator (leaderboard/phase preview)
  // — ChampionsArenaScreen itself gates the "START ARENA TRIAL" button at
  // tier 9, so no separate lock is needed just to view the tab.
  { id: 'champions', label: 'ARENA', icon: 'trophy', unlockTier: 0, route: '/champions-arena', accentColor: WORLD_THEMES.strength.accent },
  // unlockTier 0: AuthGuard already fully gates pre-onboarding users away
  // from every tab-bar screen (see app/_layout.tsx), so this tab is only
  // ever reachable once onboarding is complete — no separate lock needed.
  // Cross-world/neutral, so it borrows strength's Ember Red rather than
  // owning a discipline color of its own (same reasoning as champions above).
  { id: 'journey', label: 'JOURNEY', icon: 'map-marker-path', unlockTier: 0, route: '/my-journey', accentColor: WORLD_THEMES.strength.accent },
];

// The 3 "world" tabs collapse into a single WORLDS button in the bar (was 7
// buttons total, felt crowded) — tapping it pops these 3 up directly above
// the bar instead. Strength stays a top-level tab (it's really just
// Profile's own strength-world view, same route, switched via
// onSelectProfileTab below — not one of the 3 grouped here) — Power,
// Static, and 1MM are the actual gated "worlds" that group together.
const WORLD_TAB_IDS: ProfileTab[] = ['power', 'static', '1mm'];
const WORLD_TABS = TABS.filter((t) => WORLD_TAB_IDS.includes(t.id));
const MAIN_TABS = TABS.filter((t) => !WORLD_TAB_IDS.includes(t.id));
// tab.id -> the WorldKey WORLD_THEMES is actually keyed by (only '1mm'
// differs: its WorldKey is 'onemm', everything else matches its own id).
const WORLD_THEME_KEY: Partial<Record<ProfileTab, WorldKey>> = { power: 'power', static: 'static', '1mm': 'onemm' };

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
  const [worldsMenuOpen, setWorldsMenuOpen] = useState(false);
  // One value per world circle, started in a stagger rather than all
  // together — reads as a small "fan out" pop rather than one flat card
  // fading in (per direct feedback: the vertical list-card popup didn't
  // feel premium).
  const worldAnims = useRef(WORLD_TABS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!worldsMenuOpen) return;
    worldAnims.forEach((a) => a.setValue(0));
    Animated.stagger(
      70,
      worldAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 9 }))
    ).start();
  }, [worldsMenuOpen, worldAnims]);

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

  const activeWorldTab = WORLD_TABS.find((t) => t.id === activeTab);
  const isWorldActive = !!activeWorldTab;
  const worldsIcon = activeWorldTab?.icon ?? 'view-grid-outline';
  const worldsColor = activeWorldTab ? activeWorldTab.accentColor : theme.text.secondary;

  return (
    <>
      {/* Sibling of the bar itself (not nested inside the worlds anchor)
          so it covers the whole screen, not just that one flex column --
          same speed-dial backdrop pattern as FloatingGamesButton.tsx. */}
      {worldsMenuOpen && <Pressable style={StyleSheet.absoluteFill} onPress={() => setWorldsMenuOpen(false)} />}
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
        {/* profile, strength: MAIN_TABS[0]/[1] -- Strength stays a top-level
            tab (see WORLD_TAB_IDS comment above), rendered before the
            merged WORLDS button so the bar reads profile, strength,
            worlds, champions, journey. */}
        {MAIN_TABS.slice(0, 2).map((tab) => (
          <TabButton key={tab.id} tab={tab} isActive={tab.id === activeTab} isUnlocked={strengthTier >= tab.unlockTier} onPress={() => handlePress(tab)} />
        ))}

        <View style={styles.worldsAnchor}>
          {worldsMenuOpen && (
            <View style={styles.worldsRow} pointerEvents="box-none">
              {WORLD_TABS.map((tab, i) => {
                const unlocked = strengthTier >= tab.unlockTier;
                const anim = worldAnims[i];
                return (
                  <Animated.View
                    key={tab.id}
                    style={[
                      styles.worldCircleWrap,
                      {
                        opacity: anim,
                        transform: [
                          { scale: anim },
                          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                        ],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.worldCircle,
                        {
                          backgroundColor: unlocked ? tab.accentColor : theme.card.background,
                          borderColor: unlocked ? tab.accentColor : theme.card.border,
                          shadowColor: unlocked ? tab.accentColor : '#000000',
                        },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setWorldsMenuOpen(false);
                        handlePress(tab);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={tab.icon}
                        size={22}
                        color={unlocked ? '#FFFFFF' : theme.text.secondary}
                        style={{ opacity: unlocked ? 1 : 0.35 }}
                      />
                      {!unlocked && (
                        <View style={[styles.lockBadge, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                          <MaterialCommunityIcons name="lock" size={9} color={theme.text.secondary} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={[styles.worldCircleLabel, { color: unlocked ? theme.text.primary : theme.text.secondary, opacity: unlocked ? 1 : 0.5 }]}>
                      {tab.label}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          )}
          <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => setWorldsMenuOpen((o) => !o)}>
            {isWorldActive && <View style={[styles.activeIndicator, { backgroundColor: worldsColor }]} />}
            <View
              style={[
                styles.iconWrapPremium,
                isWorldActive && {
                  backgroundColor: WORLD_THEMES[WORLD_THEME_KEY[activeWorldTab!.id]!]?.cardFill ?? worldRgba(worldsColor, 0.06),
                  borderColor: WORLD_THEMES[WORLD_THEME_KEY[activeWorldTab!.id]!]?.cardBorder ?? worldRgba(worldsColor, 0.32),
                },
              ]}
            >
              <MaterialCommunityIcons name={worldsIcon} size={22} color={worldsColor} style={{ opacity: isWorldActive || worldsMenuOpen ? 1 : 0.85 }} />
            </View>
            <Text style={[styles.label, { color: worldsColor }]} numberOfLines={1}>
              WORLDS
            </Text>
          </TouchableOpacity>
        </View>

        {MAIN_TABS.slice(2).map((tab) => (
          <TabButton key={tab.id} tab={tab} isActive={tab.id === activeTab} isUnlocked={strengthTier >= tab.unlockTier} onPress={() => handlePress(tab)} />
        ))}
      </View>
    </>
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
      <View style={[styles.iconWrapPremium, isActive && { backgroundColor: worldRgba(tab.accentColor, 0.06), borderColor: worldRgba(tab.accentColor, 0.32) }]}>
        <MaterialCommunityIcons
          name={tab.icon}
          size={22}
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
  // Soft accent-tinted pill behind the active tab's icon -- the "premium"
  // pass: previously just a bare icon + a thin top indicator bar.
  iconWrapPremium: {
    position: 'relative',
    width: 40,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
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
  worldsAnchor: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
  },
  worldsRow: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: 14,
    flexDirection: 'row',
    gap: 18,
  },
  worldCircleWrap: {
    alignItems: 'center',
    gap: 6,
  },
  worldCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  worldCircleLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});

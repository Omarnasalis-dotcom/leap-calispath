import React from 'react';
import { View } from 'react-native';
import { Tabs, useSegments } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { BottomTabBar, ProfileTab } from '../../src/components/profile/BottomTabBar';
import { ProfileSubTabProvider, useProfileSubTab } from '../../src/contexts/ProfileSubTabContext';

// Leaf route segment -> the ProfileTab id BottomTabBar expects. 'profile'
// isn't listed here on purpose: it resolves to either 'profile' or
// 'strength' via ProfileSubTabContext, since those two share this one route.
const SEGMENT_TO_TAB: Partial<Record<string, ProfileTab>> = {
  'power-world': 'power',
  'static-world': 'static',
  'one-min-max': '1mm',
  'training-center': 'trainingCenter',
  'my-journey': 'journey',
};

// Rendered once here rather than by each screen, so it (and its WORLDS
// fan-out menu animation) persists across tab switches instead of
// unmounting/remounting with the screen underneath it — see BottomTabBar.tsx.
function PersistentTabBar() {
  const segments = useSegments();
  const leaf = segments[segments.length - 1];
  const { profile } = useAuth();
  const { subTab, setSubTab } = useProfileSubTab();

  const activeTab: ProfileTab = leaf === 'profile' ? subTab : (SEGMENT_TO_TAB[leaf] ?? 'profile');

  return (
    <BottomTabBar
      activeTab={activeTab}
      strengthTier={profile?.strength_tier || 0}
      // Only wire the local-state short-circuit while Profile is actually
      // the focused tab. From any other tab, PROFILE/STRENGTH must still
      // navigate here first (BottomTabBar falls back to router.replace when
      // this is undefined) — otherwise tapping PROFILE from, say, Power
      // World would flip context state with nothing on screen to show it.
      onSelectProfileTab={leaf === 'profile' ? setSubTab : undefined}
    />
  );
}

export default function TabsLayout() {
  return (
    <ProfileSubTabProvider>
      <View style={{ flex: 1 }}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="profile" />
          <Tabs.Screen name="power-world" />
          <Tabs.Screen name="static-world" />
          <Tabs.Screen name="one-min-max" />
          <Tabs.Screen name="training-center" />
          <Tabs.Screen name="my-journey" />
        </Tabs>
        <PersistentTabBar />
      </View>
    </ProfileSubTabProvider>
  );
}

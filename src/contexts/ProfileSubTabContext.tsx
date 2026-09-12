import React, { createContext, useContext, useState } from 'react';

type ProfileSubTab = 'profile' | 'strength';

interface ProfileSubTabContextValue {
  subTab: ProfileSubTab;
  setSubTab: (tab: ProfileSubTab) => void;
}

// Profile and Strength are the same route (app/(tabs)/profile.tsx), switched
// via local state rather than navigation. That state used to live inside
// ProfileScreen itself, which also rendered its own BottomTabBar. Now that
// the bar is hoisted up to app/(tabs)/_layout.tsx (so it persists across tab
// switches instead of remounting), both the layout (to highlight the right
// tab) and ProfileScreen (to render the right view) need to read/write the
// same state, hence this context instead of a prop.
const ProfileSubTabContext = createContext<ProfileSubTabContextValue | null>(null);

export function ProfileSubTabProvider({ children, initialTab = 'profile' }: { children: React.ReactNode; initialTab?: ProfileSubTab }) {
  const [subTab, setSubTab] = useState<ProfileSubTab>(initialTab);
  return <ProfileSubTabContext.Provider value={{ subTab, setSubTab }}>{children}</ProfileSubTabContext.Provider>;
}

export function useProfileSubTab() {
  const ctx = useContext(ProfileSubTabContext);
  if (!ctx) throw new Error('useProfileSubTab must be used within a ProfileSubTabProvider');
  return ctx;
}

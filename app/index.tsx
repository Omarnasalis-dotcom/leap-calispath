import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { SpartanLayout } from './_layout';
import { AuthScreen } from '../src/screens/AuthScreen';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { AssessmentScreen } from '../src/screens/AssessmentScreen';
import { RankRevealScreen } from '../src/screens/RankRevealScreen';
import { AssessmentGateScreen } from '../src/screens/AssessmentGateScreen';
import { TrialScreen } from '../src/screens/TrialScreen';
import { LeaderboardScreen } from '../src/screens/LeaderboardScreen';
import { PowerAssessmentScreen } from '../src/screens/PowerAssessmentScreen';
import { StaticWorldScreen } from '../src/screens/StaticWorldScreen';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';
import { WeeklyChallengeScreen } from '../src/screens/WeeklyChallengeScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Trial modes
type TrialMode = 'progression' | 'practice' | 'eternal';

export default function Index() {
  const { user, profile } = useAuth();
  const [showAssessment, setShowAssessment] = React.useState(false);
  const [showRankReveal, setShowRankReveal] = React.useState(false);
  const [showTrial, setShowTrial] = React.useState(false);
  const [showLeaderboards, setShowLeaderboards] = React.useState(false);
  const [showPowerAssessment, setShowPowerAssessment] = React.useState(false);
  const [showStaticWorld, setShowStaticWorld] = React.useState(false);
  const [showWeeklyChallenge, setShowWeeklyChallenge] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [onboardingChecked, setOnboardingChecked] = React.useState(false);
  const [leaderboardCategory, setLeaderboardCategory] = React.useState<'strength' | 'power'>('strength');
  const [leaderboardTier, setLeaderboardTier] = React.useState<number>(0);

  // Check onboarding and restore navigation state
  React.useEffect(() => {
    async function initApp() {
      try {
        const seen = await AsyncStorage.getItem('onboarding_complete');
        if (!seen) {
          setShowOnboarding(true);
        }

        // Restore navigation state
        const lastScreen = await AsyncStorage.getItem('last_screen');
        if (lastScreen === 'weekly_challenge') setShowWeeklyChallenge(true);
        if (lastScreen === 'leaderboards') setShowLeaderboards(true);
        if (lastScreen === 'static_world') setShowStaticWorld(true);
      } catch (e) {
        // ignore
      } finally {
        setOnboardingChecked(true);
      }
    }
    initApp();
  }, []);

  // Save navigation state
  React.useEffect(() => {
    async function saveNavState() {
      if (!onboardingChecked) return;
      let screen = 'profile';
      if (showWeeklyChallenge) screen = 'weekly_challenge';
      else if (showLeaderboards) screen = 'leaderboards';
      else if (showStaticWorld) screen = 'static_world';
      
      await AsyncStorage.setItem('last_screen', screen);
    }
    saveNavState();
  }, [showWeeklyChallenge, showLeaderboards, showStaticWorld, onboardingChecked]);
  
  // Trial configuration
  const [trialMode, setTrialMode] = React.useState<TrialMode>('progression');
  const [practiceTier, setPracticeTier] = React.useState<number | null>(null);

  const { theme } = useTheme();

  // Wait for onboarding check
  if (!onboardingChecked) return null;

  // Onboarding flow
  if (showOnboarding) {
    return (
      <SpartanLayout>
        <OnboardingScreen
          onComplete={async () => {
            await AsyncStorage.setItem('onboarding_complete', 'true');
            setShowOnboarding(false);
          }}
        />
      </SpartanLayout>
    );
  }

  // Not logged in → Auth
  if (!user) {
    return (
      <SpartanLayout>
        <AuthScreen />
      </SpartanLayout>
    );
  }

  // Power Assessment flow
  if (showPowerAssessment) {
    return (
      <SpartanLayout>
        <PowerAssessmentScreen
          onComplete={(newTier) => {
            setShowPowerAssessment(false);
            setLeaderboardCategory('power');
            setLeaderboardTier(newTier);
            setShowLeaderboards(true);
          }}
          onAbandon={() => {
            setShowPowerAssessment(false);
            setLeaderboardCategory('power');
            setShowLeaderboards(true);
          }}
        />
      </SpartanLayout>
    );
  }

  // Static World flow
  if (showStaticWorld) {
    return (
      <SpartanLayout>
        <StaticWorldScreen
          onClose={() => setShowStaticWorld(false)}
        />
      </SpartanLayout>
    );
  }

  // Weekly Challenge flow
  if (showWeeklyChallenge) {
    return (
      <SpartanLayout>
        <WeeklyChallengeScreen
          onClose={() => setShowWeeklyChallenge(false)}
        />
      </SpartanLayout>
    );
  }

  // Assessment flow
  if (showAssessment) {
    return (
      <SpartanLayout>
        <AssessmentScreen
          onComplete={() => {
            setShowAssessment(false);
            setShowRankReveal(true);
          }}
        />
      </SpartanLayout>
    );
  }

  // Trial flow (progression, practice, or eternal)
  if (showTrial) {
    return (
      <SpartanLayout>
        <TrialScreen
          mode={trialMode}
          practiceTier={practiceTier}
          onComplete={() => {
            setShowTrial(false);
            if (trialMode === 'progression') {
              setShowRankReveal(true);
            } else {
              // Practice/Eternal: go back to leaderboards
              setShowLeaderboards(true);
            }
          }}
          onAbandon={() => {
            setShowTrial(false);
            if (trialMode === 'practice' || trialMode === 'eternal') {
              setShowLeaderboards(true);
            }
          }}
        />
      </SpartanLayout>
    );
  }

  // Leaderboards
  if (showLeaderboards) {
    return (
      <SpartanLayout>
        <LeaderboardScreen
          key={`${leaderboardCategory}-${leaderboardTier}`}
          onClose={() => setShowLeaderboards(false)}
          onPracticeTier={(tier) => {
            setPracticeTier(tier);
            setTrialMode('practice');
            setShowLeaderboards(false);
            setShowTrial(true);
          }}
          onStartEternal={() => {
            setTrialMode('eternal');
            setShowLeaderboards(false);
            setShowTrial(true);
          }}
          onStartPowerAssessment={() => {
            setShowLeaderboards(false);
            setShowPowerAssessment(true);
          }}
          initialCategory={leaderboardCategory}
          initialTier={leaderboardTier}
        />
      </SpartanLayout>
    );
  }

  // Rank reveal ceremony
  if (showRankReveal && profile) {
    return (
      <SpartanLayout>
        <RankRevealScreen
          profile={profile}
          onContinue={() => setShowRankReveal(false)}
        />
      </SpartanLayout>
    );
  }

  // Check if assessed
  const isAssessed = profile?.assessed_at !== null;

  if (!isAssessed) {
    return (
      <SpartanLayout>
        <AssessmentGateScreen
          onStartAssessment={() => setShowAssessment(true)}
        />
      </SpartanLayout>
    );
  }

  // Main app
  return (
    <SpartanLayout>
      <ProfileScreen
        initialCategory={leaderboardCategory}
        onStartTrial={(tier?: number) => {
          if (tier !== undefined && tier < (profile?.strength_tier || 0)) {
            // Practice mode for lower tiers
            setPracticeTier(tier);
            setTrialMode('practice');
            setShowTrial(true);
          } else if ((profile?.strength_tier || 0) === 8) {
            // Eternal mode for Demigod tier (Tier 8)
            setTrialMode('eternal');
            setShowTrial(true);
          } else {
            // Progression mode for current tier
            setTrialMode('progression');
            setShowTrial(true);
          }
        }}
        onViewLeaderboards={(category, tier) => {
          setLeaderboardCategory(category);
          setLeaderboardTier(tier);
          setShowLeaderboards(true);
        }}
        onViewStaticWorld={() => setShowStaticWorld(true)}
        onViewWeeklyChallenge={() => setShowWeeklyChallenge(true)}
        onStartPowerAssessment={() => setShowPowerAssessment(true)}
      />
    </SpartanLayout>
  );
}

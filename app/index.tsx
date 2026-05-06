import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
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
import { ChampionsArenaScreen } from '../src/screens/ChampionsArenaScreen';
import { ArenaWorkoutScreen } from '../src/screens/ArenaWorkoutScreen';
import { ClashScreen } from '../src/screens/ClashScreen';
import { BattleScreen } from '../src/screens/BattleScreen';
import { GloryLeaderboardScreen } from '../src/screens/GloryLeaderboardScreen';
import { ClashService } from '../src/services/ClashService';
import { ArenaPhase } from '../src/services/ArenaService';
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
  const [showChampionsArena, setShowChampionsArena] = React.useState(false);
  const [showArenaWorkout, setShowArenaWorkout] = React.useState(false);
  const [showClash, setShowClash] = React.useState(false);
  const [showBattle, setShowBattle] = React.useState(false);
  const [showGloryLeaderboard, setShowGloryLeaderboard] = React.useState(false);
  const [activeClashId, setActiveClashId] = React.useState<string | null>(null);
  const [selectedArenaPhase, setSelectedArenaPhase] = React.useState<ArenaPhase | null>(null);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [onboardingChecked, setOnboardingChecked] = React.useState(false);
  const [leaderboardCategory, setLeaderboardCategory] = React.useState<'strength' | 'power'>('strength');
  const [leaderboardTier, setLeaderboardTier] = React.useState<number>(0);

  // Trial configuration
  const [trialMode, setTrialMode] = React.useState<TrialMode>('progression');
  const [practiceTier, setPracticeTier] = React.useState<number | null>(null);

  const { theme } = useTheme();

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
        if (lastScreen === 'leaderboards') {
          const savedCat = await AsyncStorage.getItem('leaderboard_category');
          const savedTier = await AsyncStorage.getItem('leaderboard_tier');
          if (savedCat) setLeaderboardCategory(savedCat as 'strength' | 'power');
          if (savedTier) setLeaderboardTier(parseInt(savedTier));
          setShowLeaderboards(true);
        }
        if (lastScreen === 'static_world') setShowStaticWorld(true);
        if (lastScreen === 'champions_arena') setShowChampionsArena(true);
        if (lastScreen === 'clash') setShowClash(true);
        if (lastScreen === 'glory_leaderboard') {
          setShowClash(true);
          setShowGloryLeaderboard(true);
        }
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
      else if (showLeaderboards) {
        screen = 'leaderboards';
        await AsyncStorage.setItem('leaderboard_category', leaderboardCategory);
        await AsyncStorage.setItem('leaderboard_tier', leaderboardTier.toString());
      }
      else if (showStaticWorld) screen = 'static_world';
      else if (showChampionsArena) screen = 'champions_arena';
      else if (showClash) screen = 'clash';
      else if (showGloryLeaderboard) screen = 'glory_leaderboard';
      
      await AsyncStorage.setItem('last_screen', screen);
    }
    saveNavState();
  }, [showWeeklyChallenge, showLeaderboards, showStaticWorld, showChampionsArena, showClash, showGloryLeaderboard, leaderboardCategory, leaderboardTier, onboardingChecked]);

  // Global Clash Listener
  React.useEffect(() => {
    if (!user) return;
    const subscription = ClashService.subscribeToIncomingChallenges(user.id, (payload) => {
      // Auto-open clash screen if new invite comes in
      setShowClash(true);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Handle back button for persistent screens
  const handleCloseClash = () => {
    setShowClash(false);
    AsyncStorage.setItem('last_screen', 'profile');
  };

  const handleCloseGlory = () => {
    setShowGloryLeaderboard(false);
    AsyncStorage.setItem('last_screen', 'clash');
  };

  // Wait for onboarding check
  if (!onboardingChecked) return null;

  // 1. Auth Flow
  if (!user) {
    return (
      <SpartanLayout>
        <AuthScreen />
      </SpartanLayout>
    );
  }

  // 2. Main Content Resolver
  const renderContent = () => {
    if (showOnboarding) {
      return (
        <OnboardingScreen
          onComplete={async () => {
            await AsyncStorage.setItem('onboarding_complete', 'true');
            setShowOnboarding(false);
          }}
        />
      );
    }

    if (showPowerAssessment) {
      return (
        <PowerAssessmentScreen
          onAbandon={() => setShowPowerAssessment(false)}
          onComplete={() => {
            setShowPowerAssessment(false);
            setShowRankReveal(true);
          }}
        />
      );
    }

    if (showStaticWorld) {
      return (
        <StaticWorldScreen
          onClose={() => setShowStaticWorld(false)}
        />
      );
    }

    if (showWeeklyChallenge) {
      return (
        <WeeklyChallengeScreen
          onClose={() => setShowWeeklyChallenge(false)}
        />
      );
    }

    if (showChampionsArena) {
      return (
        <ChampionsArenaScreen
          onClose={() => setShowChampionsArena(false)}
          onStartArenaWorkout={(phase) => {
            setSelectedArenaPhase(phase);
            setShowChampionsArena(false);
            setShowArenaWorkout(true);
          }}
        />
      );
    }

    if (showArenaWorkout && selectedArenaPhase) {
      return (
        <ArenaWorkoutScreen
          phase={selectedArenaPhase}
          onClose={() => {
            setShowArenaWorkout(false);
            setShowChampionsArena(true);
          }}
          onComplete={() => {
            setShowArenaWorkout(false);
            setShowChampionsArena(true);
          }}
        />
      );
    }

    if (showAssessment) {
      return (
        <AssessmentScreen
          onComplete={() => {
            setShowAssessment(false);
            setShowRankReveal(true);
          }}
        />
      );
    }

    if (showTrial) {
      return (
        <TrialScreen
          mode={trialMode}
          practiceTier={practiceTier}
          onComplete={() => {
            setShowTrial(false);
            if (trialMode === 'progression') {
              setShowRankReveal(true);
            } else {
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
      );
    }

    if (showLeaderboards) {
      return (
        <LeaderboardScreen
          key={`${leaderboardCategory}-${leaderboardTier}`}
          onClose={() => setShowLeaderboards(false)}
          onCategoryChange={(cat) => setLeaderboardCategory(cat)}
          onTierChange={(tier) => setLeaderboardTier(tier)}
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
      );
    }

    if (showRankReveal && profile) {
      return (
        <RankRevealScreen
          profile={profile}
          onContinue={() => setShowRankReveal(false)}
        />
      );
    }

    const isAssessed = profile?.assessed_at !== null;
    if (!isAssessed) {
      return (
        <AssessmentGateScreen
          onStartAssessment={() => setShowAssessment(true)}
        />
      );
    }

    return (
      <ProfileScreen
        initialCategory={leaderboardCategory}
        onOpenAssessment={() => setShowAssessment(true)}
        onStartTrial={(tier?: number) => {
          if (tier !== undefined && tier < (profile?.strength_tier || 0)) {
            setPracticeTier(tier);
            setTrialMode('practice');
            setShowTrial(true);
          } else if ((profile?.strength_tier || 0) === 8) {
            setTrialMode('eternal');
            setShowTrial(true);
          } else {
            setTrialMode('progression');
            setShowTrial(true);
          }
        }}
        onViewLeaderboards={(category, tier) => {
          setLeaderboardCategory(category);
          setLeaderboardTier(tier);
          setShowLeaderboards(true);
        }}
        onOpenPowerAssessment={() => setShowPowerAssessment(true)}
        onOpenStaticWorld={() => setShowStaticWorld(true)}
        onOpenWeeklyChallenge={() => setShowWeeklyChallenge(true)}
        onOpenChampionsArena={() => setShowChampionsArena(true)}
        onOpenClash={() => {
          console.log('OPENING_CLASH_SCREEN');
          setShowClash(true);
        }}
      />
    );
  };

  return (
    <SpartanLayout hideToggle={showBattle}>
      <View style={{ flex: 1 }}>
        {renderContent()}
        
        {showClash && (
          <View style={StyleSheet.absoluteFill}>
            <ClashScreen 
              onClose={handleCloseClash}
              onOpenRankings={() => setShowGloryLeaderboard(true)}
              onStartBattle={(clashId) => {
                setActiveClashId(clashId);
                setShowClash(false);
                setShowBattle(true);
              }}
            />
          </View>
        )}

        {showGloryLeaderboard && (
          <View style={StyleSheet.absoluteFill}>
            <GloryLeaderboardScreen 
              onClose={handleCloseGlory}
            />
          </View>
        )}

        {showBattle && activeClashId && (
          <View style={StyleSheet.absoluteFill}>
            <BattleScreen 
              clashId={activeClashId}
              onFinish={() => {
                setShowBattle(false);
                setActiveClashId(null);
              }}
            />
          </View>
        )}
      </View>
    </SpartanLayout>
  );
}

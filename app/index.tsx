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

// Trial modes
type TrialMode = 'progression' | 'practice' | 'eternal';

export default function Index() {
  const { user, profile } = useAuth();
  const [showAssessment, setShowAssessment] = React.useState(false);
  const [showRankReveal, setShowRankReveal] = React.useState(false);
  const [showTrial, setShowTrial] = React.useState(false);
  const [showLeaderboards, setShowLeaderboards] = React.useState(false);
  const [showPowerAssessment, setShowPowerAssessment] = React.useState(false);
  const [leaderboardCategory, setLeaderboardCategory] = React.useState<'strength' | 'power'>('strength');
  
  // Trial configuration
  const [trialMode, setTrialMode] = React.useState<TrialMode>('progression');
  const [practiceTier, setPracticeTier] = React.useState<number | null>(null);

  const { theme } = useTheme();

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
            setShowRankReveal(true);
          }}
          onAbandon={() => setShowPowerAssessment(false)}
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
          initialCategory={leaderboardCategory}
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
        onStartTrial={(tier?: number) => {
          if (tier !== undefined && tier < (profile?.strength_tier || 0)) {
            // Practice mode for lower tiers
            setPracticeTier(tier);
            setTrialMode('practice');
            setShowTrial(true);
          } else {
            // Progression mode for current tier
            setTrialMode('progression');
            setShowTrial(true);
          }
        }}
        onViewLeaderboards={(category) => {
          setLeaderboardCategory(category);
          setShowLeaderboards(true);
        }}
        onStartPowerAssessment={() => setShowPowerAssessment(true)}
      />
    </SpartanLayout>
  );
}

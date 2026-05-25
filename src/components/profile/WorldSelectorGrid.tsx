import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

interface World {
  id: string;
  name: string;
  icon: string;
  unlockTier: number;
  action: () => void;
}

interface WorldSelectorGridProps {
  category: string;
  strengthTier: number;
  mode: 'light' | 'dark';
  theme: any;
  onSwitchStrength: () => void;
  onOpenPowerAssessment: () => void;
  onOpenStaticWorld: () => void;
  onOpenOneMinMax: () => void;
  onOpenTournamentArena: () => void;
  onOpenClash: () => void;
  onOpenWeeklyChallenge: () => void;
  onOpenChampionsArena: () => void;
}

export function WorldSelectorGrid({
  category,
  strengthTier,
  mode,
  theme,
  onSwitchStrength,
  onOpenPowerAssessment,
  onOpenStaticWorld,
  onOpenOneMinMax,
  onOpenTournamentArena,
  onOpenClash,
  onOpenWeeklyChallenge,
  onOpenChampionsArena,
}: WorldSelectorGridProps) {
  const worlds: World[] = [
    { id: 'strength',   name: 'STRENGTH',   icon: '⚔️', unlockTier: 0, action: onSwitchStrength },
    { id: 'power',      name: 'POWER',      icon: '⚡', unlockTier: 6, action: onOpenPowerAssessment },
    { id: 'static',     name: 'STATIC',     icon: '🧊', unlockTier: 1, action: onOpenStaticWorld },
    { id: '1mm',        name: '1MM',        icon: '⏱️', unlockTier: 0, action: onOpenOneMinMax },
    { id: 'tournament', name: 'TOURNAMENT', icon: '🏟️', unlockTier: 0, action: onOpenTournamentArena },
    { id: 'clash',      name: 'CLASH',      icon: '🔥', unlockTier: 2, action: onOpenClash },
    { id: 'weekly',     name: 'WEEKLY',     icon: '🏆', unlockTier: 0, action: onOpenWeeklyChallenge },
    { id: 'champions',  name: 'CHAMPIONS',  icon: '🏛️', unlockTier: 8, action: onOpenChampionsArena },
  ];

  return (
    <View style={styles.worldPillsGrid}>
      {worlds.map((world) => {
        const isActive = category === world.id;
        const isUnlocked = strengthTier >= world.unlockTier;
        return (
          <TouchableOpacity
            key={world.id}
            onPress={() => {
              if (isUnlocked) {
                world.action?.();
              } else {
                Alert.alert('Locked', `Reach Tier ${world.unlockTier} to unlock ${world.name}.`);
              }
            }}
            style={[
              styles.worldPillCompact,
              {
                backgroundColor: isActive ? theme.accent : (mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                borderColor: isActive ? theme.accent : `${theme.accent}40`,
                opacity: isUnlocked ? 1 : 0.4,
              }
            ]}
          >
            <Text style={{ fontSize: 12 }}>{world.icon}</Text>
            <Text style={[styles.worldPillText, { color: isActive ? '#000' : theme.text.primary }]} numberOfLines={1}>
              {world.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  worldPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  worldPillCompact: {
    width: '23%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    justifyContent: 'center',
  },
  worldPillText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});

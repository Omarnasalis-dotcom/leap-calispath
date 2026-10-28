import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';
import type { VideoSource } from 'expo-video';

export interface ExerciseMediaEntry {
  video: VideoSource;
  /** The same clip on the light theme's background (#F0F0F0) instead of black. */
  videoLight?: VideoSource;
  poster?: ImageSourcePropType;
}

export const EXERCISE_MEDIA: Record<string, ExerciseMediaEntry> = {
  strict_pullup: {
    video: require('../../assets/exercises/strict_pullup.mov'),
    videoLight: require('../../assets/exercises/strict_pullup_light.mov'),
  },
  standard_dip: {
    video: require('../../assets/exercises/Dips.mov'),
    videoLight: require('../../assets/exercises/Dips_light.mov'),
  },
  bench_dip: {
    video: require('../../assets/exercises/Dips.mov'),
    videoLight: require('../../assets/exercises/Dips_light.mov'),
  },
  standard_pushup: {
    video: require('../../assets/exercises/PushUps.mov'),
    videoLight: require('../../assets/exercises/PushUps_light.mov'),
  },
  knee_pushup: {
    video: require('../../assets/exercises/PushUps.mov'),
    videoLight: require('../../assets/exercises/PushUps_light.mov'),
  },
  strict_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
    videoLight: require('../../assets/exercises/Muscleup_light.mov'),
  },
  banded_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
    videoLight: require('../../assets/exercises/Muscleup_light.mov'),
  },
  jumping_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
    videoLight: require('../../assets/exercises/Muscleup_light.mov'),
  },
};

export function getExerciseMedia(movementId: string): ExerciseMediaEntry | undefined {
  return EXERCISE_MEDIA[movementId];
}

export function preloadExerciseMedia(movementId: string): void {
  const entry = EXERCISE_MEDIA[movementId];
  if (!entry) return;

  [entry.video, entry.videoLight, entry.poster].forEach((source) => {
    if (typeof source === 'number') {
      Asset.fromModule(source).downloadAsync().catch(() => {});
    }
  });
}

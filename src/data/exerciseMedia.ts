import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';
import type { VideoSource } from 'expo-video';

export interface ExerciseMediaEntry {
  video: VideoSource;
  poster?: ImageSourcePropType;
}

export const EXERCISE_MEDIA: Record<string, ExerciseMediaEntry> = {
  strict_pullup: {
    video: require('../../assets/exercises/strict_pullup.mov'),
  },
  standard_dip: {
    video: require('../../assets/exercises/Dips.mov'),
  },
  bench_dip: {
    video: require('../../assets/exercises/Dips.mov'),
  },
  standard_pushup: {
    video: require('../../assets/exercises/Push ups .mov'),
  },
  knee_pushup: {
    video: require('../../assets/exercises/Push ups .mov'),
  },
  strict_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
  },
  banded_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
  },
  jumping_mu: {
    video: require('../../assets/exercises/Muscleup.mov'),
  },
};

export function getExerciseMedia(movementId: string): ExerciseMediaEntry | undefined {
  return EXERCISE_MEDIA[movementId];
}

export function preloadExerciseMedia(movementId: string): void {
  const entry = EXERCISE_MEDIA[movementId];
  if (!entry) return;

  [entry.video, entry.poster].forEach((source) => {
    if (typeof source === 'number') {
      Asset.fromModule(source).downloadAsync().catch(() => {});
    }
  });
}

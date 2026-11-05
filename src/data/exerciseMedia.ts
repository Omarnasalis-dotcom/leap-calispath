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
    video: require('../../assets/exercises/v2/strict_pullup.mov'),
    videoLight: require('../../assets/exercises/v2/strict_pullup_light.mov'),
  },
  inverted_row: {
    video: require('../../assets/exercises/v2/inverted_row.mov'),
    videoLight: require('../../assets/exercises/v2/inverted_row_light.mov'),
  },
  standard_dip: {
    video: require('../../assets/exercises/v2/Dips.mov'),
    videoLight: require('../../assets/exercises/v2/Dips_light.mov'),
  },
  bench_dip: {
    video: require('../../assets/exercises/v2/bench_dip.mov'),
    videoLight: require('../../assets/exercises/v2/bench_dip_light.mov'),
  },
  standard_pushup: {
    video: require('../../assets/exercises/v2/PushUps.mov'),
    videoLight: require('../../assets/exercises/v2/PushUps_light.mov'),
  },
  knee_pushup: {
    video: require('../../assets/exercises/v2/knee_pushup.mov'),
    videoLight: require('../../assets/exercises/v2/knee_pushup_light.mov'),
  },
  strict_mu: {
    video: require('../../assets/exercises/v2/Muscleup.mov'),
    videoLight: require('../../assets/exercises/v2/Muscleup_light.mov'),
  },
  banded_mu: {
    video: require('../../assets/exercises/v2/Muscleup.mov'),
    videoLight: require('../../assets/exercises/v2/Muscleup_light.mov'),
  },
  jumping_mu: {
    video: require('../../assets/exercises/v2/Muscleup.mov'),
    videoLight: require('../../assets/exercises/v2/Muscleup_light.mov'),
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

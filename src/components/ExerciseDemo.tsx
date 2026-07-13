import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, AccessibilityInfo } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getExerciseMedia } from '../data/exerciseMedia';

interface ExerciseDemoProps {
  movementId: string;
  label: string;
}

export function ExerciseDemo({ movementId, label }: ExerciseDemoProps) {
  const media = getExerciseMedia(movementId);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const showVideo = !!media?.video && !reduceMotion;

  const player = useVideoPlayer(showVideo ? media!.video : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // On web, the underlying <video> element doesn't exist yet when this setup
  // callback runs (VideoView mounts after), so play() called there is a
  // silent no-op — the player has nothing to play against. Calling it again
  // here, after mount, is what actually starts playback on web; harmless
  // no-op on native where the setup-callback play() already works.
  useEffect(() => {
    if (showVideo) {
      player.play();
    }
  }, [player, showVideo]);

  if (!media) return null;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Demonstration: ${label}`}
      importantForAccessibility="no-hide-descendants"
    >
      {media.poster && (
        <Image source={media.poster} style={styles.media} resizeMode="cover" />
      )}
      {showVideo && (
        <VideoView
          player={player}
          style={[styles.media, styles.overlay]}
          nativeControls={false}
          contentFit="cover"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 160,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

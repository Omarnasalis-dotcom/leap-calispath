import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Design handoff tokens. The card stays dark in both themes — it reads as a
// feature banner, same as the Training Center tiles. Oswald (handoff font)
// isn't bundled, so BarlowCondensed stands in at the matching weights.
const CORAL = '#FC5454';
// Quiet frosted CTA instead of the handoff's coral fill — Profile already
// carries a lot of red (tier ring, WRA card, badges); coral stays on the
// stripe only.
const BUTTON_FILL = 'rgba(255, 255, 255, 0.08)';
const BUTTON_BORDER = 'rgba(255, 255, 255, 0.18)';
const BUTTON_TEXT = '#FFFFFF';

interface PhotoActionCardProps {
  photo: ImageSourcePropType;
  eyebrow: string;
  title: string;
  cta: string;
  onPress: () => void;
}

function ChevronRight() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path d="M6 3.5 L10.5 8 L6 12.5" stroke={BUTTON_TEXT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Profile's shared photo-cover action card (Active Program, Weekly
 * Challenge): dimmed photo, coral stripe, eyebrow + title header, and a
 * full-width CTA.
 */
export function PhotoActionCard({ photo, eyebrow, title, cta, onPress }: PhotoActionCardProps) {
  return (
    <View style={styles.card}>
      <Image source={photo} resizeMode="cover" style={styles.bgPhoto} />
      <View style={styles.stripe} />

      <View>
        <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={cta}
      >
        <Text style={styles.buttonLabel} numberOfLines={1}>{cta}</Text>
        <ChevronRight />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F0F0F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    padding: 13,
    gap: 11,
    overflow: 'hidden',
  },
  // Photo texture behind the content, dimmed by the card's own #0F0F0F.
  bgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    opacity: 0.7,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: CORAL,
  },
  // Soft shadow keeps both lines crisp over the 0.7-opacity photo.
  eyebrow: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.7,
    color: '#C8C8C8',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: 1,
    color: '#FFFFFF',
    marginTop: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  button: {
    height: 46,
    borderRadius: 12,
    backgroundColor: BUTTON_FILL,
    borderWidth: 1,
    borderColor: BUTTON_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14.5,
    letterSpacing: 2.1,
    color: BUTTON_TEXT,
  },
});

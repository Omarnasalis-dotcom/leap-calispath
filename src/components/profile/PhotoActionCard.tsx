import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { FLIP_X, isRTL } from '../../i18n';
import { useTheme } from '../../contexts/ThemeContext';

// Design handoff tokens. Dark mode: a dark feature banner, same as the
// Training Center tiles. Light mode: a white card with dark text over a
// white wash, matching the Journey's light cards. Oswald (handoff font)
// isn't bundled, so BarlowCondensed stands in at the matching weights.
const CORAL = '#FC5454';
// Quiet frosted CTA instead of the handoff's coral fill — Profile already
// carries a lot of red (tier ring, WRA card, badges); coral stays on the
// stripe only.
const BUTTON_FILL = 'rgba(255, 255, 255, 0.08)';
const BUTTON_BORDER = 'rgba(255, 255, 255, 0.18)';
const BUTTON_TEXT = '#FFFFFF';
const LIGHT_INK = '#151515';

interface PhotoActionCardProps {
  photo: ImageSourcePropType;
  eyebrow: string;
  title: string;
  cta: string;
  onPress: () => void;
  /** Frame only (photo, stripe, empty button) at the final height — no text, not tappable. */
  loading?: boolean;
  /** Photo opacity over the card's base (#0F0F0F dark, white light) — defaults to 0.7 dark, 1 light. */
  photoOpacity?: number;
}

function ChevronRight({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" style={FLIP_X}>
      <Path d="M6 3.5 L10.5 8 L6 12.5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Profile's shared photo-cover action card (Active Program, Weekly
 * Challenge): dimmed photo, coral stripe, eyebrow + title header, and a
 * full-width CTA.
 */
export function PhotoActionCard({ photo, eyebrow, title, cta, onPress, loading, photoOpacity }: PhotoActionCardProps) {
  const isLight = useTheme().mode === 'light';
  const opacity = photoOpacity ?? (isLight ? 1 : undefined);
  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      {/* Mirrored in Arabic (FLIP_X) along with the rest of the card, so the
          photo keeps the same composition against the stripe and text. */}
      <Image source={photo} resizeMode="cover" style={[styles.bgPhoto, opacity != null && { opacity }, FLIP_X]} />
      {isLight && (
        // White wash from the text side (right in Arabic -- gradient
        // coordinates aren't layout-mirrored), photo bright on the far side.
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          locations={[0, 0.35, 0.68]}
          start={{ x: isRTL ? 1 : 0, y: 0.5 }}
          end={{ x: isRTL ? 0 : 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.stripe} />

      <View>
        {/* A single space keeps each line's height while loading. */}
        <Text style={[styles.eyebrow, isLight && styles.eyebrowLight]} numberOfLines={1}>{loading ? ' ' : eyebrow}</Text>
        <Text style={[styles.title, isLight && styles.titleLight]} numberOfLines={1}>{loading ? ' ' : title}</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={loading}
        style={[styles.button, isLight && styles.buttonLight]}
        accessibilityRole="button"
        accessibilityLabel={loading ? 'Loading' : cta}
        accessibilityState={{ busy: !!loading }}
      >
        <Text style={[styles.buttonLabel, isLight && styles.buttonLabelLight]} numberOfLines={1}>{loading ? ' ' : cta}</Text>
        {!loading && <ChevronRight color={isLight ? LIGHT_INK : BUTTON_TEXT} />}
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
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  eyebrowLight: {
    color: 'rgba(0, 0, 0, 0.6)',
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  titleLight: {
    color: LIGHT_INK,
    textShadowColor: 'transparent',
    textShadowRadius: 0,
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
  buttonLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  buttonLabelLight: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    color: LIGHT_INK,
  },
});

// Design handoff FAB entry point — extracted from Leap Coach FAB.dc.html's
// "left phone" panel (undocumented in the README's prose, which scopes
// itself to the chat window only, but the FAB's own markup there is a
// real, complete spec). Replaces the old two-step flow (ProfileHeader's
// outlined "ASK LEAP COACH" button -> a plain confirm modal -> navigate) —
// this component's own open panel IS the new confirmation step.
//
// Motion again follows this app's only existing pattern (plain RN
// `Animated`, no reanimated/moti). Simplified from the full spec: the two
// small orbiting particles are dropped (a decorative detail, not worth a
// second animation system) — pulse rings, bob, the sheen sweep, and the
// waveform icon (shared motif with the composer's send button) are kept,
// since those are what actually reads as "this button is alive."
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { COACH_COLORS } from './coachTokens';
import { computeCoachTeaser } from './coachTeaser';

const FAB_SIZE = 48;

// Module scope, not AsyncStorage: resets on every fresh app launch (what
// "pop up when the user opens the app" actually means) without persisting
// forever like the old once-ever-in-the-app's-lifetime flag did, and
// without re-firing on every ProfileScreen re-render within the same run.
let hasShownGreetingThisSession = false;

interface Props {
  profile: { statics_tier?: number | null; power_points?: number | null; one_mm_points?: number | null } | null;
  canAccessCoach: boolean;
  onOpenCoach: (firstPrompt?: string) => void;
}

export function CoachFab({ profile, canAccessCoach, onOpenCoach }: Props) {
  const { theme, mode } = useTheme();
  const c = mode === 'dark' ? COACH_COLORS.dark : COACH_COLORS.light;
  const [open, setOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  // Panel is a bottom-sheet — still needs to clear BottomTabBar.tsx's tabs,
  // same height math as before (paddingTop 10 + ~22 icon + 3 gap + ~11
  // label + paddingBottom 8+insets.bottom).
  const insets = useSafeAreaInsets();
  const tabBarHeight = 10 + 22 + 3 + 11 + 8 + insets.bottom;
  const panelBottom = tabBarHeight + 12;
  // Collapsed button docks right at the top-right corner (MARGIN 16) — the
  // only thing up there now; the games button (FloatingGamesButton.tsx)
  // moved to the left side, below the settings gear.
  const fabTop = 16;

  const breathe = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const wave = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!hasShownGreetingThisSession) {
      hasShownGreetingThisSession = true;
      setShowGreeting(true);
      setTimeout(() => setShowGreeting(false), 4500);
    }
  }, []);

  useEffect(() => {
    const breatheLoop = Animated.loop(
      Animated.timing(breathe, { toValue: 1, duration: 2600, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sheen, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const waveLoops = wave.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      )
    );
    breatheLoop.start(); bobLoop.start(); sheenLoop.start(); waveLoops.forEach((l) => l.start());
    return () => { breatheLoop.stop(); bobLoop.stop(); sheenLoop.stop(); waveLoops.forEach((l) => l.stop()); };
  }, []);

  if (!canAccessCoach) return null;

  const teaser = computeCoachTeaser(profile);

  const ringScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const ringOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const sheenX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-30, 30] });

  const handlePrompt = (prompt: string) => {
    setOpen(false);
    onOpenCoach(prompt);
  };

  return (
    <>
      {showGreeting && !open && (
        <View pointerEvents="none" style={[fabStyles.greeting, { top: fabTop + FAB_SIZE + 8, backgroundColor: c.bubbleBg, borderColor: c.bubbleBorder }]}>
          <Text style={[fabStyles.greetingTitle, { color: c.bodyText }]}>I'M YOUR COACH</Text>
          <Text style={[fabStyles.greetingSub, { color: c.secondaryText }]}>Here to help you any time.</Text>
        </View>
      )}

      <View style={[fabStyles.wrap, { top: fabTop }]}>
        <Animated.View
          pointerEvents="none"
          style={[fabStyles.ring, { borderColor: theme.accent, transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
        <Animated.View style={{ transform: [{ translateY: bobY }] }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setOpen(true)}
            style={[fabStyles.button, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Open Leap Coach"
          >
            <Animated.View pointerEvents="none" style={[fabStyles.sheen, { transform: [{ translateX: sheenX }] }]} />
            {wave.map((v, i) => (
              <Animated.View
                key={i}
                style={[fabStyles.waveBar, { height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 14] }) }]}
              />
            ))}
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={fabStyles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <BlurView intensity={25} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        </TouchableOpacity>
        <View style={[fabStyles.panel, { bottom: panelBottom + 76, backgroundColor: c.bubbleBg, borderColor: c.bubbleBorder }]}>
          <View style={fabStyles.panelHeader}>
            <View style={[fabStyles.panelAvatarRing, { borderColor: theme.accent }]}>
              <View style={[fabStyles.panelAvatarDot, { backgroundColor: theme.accent }]} />
            </View>
            <Text style={[fabStyles.panelTitle, { color: c.bodyText }]}>LEAP COACH</Text>
          </View>
          <Text style={[fabStyles.panelHeadline, { color: c.bodyText }]}>I'M YOUR COACH</Text>
          <Text style={[fabStyles.panelSub, { color: c.secondaryText }]}>Here to help you any time.</Text>
          {teaser && (
            <>
              <Text style={[fabStyles.panelLine, { color: c.bodyText }]}>{teaser.line}</Text>
              <View style={fabStyles.panelChips}>
                {teaser.prompts.map((p, i) => (
                  <TouchableOpacity key={i} style={[fabStyles.panelChip, { borderColor: c.chipBorder }]} onPress={() => handlePrompt(p)}>
                    <Text style={[fabStyles.panelChipText, { color: theme.accent }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <TouchableOpacity style={[fabStyles.panelOpenBtn, { borderColor: c.chipBorder }]} onPress={() => { setOpen(false); onOpenCoach(); }}>
            <Text style={[fabStyles.panelOpenBtnText, { color: c.secondaryText }]}>OPEN CHAT</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const fabStyles = StyleSheet.create({
  // `top` set inline (fabTop) — see the component for why this can't be a
  // static value (depends on FloatingGamesButton.tsx's own layout).
  wrap: { position: 'absolute', right: 16, width: FAB_SIZE, height: FAB_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, borderWidth: 1 },
  button: {
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 2.5, overflow: 'hidden',
    shadowColor: '#FC5454', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  sheen: { position: 'absolute', width: 24, height: 72, backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ rotate: '20deg' }] },
  waveBar: { width: 2, borderRadius: 2, backgroundColor: '#fff' },
  greeting: {
    // `top` set inline (fabTop + FAB_SIZE + 8) — sits below the collapsed
    // button now that it docks top-right instead of bottom-right, so the
    // tail corner flips from bottom-right to top-right to point up at it.
    position: 'absolute', right: 16, borderWidth: 1, borderRadius: 16, borderTopRightRadius: 4,
    padding: 12, maxWidth: 190,
  },
  greetingTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  greetingSub: { fontSize: 11.5, fontWeight: '300', marginTop: 3 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: {
    // `bottom` set inline (panelBottom + 76) — clears BottomTabBar.tsx.
    position: 'absolute', left: 16, right: 16, borderWidth: 1, borderRadius: 22, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 40, elevation: 20,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelAvatarRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  panelAvatarDot: { width: 9, height: 9, borderRadius: 4.5 },
  panelTitle: { fontSize: 15, fontWeight: '600', letterSpacing: 2.5 },
  panelHeadline: { fontSize: 21, fontWeight: '700', letterSpacing: 1.3, marginTop: 16 },
  panelSub: { fontSize: 13.5, fontWeight: '300', marginTop: 4 },
  panelLine: { fontSize: 14, fontWeight: '300', lineHeight: 21.7, marginTop: 14 },
  panelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  panelChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  panelChipText: { fontSize: 11, letterSpacing: 1.4, fontWeight: '500' },
  panelOpenBtn: { marginTop: 18, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  panelOpenBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});

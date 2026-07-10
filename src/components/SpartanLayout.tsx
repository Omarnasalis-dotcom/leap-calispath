import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../contexts/ThemeContext';

interface SpartanLayoutProps {
  children: React.ReactNode;
  hideToggle?: boolean;
  // Screens that end in a bottom tab bar (BottomTabBar) manage the bottom
  // safe-area inset themselves, extending their own background through it
  // so it reads as one continuous surface. Without this flag, SpartanLayout's
  // own paddingBottom reserves that same space first — the tab bar then
  // sits inside an already-inset box and can never reach the true edge,
  // showing a gap of SpartanLayout's background instead.
  noBottomInset?: boolean;
}

export function SpartanLayout({ children, hideToggle, noBottomInset }: SpartanLayoutProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    StatusBar.setBarStyle(theme.statusBar);
  }, [theme.statusBar]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.statusBar} />
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary]}
        style={styles.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {isOffline && (
        <View style={[styles.offlineBanner, { top: insets.top }]}>
          <Text style={styles.offlineText}>NO CONNECTION — RESULTS WON'T SAVE</Text>
        </View>
      )}
      <View style={[styles.content, {
        paddingTop: insets.top,
        paddingBottom: noBottomInset ? 0 : insets.bottom
      }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  offlineBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99,
    backgroundColor: '#A32D2D',
    paddingVertical: 6,
    alignItems: 'center',
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default SpartanLayout;

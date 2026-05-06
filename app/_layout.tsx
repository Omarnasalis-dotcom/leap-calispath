import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../src/contexts/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

interface SpartanLayoutProps {
  children: React.ReactNode;
  hideToggle?: boolean;
}

export function SpartanLayout({ children, hideToggle }: SpartanLayoutProps) {
  const { theme } = useTheme();

  useEffect(() => {
    StatusBar.setBarStyle(theme.statusBar);
  }, [theme.statusBar]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.statusBar} />
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary]}
        style={styles.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {!hideToggle && <ThemeToggle />}
      <View style={styles.content}>
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
});

export default SpartanLayout;

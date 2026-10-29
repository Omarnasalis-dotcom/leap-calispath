import React from 'react';
import { View, Text, StyleSheet, Linking, SafeAreaView } from 'react-native';
import { LeapLogo } from './LeapLogo';
import { Button } from './Button';
import { useTheme } from '../contexts/ThemeContext';
import { t, isArabic } from '../i18n';

interface ForceUpdateScreenProps {
  message: string;
  storeUrl: string;
}

// No dismiss, no back button, no bypass — this is the entire screen, not a
// modal over the app. Rendered instead of the normal app tree, never
// alongside it.
export function ForceUpdateScreen({ message, storeUrl }: ForceUpdateScreenProps) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.content}>
        <LeapLogo size={100} animated={false} />
        <Text style={[styles.title, { color: theme.text.primary }]}>{t('system.updateTitle')}</Text>
        <Text style={[styles.message, { color: theme.text.secondary }]}>{isArabic ? t('system.updateMessage') : message}</Text>
        {!!storeUrl && (
          <Button title={t('system.updateNow')} onPress={() => Linking.openURL(storeUrl)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
});

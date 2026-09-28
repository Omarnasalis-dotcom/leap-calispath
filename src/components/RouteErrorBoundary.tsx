import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { t } from '../i18n';

// Per-screen error boundary (audit 2026-09-25, L22). Each route file
// re-exports this as `ErrorBoundary`, which Expo Router renders in place of
// just that screen when it throws — the rest of the app (tabs, back stack)
// keeps working, instead of GlobalErrorBoundary replacing everything.
// Same look as GlobalErrorBoundary; TRY AGAIN re-renders only this screen.
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'route' } });
  }, [error]);

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#EF4444" />
      <Text style={styles.title}>{t('system.routeErrorTitle')}</Text>
      <Text style={styles.subtitle}>{t('system.routeErrorBody')}</Text>
      <Text style={styles.errorText} numberOfLines={3}>
        {error?.message || t('system.unknownError')}
      </Text>
      <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('system.tryAgain')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/')} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>{t('system.goHome')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { color: '#EF4444', fontSize: 20, fontWeight: '900', marginTop: 20, letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 12, marginBottom: 20 },
  errorText: { color: '#4B5563', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: '#C8A040', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, minWidth: 200, alignItems: 'center' },
  buttonText: { color: '#000000', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  secondaryButton: { marginTop: 12, paddingHorizontal: 32, paddingVertical: 14, minWidth: 200, alignItems: 'center' },
  secondaryButtonText: { color: '#9CA3AF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
});

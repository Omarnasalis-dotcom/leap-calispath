import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LeapLogo } from './LeapLogo';
import { Button } from './Button';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { localDay, softPromptDue } from '../lib/appVersion';
import { track } from '../lib/analytics';
import { t } from '../i18n';

const LAST_SHOWN_KEY = 'soft_update_prompt_day_v1';
// Let the first screen settle before the card fades in over it.
const SHOW_DELAY_MS = 1200;

// "Update available" pop-up for installs below app_config.soft_minimum_version
// (but not below minimum_version, which is ForceUpdateScreen's full block).
// "Later" closes it; it asks again on the first open of the next day.
export function SoftUpdatePrompt({ storeUrl }: { storeUrl: string }) {
  const { theme } = useTheme();
  const { loading, profileLoading, profile, profileLoadFailed, user } = useAuth();
  const [visible, setVisible] = useState(false);
  // Refs, not state: the check runs once per app start, and only unmounting
  // may cancel it. (A state flag, or cancelling when `settled` changes,
  // dropped the card before it ever showed.)
  const checkedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same point at which AuthGuard releases the native splash.
  const settled = !loading && !profileLoading && !(user && !profile && !profileLoadFailed);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!settled || checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      const today = localDay();
      let lastShown: string | null = null;
      try {
        lastShown = await AsyncStorage.getItem(LAST_SHOWN_KEY);
      } catch {
        // Unreadable storage: still show it once this session.
      }
      if (!mountedRef.current || !softPromptDue(lastShown, today)) return;
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setVisible(true);
        track('soft_update_shown');
        AsyncStorage.setItem(LAST_SHOWN_KEY, today).catch(() => { });
      }, SHOW_DELAY_MS);
    })();
  }, [settled]);

  if (!storeUrl) return null;

  const later = () => {
    track('soft_update_later');
    setVisible(false);
  };
  const update = () => {
    track('soft_update_tapped');
    setVisible(false);
    Linking.openURL(storeUrl).catch(() => { });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <LeapLogo size={72} animated={false} />
          <Text style={[styles.title, { color: theme.text.primary }]}>{t('system.softUpdateTitle')}</Text>
          <Text style={[styles.message, { color: theme.text.secondary }]}>{t('system.softUpdateMessage')}</Text>
          <View style={styles.actions}>
            <Button title={t('system.updateNow')} onPress={update} />
            <TouchableOpacity accessibilityRole="button" onPress={later} style={styles.laterBtn} hitSlop={8}>
              <Text style={[styles.laterText, { color: theme.text.secondary }]}>{t('system.softUpdateLater')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: 4,
  },
  laterBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  laterText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

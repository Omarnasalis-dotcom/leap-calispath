import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { checkUpdateAvailable } from '../../lib/appVersion';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';

const BLUE = '#4A9EFF';

// Profile's "Update" pill, next to the plan badge: shows while the store has
// a newer version (app_config.latest_version) than this install, and opens
// the store page.
export function UpdateChip() {
  const [update, setUpdate] = useState<{ version: string; storeUrl: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      checkUpdateAvailable().then((available) => {
        if (!cancelled) setUpdate(available);
      });
      return () => { cancelled = true; };
    }, []),
  );

  if (!update) return null;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={t('system.updateAvailableTitle')}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={() => {
        track('update_chip_tapped', { version: update.version });
        Linking.openURL(update.storeUrl).catch(() => {});
      }}
      style={styles.pill}
    >
      <MaterialCommunityIcons name="arrow-down-circle-outline" size={10} color={BLUE} />
      <Text style={styles.text}>{t('system.updateChip')}</Text>
    </TouchableOpacity>
  );
}

// Same size as the Upgrade pill beside it, in blue.
const styles = StyleSheet.create({
  pill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.6)',
  },
  text: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9.5,
    letterSpacing: 0.3,
    color: BLUE,
  },
});

import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { checkUpdateAvailable } from '../../lib/appVersion';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';

const BLUE = '#4A9EFF';

// Profile's update button (a blue arrow), next to the plan badge: shows while the store has
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
      <MaterialCommunityIcons name="arrow-down" size={11} color={BLUE} />
    </TouchableOpacity>
  );
}

// An icon-only circle, the same size as the gift beside it, in blue.
const styles = StyleSheet.create({
  pill: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.6)',
  },
});

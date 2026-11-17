import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { isGroupOn, withGroup, type PrefGroup } from '../lib/inbox';
import { track } from '../lib/analytics';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

const GROUPS: Array<{ group: PrefGroup; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { group: 'training', icon: 'dumbbell' },
  { group: 'challenges', icon: 'trophy-outline' },
  { group: 'news', icon: 'bullhorn-outline' },
];

// Settings > Notifications: three switches. Each one turns a group of
// notification types on or off on the server (notification_preferences).
export function NotificationSettingsScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const { user } = useAuth();
  const isMounted = useMountedRef();
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [permissionOff, setPermissionOff] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const loaded = await InboxService.fetchPrefs(user.id);
      if (!isMounted.current) return;
      setPrefs(loaded);
      setFailed(false);
    } catch {
      if (isMounted.current) setFailed(true);
    }
  }, [user, isMounted]);

  useEffect(() => {
    void load();
    // The phone's own switch decides whether any push arrives at all.
    Notifications.getPermissionsAsync()
      .then(({ status }) => {
        if (isMounted.current) setPermissionOff(status !== 'granted');
      })
      .catch(() => { });
  }, [load, isMounted]);

  const toggle = async (group: PrefGroup, on: boolean) => {
    if (!user || !prefs) return;
    const before = prefs;
    const next = withGroup(prefs, group, on);
    setPrefs(next);
    setSaveFailed(false);
    try {
      await InboxService.savePrefs(user.id, next);
      track('notification_setting_changed', { group, on });
    } catch {
      if (!isMounted.current) return;
      setPrefs(before);
      setSaveFailed(true);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('inbox.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('notifSettings.title')}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {permissionOff && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t('notifSettings.permissionOff')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.noticeBtn} onPress={() => Linking.openSettings().catch(() => { })}>
              <Text style={styles.noticeBtnText}>{t('notifSettings.openPhoneSettings')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {prefs === null && !failed && <ActivityIndicator color={c.coral} style={{ marginTop: 32 }} />}

        {failed && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t('notifSettings.loadFailed')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.noticeBtn} onPress={load}>
              <Text style={styles.noticeBtnText}>{t('inbox.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {prefs !== null && !failed && (
          <View style={styles.card}>
            {GROUPS.map(({ group, icon }, index) => (
              <View key={group} style={[styles.row, index > 0 && styles.rowDivider]}>
                <MaterialCommunityIcons name={icon} size={20} color={c.textSecondary} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{t(`notifSettings.${group}Title`)}</Text>
                  <Text style={styles.rowBody}>{t(`notifSettings.${group}Body`)}</Text>
                </View>
                <Switch
                  accessibilityLabel={t(`notifSettings.${group}Title`)}
                  value={isGroupOn(prefs, group)}
                  onValueChange={(on) => toggle(group, on)}
                  trackColor={{ false: c.borderStrong, true: c.coral }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))}
          </View>
        )}

        {saveFailed && <Text style={styles.error}>{t('settings.couldNotSave')}</Text>}
        <Text style={styles.note}>{t('notifSettings.note')}</Text>
      </ScrollView>
    </View>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.screenBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: TC_LAYOUT.screenPadding,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
    content: { padding: TC_LAYOUT.screenPadding, paddingBottom: 48, gap: 14 },
    card: { backgroundColor: c.cardRaised, borderColor: c.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    rowText: { flex: 1, gap: 3 },
    rowTitle: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15 },
    rowBody: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12, lineHeight: 18 },
    notice: { backgroundColor: c.cardRaised, borderColor: c.borderStrong, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
    noticeText: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 21 },
    noticeBtn: { alignSelf: 'flex-start', borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
    noticeBtnText: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.4 },
    note: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12, lineHeight: 18 },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13 },
  });
}

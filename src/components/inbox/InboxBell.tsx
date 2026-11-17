import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { InboxService, onInboxChanged } from '../../services/InboxService';
import { useMountedRef } from '../../hooks/useMountedRef';
import { t } from '../../i18n';

// Bell on Profile that opens the inbox; a dot shows while a message from
// the Leap team is unread.
export function InboxBell({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  const [unread, setUnread] = useState(0);
  const isMounted = useMountedRef();

  const refresh = useCallback(() => {
    InboxService.fetchUnreadCount()
      .then((n) => {
        if (isMounted.current) setUnread(n);
      })
      .catch(() => { });
  }, [isMounted]);

  useFocusEffect(refresh);
  useEffect(() => onInboxChanged(refresh), [refresh]);
  // A message that arrived while the app was in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    // A push that lands while the app is open.
    const received = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(() => refresh());
    return () => {
      sub.remove();
      received?.remove();
    };
  }, [refresh]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? t('inbox.bellUnread', { count: unread }) : t('inbox.bell')}
      style={style}
      onPress={() => router.push('/notifications')}
    >
      <MaterialCommunityIcons name="bell-outline" size={18} color={color} />
      {unread > 0 && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FC5454',
  },
});

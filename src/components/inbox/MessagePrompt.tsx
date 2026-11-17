import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { InboxService } from '../../services/InboxService';
import { pickPromptItem, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';
import { MessageCard } from './MessageCard';

// Let the first screen settle before the card fades in over it.
const SHOW_DELAY_MS = 1500;

// On app open, shows the newest unread message from the Leap team (news, a
// discount code, or a gift to claim) as a pop-up card. Each message pops up
// once: showing it marks it read; it stays in the inbox after that.
export function MessagePrompt() {
  const { theme } = useTheme();
  const { loading, profileLoading, profile, user } = useAuth();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [claim, setClaim] = useState<GiftClaim | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  // Once per signed-in user per app start; only unmounting cancels it.
  const checkedFor = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Not during sign-up or onboarding: the Journey lane owns those screens.
  const userId = user?.id ?? null;
  const ready = !loading && !profileLoading && !!userId && !!profile?.onboarding_completed_at;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready || !userId || checkedFor.current === userId) return;
    checkedFor.current = userId;
    (async () => {
      try {
        const items = await InboxService.fetchInbox();
        const next = pickPromptItem(items, Date.now());
        if (!next || !mountedRef.current) return;
        const claims = next.claimId ? await InboxService.fetchGiftClaims([next.claimId]).catch(() => ({} as Record<string, GiftClaim>)) : {};
        if (!mountedRef.current) return;
        setItem(next);
        setClaim(next.claimId ? claims[next.claimId] : undefined);
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) setVisible(true);
        }, SHOW_DELAY_MS);
      } catch {
        // No pop-up this time; the message is still in the inbox.
      }
    })();
  }, [ready, userId]);

  if (!item) return null;

  // Counted as seen only once it is really on screen: iOS presents one modal
  // at a time, so if another one is up this never appears and must stay unread.
  const onShow = () => {
    track('admin_message_shown', { kind: item.kind });
    void InboxService.markSeen([item.id]);
  };

  const close = () => setVisible(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} onShow={onShow}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <MessageCard item={item} claim={claim} source="prompt" onNavigate={close} bare />
          <TouchableOpacity accessibilityRole="button" onPress={close} style={styles.closeBtn} hitSlop={8}>
            <Text style={[styles.closeText, { color: theme.text.secondary }]}>{t('inbox.close')}</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
    gap: 8,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

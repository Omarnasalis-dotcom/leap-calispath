import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSegments } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { InboxService } from '../../services/InboxService';
import { pickPromptItem, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';
import { MessageCard } from './MessageCard';

// Let the first screen settle before the card fades in over it.
const SHOW_DELAY_MS = 1500;
// Coming back to the app looks for a new message again, but not more often
// than this (phones flip between apps constantly).
const RECHECK_GAP_MS = 10 * 60 * 1000;
// Never over a workout, a trial or a live room: those screens own the moment.
const BUSY_ROUTES = new Set(['trial', 'warrior-program', 'live-room', 'team-lobby', 'arena-workout', 'tournament-trial', 'quick-workout', 'assessment']);

// Shows the newest unread message from the Leap team (news, a discount code,
// or a gift to claim) as a pop-up card: on app open, and again when the app
// comes back to the front. Each message pops up once: showing it marks it
// read; it stays in the inbox after that.
export function MessagePrompt() {
  const { theme } = useTheme();
  const currentRoute = useSegments()[0] as string | undefined;
  const { loading, profileLoading, profile, user } = useAuth();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [claim, setClaim] = useState<GiftClaim | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);
  const lastCheckAt = useRef(0);
  // Messages already put on screen in this app session.
  const shownIds = useRef(new Set<string>());
  const visibleRef = useRef(false);
  const routeRef = useRef(currentRoute);
  routeRef.current = currentRoute;

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

  const check = useCallback(async () => {
    if (checkingRef.current || visibleRef.current) return;
    if (routeRef.current && BUSY_ROUTES.has(routeRef.current)) return;
    checkingRef.current = true;
    lastCheckAt.current = Date.now();
    try {
      const items = await InboxService.fetchInbox();
      const next = pickPromptItem(items, Date.now(), shownIds.current);
      if (!next || !mountedRef.current) return;
      const claims = next.claimId ? await InboxService.fetchGiftClaims([next.claimId]).catch(() => ({} as Record<string, GiftClaim>)) : {};
      if (!mountedRef.current) return;
      setItem(next);
      setClaim(next.claimId ? claims[next.claimId] : undefined);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // The screen may have changed while the card was waiting.
        if (!mountedRef.current || (routeRef.current && BUSY_ROUTES.has(routeRef.current))) return;
        visibleRef.current = true;
        setVisible(true);
      }, SHOW_DELAY_MS);
    } catch {
      // No pop-up this time; the message is still in the inbox.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // On app open (and when another account signs in).
  useEffect(() => {
    if (!ready || !userId) return;
    void check();
  }, [ready, userId, check]);

  // Back from the background: a message sent meanwhile shows without a restart.
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckAt.current >= RECHECK_GAP_MS) void check();
    });
    return () => sub.remove();
  }, [ready, check]);

  if (!item) return null;

  // Counted as seen only once it is really on screen: iOS presents one modal
  // at a time, so if another one is up this never appears and must stay unread.
  const onShow = () => {
    shownIds.current.add(item.id);
    track('admin_message_shown', { kind: item.kind });
    void InboxService.markSeen([item.id]);
  };

  const close = () => {
    visibleRef.current = false;
    setVisible(false);
  };

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

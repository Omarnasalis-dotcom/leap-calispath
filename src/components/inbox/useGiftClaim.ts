import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAsync } from '../../hooks/useSafeAsync';
import { InboxService } from '../../services/InboxService';
import { giftState, type GiftClaim, type InboxItem } from '../../lib/inbox';
import { notePlanBeforeChange } from '../../lib/planWelcome';
import { track } from '../../lib/analytics';
import { t } from '../../i18n';

// The clipboard module is native. A build made before it was added (an old
// development client) doesn't have it, and importing it there throws: load it
// softly, and fall back to press-and-hold on the code.
let Clipboard: { setStringAsync: (text: string) => Promise<boolean> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Clipboard = require('expo-clipboard');
} catch {
  Clipboard = null;
}
export const canCopy = () => !!Clipboard;

/** Copies a discount code; resolves true once it's on the clipboard. */
export async function copyCode(code: string, source: 'inbox' | 'prompt'): Promise<boolean> {
  if (!Clipboard) return false;
  try {
    await Clipboard.setStringAsync(code);
    track('admin_message_action', { kind: 'copy_code', source });
    return true;
  } catch {
    return false;
  }
}

/**
 * Claiming a gift from a message, shared by the Notifications list and the
 * pop-up card. The server's answer wins over what the list loaded (e.g.
 * claimed on another phone).
 */
export function useGiftClaim(item: InboxItem, claim: GiftClaim | undefined, source: 'inbox' | 'prompt', onClaimed?: (claimId: string) => void) {
  const { profile, refreshProfile } = useAuth();
  const { runAsync, isExecuting } = useSafeAsync();
  const [justClaimed, setJustClaimed] = useState(false);
  const [serverState, setServerState] = useState<'claimed' | 'expired' | null>(null);
  const [claimedUntil, setClaimedUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 'unknown' = the gift's details didn't load: still offer the button, the
  // server checks the claim either way.
  const loaded = justClaimed ? 'claimed' : serverState ?? giftState(claim, Date.now());
  const state = loaded === 'unknown' ? 'claimable' : loaded;

  const claimGift = () => {
    if (!item.claimId) return;
    const claimId = item.claimId;
    setError(null);
    void notePlanBeforeChange(profile);
    runAsync(() => InboxService.claimGift(claimId), {
      onSuccess: (result) => {
        if (!result.ok) {
          if (result.error === 'ALREADY_CLAIMED') {
            setServerState('claimed');
            return;
          }
          if (result.error === 'EXPIRED') {
            setServerState('expired');
            return;
          }
          setError(t(`inbox.errors.${result.error}`, { defaultValue: t('inbox.errors.UNKNOWN') }));
          return;
        }
        track('gift_claimed', { tier: result.tier, days: result.days, source });
        setJustClaimed(true);
        setClaimedUntil(result.accessExpiresAt);
        onClaimed?.(claimId);
        void refreshProfile();
      },
      onError: () => setError(t('inbox.errors.UNKNOWN')),
    });
  };

  return { state, claimGift, claiming: isExecuting, claimedUntil, error };
}

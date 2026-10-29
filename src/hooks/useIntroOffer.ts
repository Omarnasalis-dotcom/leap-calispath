import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { checkFirstTimeOfferEnabled } from '../lib/appVersion';
import { isOfferAudience, type OfferPrice } from '../lib/offerPrompt';
import { loadOffer, PREVIEW_PRICE } from '../lib/offerStore';

/**
 * The intro offer to show in an upgrade prompt, or null: same audience as the
 * welcome offer (never subscribed, paywall + offer switch on) and the store
 * really has the intro for this account. Not limited to once, like Profile's
 * gift. Dev builds fall back to sample prices while the store has none.
 */
export function useIntroOffer(active: boolean): OfferPrice | null {
  const { profile, paywallEnabled } = useAuth();
  const [price, setPrice] = useState<OfferPrice | null>(null);

  useEffect(() => {
    if (!active) return;
    const base = { platform: Platform.OS, paywallEnabled, profile };
    // Cheap check first, so most users never hit the network for this.
    if (!isOfferAudience({ ...base, offerEnabled: true })) {
      setPrice(null);
      return;
    }
    let cancelled = false;
    Promise.all([checkFirstTimeOfferEnabled(), loadOffer()])
      .then(([offerEnabled, offer]) => {
        if (cancelled) return;
        if (!isOfferAudience({ ...base, offerEnabled })) setPrice(null);
        else setPrice(offer ?? (__DEV__ ? PREVIEW_PRICE : null));
      })
      .catch(() => {
        if (!cancelled) setPrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, profile, paywallEnabled]);

  return price;
}

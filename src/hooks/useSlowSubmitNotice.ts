import { useEffect, useState } from 'react';

/**
 * Flips to true once a submission has been in flight longer than
 * `thresholdMs`, so the UI can swap "loading" for an explicit "still
 * working" message before a legitimately slow-but-succeeding request
 * (e.g. a retry after a network blip) starts reading as hung.
 */
export function useSlowSubmitNotice(active: boolean, thresholdMs = 2500): boolean {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setIsSlow(false);
      return;
    }
    const timeoutId = setTimeout(() => setIsSlow(true), thresholdMs);
    return () => clearTimeout(timeoutId);
  }, [active, thresholdMs]);

  return isSlow;
}

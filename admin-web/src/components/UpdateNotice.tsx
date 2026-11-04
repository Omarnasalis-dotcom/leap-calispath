import { useEffect, useState } from 'react';

declare const __APP_BUILD_ID__: string;

const CHECK_EVERY_MS = 5 * 60_000;

/** A tab keeps running the build it loaded until a full reload, so after a
 * deploy it silently misses new features. Compares this bundle's build id
 * with the live /version.json (every 5 min and whenever the tab comes back)
 * and offers a reload. Never reloads on its own: unsaved builder edits
 * would be lost. */
export function UpdateNotice() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;

    async function check() {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== __APP_BUILD_ID__) setOutdated(true);
      } catch {
        // Offline or mid-deploy: try again next time.
      }
    }

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="notice" role="status" style={{ marginBottom: 16 }}>
      <span className="label">New version</span>
      <span style={{ flex: 1 }}>
        The admin panel was updated. Save any changes you're working on, then reload to get the latest version.
      </span>
      <button className="btn small primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

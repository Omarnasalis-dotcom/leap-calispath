import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

// Rendered when a signed-in, non-admin account lands here. The screen is
// cosmetic — every RPC/table already rejects them server-side — but we
// sign them out immediately so the session doesn't linger.
export function AccessDenied() {
  const { signOut } = useAuth();

  useEffect(() => {
    const t = window.setTimeout(() => void signOut(), 2500);
    return () => window.clearTimeout(t);
  }, [signOut]);

  return (
    <div className="auth-wrap">
      <div className="auth-card" role="alert">
        <span className="label" style={{ color: 'var(--danger)' }}>
          Access denied
        </span>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
          This account is not an admin. Signing you out.
        </p>
      </div>
    </div>
  );
}

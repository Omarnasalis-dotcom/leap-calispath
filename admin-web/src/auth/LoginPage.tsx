import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontWeight: 900, fontSize: 18 }}>LEAP ARENA</span>
            <span className="label" style={{ color: 'var(--accent)' }}>
              Admin
            </span>
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '8px 0 0' }}>
            Sign in with your admin account.
          </p>
        </div>
        <form onSubmit={onSubmit}>
          <input
            className="field"
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="error-note">{error}</div>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';
const THEME_STORAGE_KEY = 'admin-theme';

/** Reads the theme public/theme-init.js already applied pre-paint, and keeps
 * it in sync with an explicit user choice (persisted) or, absent one, the
 * OS preference (live — flips if the user changes it system-wide mid-session). */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme | undefined) ?? 'dark',
  );

  useEffect(() => {
    if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      setThemeState(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function setTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }

  return { theme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="btn icon ghost" title={label} aria-label={label} onClick={toggleTheme}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg =
    error instanceof Error ? error.message : 'Something went wrong loading this view.';
  return <div className="error-note">{msg}</div>;
}

export function Badge({
  tone,
  children,
}: {
  tone?: 'accent' | 'ok' | 'warn';
  children: ReactNode;
}) {
  return <span className={`badge${tone ? ` ${tone}` : ''}`}>{children}</span>;
}

/** Inline code with click-to-copy (join codes, invite codes). */
export function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-code"
      style={{ cursor: 'pointer', color: copied ? 'var(--ok)' : 'var(--ink)' }}
      title="Copy"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'copied' : value}
    </button>
  );
}

/** Native <dialog>-based confirm. Returns a trigger renderer to keep usage terse.
 * Pass `icon` instead of `label` for a compact icon-only trigger (row actions
 * like block/day delete) — `label` (or `ariaLabel`) is still required for the
 * accessible name and the tooltip either way. */
export function ConfirmButton({
  label,
  icon,
  ariaLabel,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  disabled,
  onConfirm,
}: {
  label?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const name = ariaLabel ?? label;

  return (
    <>
      <button
        type="button"
        className={`btn ${icon ? 'icon' : 'small'}${danger ? ' danger' : ''}`}
        disabled={disabled}
        title={name}
        aria-label={name}
        onClick={() => ref.current?.showModal()}
      >
        {icon ?? label}
      </button>
      <dialog className="confirm" ref={ref}>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        {body && (
          <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 16px' }}>{body}</p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn small" onClick={() => ref.current?.close()} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn small ${danger ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                ref.current?.close();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

import { useRef, useState, type ReactNode } from 'react';

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

/** Native <dialog>-based confirm. Returns a trigger renderer to keep usage terse. */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        className={`btn small${danger ? ' danger' : ''}`}
        disabled={disabled}
        onClick={() => ref.current?.showModal()}
      >
        {label}
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

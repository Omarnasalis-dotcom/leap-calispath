import { ConfirmButton } from '@/components/bits';

/** Shown when a save found the program changed since it was loaded
 * (StaleProgramError). Reload drops this editor's changes; Save anyway
 * replaces the newer version with this one. */
export function StaleNotice({
  message,
  reloading,
  saving,
  onReload,
  onSaveAnyway,
}: {
  message: string;
  reloading: boolean;
  saving: boolean;
  onReload: () => void;
  onSaveAnyway: () => void | Promise<void>;
}) {
  return (
    <div className="notice" role="alert" style={{ flexWrap: 'wrap' }}>
      <span className="label" style={{ color: 'var(--warn)' }}>
        Changed elsewhere
      </span>
      <span style={{ flex: 1, minWidth: 240 }}>{message}</span>
      <button className="btn small" disabled={reloading || saving} onClick={onReload}>
        {reloading ? 'Reloading…' : 'Reload (lose my changes)'}
      </button>
      <ConfirmButton
        label="Save anyway"
        danger
        disabled={reloading || saving}
        title="Replace the newer version with yours?"
        body="Blocks and exercises added since you opened this program are deleted, and edits made since then are undone. Logged blocks are always kept."
        confirmLabel="Save anyway"
        onConfirm={onSaveAnyway}
      />
    </div>
  );
}

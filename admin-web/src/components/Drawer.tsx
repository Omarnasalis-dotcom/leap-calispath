import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * An edit form beside the list it belongs to (slides in from the right).
 * Not modal: the list stays visible and clickable, so picking another row
 * swaps the form. Esc or ✕ closes it.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Room for a whole view (e.g. week logs), not just a form. */
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the first field so typing starts in the form.
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.drawer-close)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside ref={ref} className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="drawer-head">
        <h2 id="drawer-title">{title}</h2>
        <button type="button" className="btn icon ghost drawer-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </aside>
  );
}

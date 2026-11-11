import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** Where "← Back" goes: a route, or an in-page action (e.g. closing an
 * editor through the unsaved-changes guard). */
export type BackTarget = { label: string; to: string } | { label: string; onClick: () => void };

/** The one page header: optional back link, title, subtitle, actions on
 * the right (they wrap under the title on narrow screens). */
export function PageHeader({
  title,
  sub,
  actions,
  back,
  grow,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: BackTarget;
  /** The title side takes the free width (an editor's name field). */
  grow?: boolean;
}) {
  return (
    <div className="page-head">
      <div className={`page-head-main${grow ? ' grow' : ''}`}>
        {back &&
          ('to' in back ? (
            <Link className="page-back" to={back.to}>
              <ChevronLeft aria-hidden="true" />
              {back.label}
            </Link>
          ) : (
            <button type="button" className="page-back" onClick={back.onClick}>
              <ChevronLeft aria-hidden="true" />
              {back.label}
            </button>
          ))}
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** A row of filters/controls above a table or list. */
export function Toolbar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="toolbar" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Label + control + optional hint or error, stacked. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="form-field-label">{label}</span>
      {children}
      {error ? (
        <span className="form-field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="form-field-hint">{hint}</span>
      )}
    </label>
  );
}

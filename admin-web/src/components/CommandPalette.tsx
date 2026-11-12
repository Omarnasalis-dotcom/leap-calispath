import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, FileText, Search, User } from 'lucide-react';
import { searchUsers } from '@/api/users';
import { tierName } from '@/shared/constants';

export interface PalettePage {
  to: string;
  label: string;
  group?: string;
}

type Target =
  | { kind: 'user'; id: string; name: string; email: string | null; tier: number | null }
  | { kind: 'page'; to: string; label: string; group?: string };

// Quick actions on a user result: each opens a tab of their profile.
const USER_ACTIONS = [
  { label: 'Profile', path: '' },
  { label: 'AI chat', path: '/ai-coach' },
  { label: 'Fair Play', path: '/fair-play' },
  { label: 'Program', path: '/program' },
] as const;

/**
 * ⌘K: jump to a person (admins only: user search is admin-only server-side)
 * or a page. ↑↓ move, Enter opens, Esc closes.
 */
export function CommandPalette({
  open,
  onClose,
  pages,
  canSearchUsers,
}: {
  open: boolean;
  onClose: () => void;
  pages: PalettePage[];
  canSearchUsers: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery('');
      setDebounced('');
      setActive(0);
      el.showModal();
      inputRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const usersQ = useQuery({
    queryKey: ['palette-users', debounced],
    queryFn: () => searchUsers({ query: debounced, sort: 'display_name', desc: false, page: 0, pageSize: 6 }),
    enabled: open && canSearchUsers && debounced.length >= 2,
  });

  const targets: Target[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const users: Target[] =
      canSearchUsers && debounced.length >= 2
        ? (usersQ.data ?? []).map((u) => ({
            kind: 'user' as const,
            id: u.id,
            name: u.display_name || u.email || 'Unnamed warrior',
            email: u.email,
            tier: u.strength_tier,
          }))
        : [];
    const matchedPages: Target[] = pages
      .filter((p) => !q || `${p.label} ${p.group ?? ''}`.toLowerCase().includes(q))
      .slice(0, q ? 8 : 6)
      .map((p) => ({ kind: 'page' as const, ...p }));
    return [...users, ...matchedPages];
  }, [query, debounced, usersQ.data, pages, canSearchUsers]);

  useEffect(() => setActive(0), [targets.length, debounced]);

  function go(path: string) {
    onClose();
    navigate(path);
  }

  function openTarget(t: Target | undefined) {
    if (!t) return;
    go(t.kind === 'user' ? `/users/${t.id}` : t.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, targets.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openTarget(targets[active]);
    }
  }

  const searching = canSearchUsers && query.trim().length >= 2 && (usersQ.isFetching || query.trim() !== debounced);
  const firstPage = targets.findIndex((t) => t.kind === 'page');

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Search"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="palette-box" onKeyDown={onKeyDown}>
        <div className="palette-input-row">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={canSearchUsers ? 'Search people or pages…' : 'Search pages…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={targets[active] ? `palette-item-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="palette-kbd">esc</kbd>
        </div>

        <ul className="palette-results" id="palette-results" role="listbox" aria-label="Results">
          {canSearchUsers && query.trim().length > 0 && query.trim().length < 2 && (
            <li className="palette-hint">Type at least 2 letters to search people.</li>
          )}
          {searching && targets.every((t) => t.kind !== 'user') && <li className="palette-hint">Searching people…</li>}
          {usersQ.error && <li className="palette-hint">Couldn't search people right now.</li>}
          {!searching && canSearchUsers && debounced.length >= 2 && usersQ.data?.length === 0 && (
            <li className="palette-hint">No one matches “{debounced}”.</li>
          )}
          {targets.map((t, i) => (
            <li key={t.kind === 'user' ? `u-${t.id}` : `p-${t.to}`}>
              {i === 0 && t.kind === 'user' && <div className="palette-section">People</div>}
              {i === firstPage && <div className="palette-section">Pages</div>}
              <div
                id={`palette-item-${i}`}
                role="option"
                aria-selected={i === active}
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => openTarget(t)}
              >
                {t.kind === 'user' ? (
                  <>
                    <User className="palette-icon" aria-hidden="true" />
                    <span className="palette-main">
                      <span className="palette-name">{t.name}</span>
                      <span className="palette-meta">
                        {t.email ?? ''}
                        {t.tier != null ? ` · Tier ${t.tier} ${tierName(t.tier)}` : ''}
                      </span>
                    </span>
                    <span className="palette-actions">
                      {USER_ACTIONS.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className="btn small ghost"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            go(`/users/${t.id}${a.path}`);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="palette-icon" aria-hidden="true" />
                    <span className="palette-main">
                      <span className="palette-name">{t.label}</span>
                      {t.group && <span className="palette-meta">{t.group}</span>}
                    </span>
                  </>
                )}
                {i === active && <CornerDownLeft className="palette-enter" aria-hidden="true" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface InboxItem {
  key: string;
  to: string;
  text: string;
  /** Short context on the right: "oldest 30h left", "ends Nov 14". */
  meta?: string;
  /** warn = overdue or about to break; otherwise it's just waiting. */
  urgent?: boolean;
}

/** "Needs you": everything waiting on an admin, most urgent first, each row
 * opening the place to act. Rows with nothing waiting aren't shown. */
export function NeedsYouPanel({ items, loading }: { items: InboxItem[]; loading: boolean }) {
  const sorted = [...items].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  return (
    <section className="panel inbox" aria-labelledby="inbox-title">
      <div className="panel-head">
        <h2 id="inbox-title">Needs you</h2>
        {!loading && <span className="label num">{items.length === 0 ? 'all clear' : `${items.length} to do`}</span>}
      </div>
      {loading && items.length === 0 ? (
        <div className="panel-body">
          <div className="skeleton" style={{ height: 44 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="panel-body inbox-clear">Nothing needs you right now. Reviews, flags, appeals and reports show up here.</div>
      ) : (
        <ul className="inbox-list">
          {sorted.map((item) => (
            <li key={item.key}>
              <Link to={item.to} className={`inbox-row${item.urgent ? ' urgent' : ''}`}>
                <span className="inbox-dot" aria-hidden="true" />
                <span className="inbox-text">{item.text}</span>
                {item.meta && <span className="inbox-meta">{item.meta}</span>}
                <ChevronRight className="inbox-chevron" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


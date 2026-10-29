import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchCoachFlags } from '@/api/aiCoachChats';
import type { CoachChatFlagStatus } from '@/shared/types';
import { formatDateTime } from '@/shared/constants';
import { ErrorNote } from '@/components/bits';
import { FLAG_STATUS_LABEL, FlagRow } from './AiCoachChatsPage';
import './AiCoachChatsPage.css';

const FILTERS: Array<CoachChatFlagStatus | 'all'> = ['open', 'fixing', 'fixed', 'wont_fix', 'all'];

export function CoachFlagsPage() {
  const [status, setStatus] = useState<CoachChatFlagStatus | 'all'>('open');
  const flags = useQuery({
    queryKey: ['coach-flags', status],
    queryFn: () => fetchCoachFlags(status === 'all' ? null : status),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Coach flags</h1>
          <div className="sub">Every reply you flagged, across all users. Open one to read it in its chat.</div>
        </div>
        <Link to="/ai-coach-chats" className="btn small ghost">
          Back to chats
        </Link>
      </div>

      <div className="seg" role="group" aria-label="Status" style={{ marginBottom: 16 }}>
        {FILTERS.map((s) => (
          <button key={s} type="button" className="seg-item" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? 'All' : FLAG_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {flags.error && <ErrorNote error={flags.error} />}
      {flags.isLoading && <div className="skeleton" style={{ height: 200 }} />}
      {flags.data && flags.data.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="label">No flags</span>
            Nothing {status === 'all' ? 'flagged yet' : `marked ${FLAG_STATUS_LABEL[status].toLowerCase()}`}.
          </div>
        </div>
      )}

      {flags.data?.map((f) => (
        <section key={f.id} className="panel">
          <div className="panel-head">
            <div className="row">
              <strong>{f.username ?? f.user_id.slice(0, 8)}</strong>
              <Link to={`/ai-coach-chats/${f.user_id}#turn-${f.turn_id}`} style={{ fontSize: 13 }}>
                Open in chat
              </Link>
            </div>
            <span className="label">{formatDateTime(f.turn_created_at)}</span>
          </div>
          <div className="panel-body chats-turns">
            <div className="chat-bubble athlete" dir="auto">
              {f.user_message ?? <span className="dim">(no text)</span>}
            </div>
            <div className="chat-bubble coach" dir="auto">
              {f.reply ?? <span className="dim">(no reply)</span>}
            </div>
            <FlagRow flag={f} userId={f.user_id} />
          </div>
        </section>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { AiCoachEngagement } from '@/api/dashboard';
import { formatDate } from '@/shared/constants';

// Why a turn was flagged automatically (ai_coach_turns.outcome). 'ok' among
// the issues means the reply finished but a tool failed or a claim was
// corrected before sending.
const OUTCOME_LABEL: Record<string, string> = {
  ok: 'Tool error or corrected claim',
  error: 'Error',
  deadline: 'Took too long',
  max_tokens: 'Cut off',
  empty: 'Empty reply',
  unacted_blocked: 'Claimed an action it didn’t do',
  max_turns: 'Ran out of steps',
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const usd = (n: number) => `$${n.toFixed(2)}`;

/** AI Coach engagement: programs, chat, reply health and spend over the
 * same window. Four readouts side by side, not stat cards: each pairs its
 * number with the context that makes it mean something. */
export function AiCoachPanel({ data }: { data: AiCoachEngagement }) {
  const { programs, chat, health, cost } = data;
  const trainedPct = pct(programs.trained_athletes, programs.active_athletes);
  const issuePct = pct(health.issues, health.turns);
  const maxDaily = Math.max(1, ...chat.daily.map((d) => d.messages));
  const perMessage = chat.messages > 0 ? cost.usd / chat.messages : null;

  return (
    <div className="ai-panel">
      <div className="ai-readout">
        <span className="label">On an AI program</span>
        <span className="ai-value num">{programs.active_athletes}</span>
        <span className="ai-sub">
          {programs.trained_athletes} trained in {data.days} days · {trainedPct}%
        </span>
        <div className="dv-progress-track" aria-hidden="true">
          <div className="dv-progress-fill" style={{ width: `${trainedPct}%` }} />
        </div>
      </div>

      <div className="ai-readout">
        <span className="label">Chatted with the coach</span>
        <span className="ai-value num">{chat.people}</span>
        <span className="ai-sub">
          {chat.messages} message{chat.messages === 1 ? '' : 's'}
        </span>
        <div className="ai-spark" role="img" aria-label={`Messages per day, last ${data.days} days`}>
          {chat.daily.map((d) => (
            <span
              key={d.day}
              className="ai-spark-bar"
              style={{ height: `${Math.max(4, (d.messages / maxDaily) * 100)}%` }}
              title={`${formatDate(d.day)}: ${d.messages} message${d.messages === 1 ? '' : 's'}, ${d.people} ${d.people === 1 ? 'person' : 'people'}`}
            />
          ))}
        </div>
      </div>

      <div className="ai-readout">
        <span className="label">Replies that went wrong</span>
        <span className={`ai-value num${issuePct >= 20 ? ' warn' : ''}`}>{health.turns ? `${issuePct}%` : '—'}</span>
        <span className="ai-sub">
          {health.issues} of {health.turns} replies
        </span>
        {health.by_outcome.length > 0 && (
          <ul className="ai-outcomes">
            {health.by_outcome.slice(0, 3).map((o) => (
              <li key={o.outcome}>
                <span>{OUTCOME_LABEL[o.outcome] ?? o.outcome}</span>
                <span className="num">{o.turns}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/ai-coach-chats" className="ai-link">
          Review in AI Coach chats →
        </Link>
      </div>

      <div className="ai-readout">
        <span className="label">AI Coach spend</span>
        <span className="ai-value num">{usd(cost.usd)}</span>
        <span className="ai-sub">
          {perMessage != null ? `${usd(perMessage)} per message` : 'No messages yet'} · {cost.requests} model calls
        </span>
      </div>
    </div>
  );
}

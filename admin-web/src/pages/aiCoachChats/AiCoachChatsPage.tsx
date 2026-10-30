import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCoachFlag,
  fetchCoachChatThread,
  fetchCoachChatUsers,
  flagCoachTurn,
  updateCoachFlag,
} from '@/api/aiCoachChats';
import type {
  CoachChatFlag,
  CoachChatFlagKind,
  CoachChatFlagSeverity,
  CoachChatFlagStatus,
  CoachChatTurn,
  CoachTurnOutcome,
} from '@/shared/types';
import { formatDateTime } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';
import './AiCoachChatsPage.css';

export const FLAG_KIND_LABEL: Record<CoachChatFlagKind, string> = {
  mistake: 'Mistake',
  bad_choice: 'Bad choice',
  bad_behavior: 'Bad behavior',
};

export const FLAG_STATUS_LABEL: Record<CoachChatFlagStatus, string> = {
  open: 'Open',
  fixing: 'Fixing',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
};

const OUTCOME_LABEL: Record<CoachTurnOutcome, string> = {
  ok: 'OK',
  deadline: 'Stopped: took too long',
  max_tokens: 'Cut off: too long',
  empty: 'Empty reply',
  unacted_blocked: 'Claimed an action it did not do',
  max_turns: 'Ran out of steps',
  error: 'Error',
};

export function AiCoachChatsPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const users = useQuery({
    queryKey: ['coach-chat-users', search, issuesOnly],
    queryFn: () => fetchCoachChatUsers(search, issuesOnly),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Coach chats</h1>
          <div className="sub">
            Every AI Coach exchange, kept 90 days (longer while a flag on it is open). Flag a
            reply as a mistake, a bad choice or bad behavior, then fix it and mark the flag fixed.
          </div>
        </div>
        <Link to="/ai-coach-chats/flags" className="btn small ghost">
          All flags
        </Link>
      </div>

      {users.error && <ErrorNote error={users.error} />}

      <div className="chats-layout">
        <aside className="panel chats-list">
          <div className="panel-body chats-filters">
            <input
              className="field"
              placeholder="Search username or message text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <label className="row" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
              Only with issues or open flags
            </label>
          </div>
          {users.isLoading && <div className="skeleton" style={{ height: 200, margin: 12 }} />}
          {users.data && users.data.length === 0 && (
            <div className="empty">
              <span className="label">No chats</span>
              {search || issuesOnly ? 'Nothing matches these filters.' : 'No AI Coach chats stored yet.'}
            </div>
          )}
          <ul className="chats-users">
            {users.data?.map((u) => (
              <li key={u.user_id}>
                <button
                  type="button"
                  className="chats-user"
                  aria-current={u.user_id === userId ? 'true' : undefined}
                  onClick={() => navigate(`/ai-coach-chats/${u.user_id}`)}
                >
                  <span className="chats-user-name">{u.username ?? u.user_id.slice(0, 8)}</span>
                  <span className="dim chats-user-meta">
                    {formatDateTime(u.last_at)} · {u.turns} {u.turns === 1 ? 'message' : 'messages'}
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    {u.open_flags > 0 && <Badge tone="accent">{u.open_flags} open</Badge>}
                    {u.auto_issues > 0 && <Badge tone="warn">{u.auto_issues} auto</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="chats-thread">
          {userId ? (
            <Thread userId={userId} />
          ) : (
            <div className="panel">
              <div className="empty">
                <span className="label">Pick a chat</span>
                Choose a user on the left to read their conversation with the coach.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({ userId }: { userId: string }) {
  const [before, setBefore] = useState<string | null>(null);
  useEffect(() => setBefore(null), [userId]);

  const thread = useQuery({
    queryKey: ['coach-chat-thread', userId, before],
    queryFn: () => fetchCoachChatThread(userId, before),
  });

  // Jump to a turn linked from the flags page (#turn-<id>).
  useEffect(() => {
    if (!thread.data || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [thread.data]);

  if (thread.error) return <ErrorNote error={thread.error} />;
  if (thread.isLoading || !thread.data) return <div className="skeleton" style={{ height: 300 }} />;

  const turns = thread.data.turns;
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="row">
          <strong>{thread.data.username ?? userId.slice(0, 8)}</strong>
          <Link to={`/users/${userId}`} style={{ fontSize: 13 }}>
            View user
          </Link>
        </div>
        {turns.length === 100 && (
          <button type="button" className="btn small ghost" onClick={() => setBefore(turns[0].created_at)}>
            Older messages
          </button>
        )}
        {before && (
          <button type="button" className="btn small ghost" onClick={() => setBefore(null)}>
            Newest
          </button>
        )}
      </div>
      <div className="panel-body chats-turns">
        {turns.length === 0 && <div className="dim">No messages stored for this user.</div>}
        {turns.map((t) => (
          <Turn key={t.id} turn={t} userId={userId} />
        ))}
      </div>
    </div>
  );
}

function Turn({ turn, userId }: { turn: CoachChatTurn; userId: string }) {
  const [flagging, setFlagging] = useState(false);
  const problems: string[] = [];
  if (turn.outcome !== 'ok') problems.push(OUTCOME_LABEL[turn.outcome]);
  // Either claim check (ai-coach index.ts): a claim with no tool behind it,
  // or done-talk while a card was still waiting for the tap.
  if (turn.unacted_correction && turn.outcome !== 'unacted_blocked') problems.push('Corrected a claim before sending');
  if (turn.tool_errors > 0) problems.push(`${turn.tool_errors} tool ${turn.tool_errors === 1 ? 'error' : 'errors'}`);
  if (turn.safety_flags.length > 0) problems.push(`Safety: ${turn.safety_flags.join(', ')}`);

  return (
    <article id={`turn-${turn.id}`} className="chat-turn">
      <div className="chat-meta dim">
        {formatDateTime(turn.created_at)}
        {turn.latency_ms != null && ` · ${(turn.latency_ms / 1000).toFixed(1)}s`}
        {turn.cost_usd != null && ` · $${Number(turn.cost_usd).toFixed(4)}`}
        {turn.platform && ` · ${turn.platform}`}
        {turn.program_action && ` · card: ${turn.program_action}`}
      </div>

      <div className="chat-bubble athlete" dir="auto">
        {turn.user_message ?? <span className="dim">(no text)</span>}
      </div>
      <div className="chat-bubble coach" dir="auto">
        {turn.reply ?? <span className="dim">(no reply: {turn.error_message ?? 'failed'})</span>}
      </div>

      {problems.length > 0 && (
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {problems.map((p) => (
            <Badge key={p} tone="warn">
              {p}
            </Badge>
          ))}
        </div>
      )}

      {turn.tools.length > 0 && (
        <details className="chat-tools">
          <summary>
            What the coach did: {turn.tools.map((tool) => tool.name).join(', ')}
          </summary>
          {turn.tools.map((tool, i) => (
            <div key={i} className="chat-tool">
              <div className="row" style={{ gap: 6 }}>
                <code>{tool.name}</code>
                {tool.ok ? <Badge tone="ok">ok</Badge> : <Badge tone="warn">error</Badge>}
                <span className="dim">{tool.ms} ms</span>
              </div>
              <pre>{tool.input}</pre>
              {tool.error && <pre className="chat-tool-error">{tool.error}</pre>}
              {tool.result && (
                <details>
                  <summary className="dim">Result</summary>
                  <pre>{tool.result}</pre>
                </details>
              )}
            </div>
          ))}
        </details>
      )}

      {turn.flags.map((f) => (
        <FlagRow key={f.id} flag={f} userId={userId} />
      ))}

      {flagging ? (
        <FlagForm turnId={turn.id} userId={userId} onDone={() => setFlagging(false)} />
      ) : (
        <button type="button" className="btn small ghost chat-flag-btn" onClick={() => setFlagging(true)}>
          Flag this reply
        </button>
      )}
    </article>
  );
}

function useInvalidateChats(userId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['coach-chat-thread', userId] });
    void queryClient.invalidateQueries({ queryKey: ['coach-chat-users'] });
    void queryClient.invalidateQueries({ queryKey: ['coach-flags'] });
  };
}

function FlagForm({ turnId, userId, onDone }: { turnId: string; userId: string; onDone: () => void }) {
  const invalidate = useInvalidateChats(userId);
  const [kind, setKind] = useState<CoachChatFlagKind>('mistake');
  const [severity, setSeverity] = useState<CoachChatFlagSeverity>('critical');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => flagCoachTurn(turnId, kind, severity, note.trim()),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });

  return (
    <div className="chat-flag-form">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="seg" role="group" aria-label="Flag type">
          {(Object.keys(FLAG_KIND_LABEL) as CoachChatFlagKind[]).map((k) => (
            <button key={k} type="button" className="seg-item" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {FLAG_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Severity">
          {(['critical', 'minor'] as CoachChatFlagSeverity[]).map((s) => (
            <button key={s} type="button" className="seg-item" aria-pressed={severity === s} onClick={() => setSeverity(s)}>
              {s === 'critical' ? 'Critical' : 'Minor'}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="field"
        rows={3}
        dir="auto"
        placeholder="What went wrong, and what should it have done?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {save.error && <ErrorNote error={save.error} />}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn small primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save flag
        </button>
        <button type="button" className="btn small ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function FlagRow({ flag, userId }: { flag: CoachChatFlag; userId: string }) {
  const invalidate = useInvalidateChats(userId);
  const [fixRef, setFixRef] = useState(flag.fix_ref ?? '');
  const update = useMutation({
    mutationFn: (changes: { status?: CoachChatFlagStatus; fixRef?: string }) => updateCoachFlag(flag.id, changes),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => deleteCoachFlag(flag.id), onSuccess: invalidate });

  return (
    <div className={`chat-flag ${flag.severity}`}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Badge tone={flag.severity === 'critical' ? 'accent' : undefined}>
          {FLAG_KIND_LABEL[flag.kind]} · {flag.severity}
        </Badge>
        <select
          className="field chat-flag-status"
          value={flag.status}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ status: e.target.value as CoachChatFlagStatus })}
        >
          {(Object.keys(FLAG_STATUS_LABEL) as CoachChatFlagStatus[]).map((s) => (
            <option key={s} value={s}>
              {FLAG_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          className="field chat-flag-ref"
          placeholder="Fix commit"
          value={fixRef}
          onChange={(e) => setFixRef(e.target.value)}
          onBlur={() => fixRef.trim() !== (flag.fix_ref ?? '') && update.mutate({ fixRef: fixRef.trim() })}
        />
        <span className="dim" style={{ fontSize: 12 }}>
          {formatDateTime(flag.created_at)}
        </span>
        <button
          type="button"
          className="btn small ghost"
          disabled={remove.isPending}
          onClick={() => window.confirm('Delete this flag?') && remove.mutate()}
        >
          Delete
        </button>
      </div>
      {flag.note && (
        <div className="chat-flag-note" dir="auto">
          {flag.note}
        </div>
      )}
      {(update.error || remove.error) && <ErrorNote error={update.error ?? remove.error} />}
    </div>
  );
}

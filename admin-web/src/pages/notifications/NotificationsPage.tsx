import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchNotifications, fetchUnreadCount, markAllRead, markRead, type NotificationRow } from '@/api/notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';
import { PageHeader } from '@/components/layout';

// Types this inbox currently receives: client_workout_logged /
// client_day_complete / client_week_complete (all notify-coach-workout-logged
// — day/week-complete only for a real human coach's own clients, never the
// AI Coach or self-service system profiles), client_achievement (data.kind:
// tier_promotion | power_pb | static_pb | one_mm_pb | arena_pb, from the
// five submission RPCs), client_program_update (assign/append/overwrite),
// client_needs_attention (send-client-attention-alerts, cron). Anything
// else falls through to the default tone/icon below rather than being
// hidden — new notification types should show up here without a code change.
const TONE_BY_TYPE: Record<string, 'accent' | 'ok' | 'warn'> = {
  client_achievement: 'ok',
  client_workout_logged: 'accent',
  client_day_complete: 'accent',
  client_week_complete: 'ok',
  client_program_update: 'accent',
  client_needs_attention: 'warn',
  new_signup: 'accent',
  new_subscription: 'ok',
  program_review_request: 'accent',
  program_review_overdue: 'warn',
};

const ICON_BY_TYPE: Record<string, string> = {
  client_achievement: '🏆',
  client_needs_attention: '⚠️',
  client_workout_logged: '📋',
  client_day_complete: '✅',
  client_week_complete: '🗓️',
  client_program_update: '📦',
  new_signup: '👋',
  new_subscription: '💳',
  program_review_request: '🛡️',
  program_review_overdue: '⏰',
};

function NotificationIcon({ type }: { type: string }) {
  const tone = TONE_BY_TYPE[type] ?? 'warn';
  return <span className={`notif-icon ${tone}`}>{ICON_BY_TYPE[type] ?? '🔔'}</span>;
}

/** Where a notification leads: the review, the client's progress, or (admin)
 * the user's profile. Null when there's nothing to open. */
async function destinationFor(n: NotificationRow, isAdmin: boolean): Promise<string | null> {
  const d = n.data ?? {};
  if (typeof d.review_id === 'string') return `/program-reviews/${d.review_id}`;
  const warriorId = typeof d.warriorId === 'string' ? d.warriorId : typeof d.client_id === 'string' ? d.client_id : null;
  if (warriorId) {
    // RLS scopes this to programs the viewer coaches (all, for an admin).
    const { data } = await supabase
      .from('warrior_programs')
      .select('id, status')
      .eq('warrior_id', warriorId)
      .order('assigned_at', { ascending: false })
      .limit(10);
    const rows = (data ?? []) as Array<{ id: string; status: string | null }>;
    const program = rows.find((r) => r.status === 'active') ?? rows[0];
    if (program) return `/coaching/clients/${program.id}/progress`;
    return isAdmin ? `/users/${warriorId}` : null;
  }
  if (isAdmin && typeof d.user_id === 'string') return `/users/${d.user_id}`;
  return null;
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: NotificationRow;
  onOpen: (n: NotificationRow) => void;
}) {
  const unread = !notification.read_at;
  return (
    <button
      type="button"
      className={`notif-row${unread ? ' unread' : ''}`}
      onClick={() => onOpen(notification)}
    >
      <NotificationIcon type={notification.type} />
      <div className="notif-body">
        <div className="notif-title">{notification.title}</div>
        <div className="notif-text">{notification.body}</div>
      </div>
      <div className="notif-meta">
        {unread && <span className="notif-dot" aria-label="Unread" />}
        <span className="notif-time">{formatDateTime(notification.created_at)}</span>
      </div>
    </button>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const notificationsQ = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => fetchNotifications(),
  });
  // The same count as the menu badge: every unread row, not only the 50 shown.
  const unreadQ = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: fetchUnreadCount });
  const unreadCount = unreadQ.data ?? 0;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readMutation = useMutation({ mutationFn: markRead, onSettled: invalidate });
  const readAllMutation = useMutation({ mutationFn: markAllRead, onSettled: invalidate });
  const [openError, setOpenError] = useState<Error | null>(null);

  async function open(n: NotificationRow) {
    setOpenError(null);
    if (!n.read_at) readMutation.mutate(n.id);
    try {
      const to = await destinationFor(n, isAdmin);
      if (to) navigate(to);
    } catch (e) {
      setOpenError(e instanceof Error ? e : new Error('Could not open this notification.'));
    }
  }

  const error = notificationsQ.error ?? readMutation.error ?? readAllMutation.error ?? openError;

  return (
    <div className="page">
      <PageHeader
        title="Notifications"
        sub={<span className="num">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'} · the latest 50 are shown</span>}
        actions={
          <button
            type="button"
            className="btn small"
            disabled={unreadCount === 0 || readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            Mark all read
          </button>
        }
      />
      {error && <ErrorNote error={error} />}
      <section className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {notificationsQ.isLoading && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 56 }} />
              ))}
            </div>
          )}
          {!notificationsQ.isLoading && (notificationsQ.data?.length ?? 0) === 0 && (
            <div className="empty">
              <span className="label">Nothing yet</span>
              Client workout logs and achievements will show up here.
            </div>
          )}
          {(notificationsQ.data ?? []).map((n) => (
            <NotificationItem key={n.id} notification={n} onOpen={(x) => void open(x)} />
          ))}
        </div>
      </section>
    </div>
  );
}

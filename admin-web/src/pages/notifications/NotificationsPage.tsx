import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markAllRead, markRead, type NotificationRow } from '@/api/notifications';
import { ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';

// Types this inbox currently receives: client_workout_logged
// (notify-coach-workout-logged), client_achievement (data.kind:
// tier_promotion | power_pb | static_pb | one_mm_pb | arena_pb, from the
// five submission RPCs), client_program_update (assign/append/overwrite).
// Anything else falls through to the default tone/icon below rather than
// being hidden — new notification types should show up here without a
// code change.
const TONE_BY_TYPE: Record<string, 'accent' | 'ok' | 'warn'> = {
  client_achievement: 'ok',
  client_workout_logged: 'accent',
  client_program_update: 'accent',
};

const ICON_BY_TYPE: Record<string, string> = {
  client_achievement: '🏆',
  client_workout_logged: '📋',
  client_program_update: '📦',
};

function NotificationIcon({ type }: { type: string }) {
  const tone = TONE_BY_TYPE[type] ?? 'warn';
  return <span className={`notif-icon ${tone}`}>{ICON_BY_TYPE[type] ?? '🔔'}</span>;
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: NotificationRow;
  onRead: (id: string) => void;
}) {
  const unread = !notification.read_at;
  return (
    <button
      type="button"
      className={`notif-row${unread ? ' unread' : ''}`}
      onClick={() => {
        if (unread) onRead(notification.id);
      }}
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
  const notificationsQ = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => fetchNotifications(),
  });

  const unreadCount = (notificationsQ.data ?? []).filter((n) => !n.read_at).length;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function handleRead(id: string) {
    await markRead(id);
    invalidate();
  }

  async function handleMarkAllRead() {
    await markAllRead();
    invalidate();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Notifications</h2>
        <button
          type="button"
          className="btn small"
          disabled={unreadCount === 0}
          onClick={() => void handleMarkAllRead()}
        >
          Mark all read
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {notificationsQ.error && (
          <div style={{ padding: 16 }}>
            <ErrorNote error={notificationsQ.error} />
          </div>
        )}
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
          <NotificationItem key={n.id} notification={n} onRead={handleRead} />
        ))}
      </div>
    </section>
  );
}

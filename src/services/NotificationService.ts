import { supabase } from '../lib/supabase';
import { withNetworkRetry } from '../lib/submitErrors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push-notification`;
const NOTIFY_COACH_WORKOUT_LOGGED_URL = `${SUPABASE_URL}/functions/v1/notify-coach-workout-logged`;
const NOTIFY_CLIENT_PROGRAM_UPDATE_URL = `${SUPABASE_URL}/functions/v1/notify-client-program-update`;
const SEND_OVERTAKE_NOTIFICATION_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-overtake-notification-push`;

export type NotificationType = 'tier_promotion' | 'new_best_time' | 'power_pb' | 'one_mm_pb' | 'arena_pb' | 'static_pb' | 'weekly_challenge_pb';
export type ProgramUpdateType = 'program_assigned' | 'week_unlocked';

async function postToEdgeFunction(url: string, body: Record<string, unknown>) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;

  await withNetworkRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

export class NotificationService {
  /**
   * Records a notification (in-app inbox) and, if the recipient has a push
   * token and hasn't opted out, delivers it as a push. Self-only for now —
   * create_notification rejects any user_id other than the caller's own.
   * Failures here are swallowed: a missed push should never block the
   * action that triggered it (tier-up, etc).
   */
  static async notify(userId: string, type: NotificationType, title: string, body: string, data: Record<string, unknown> = {}) {
    try {
      const { data: notificationId, error } = await supabase.rpc('create_notification', {
        p_user_id: userId,
        p_type: type,
        p_title: title,
        p_body: body,
        p_data: data,
      });

      if (error) {
        if (__DEV__) console.log('[Notify] create_notification failed', error);
        return;
      }
      if (!notificationId) {
        // User opted out of this notification type — nothing more to do.
        return;
      }

      await postToEdgeFunction(SEND_PUSH_URL, { notification_id: notificationId });
    } catch (err) {
      if (__DEV__) console.log('[Notify] send failed', err);
    }
  }

  /**
   * Fired by the client right after they log a workout block as 'completed'
   * (not 'missed'). The Edge Function does its own ownership check (the
   * workout_log must belong to the caller) before it looks up the assigned
   * coach and sends them a push — this call alone can't be used to spam an
   * arbitrary coach, since a fabricated/foreign workout_log_id is rejected.
   */
  static async notifyCoachWorkoutLogged(workoutLogId: string) {
    try {
      await postToEdgeFunction(NOTIFY_COACH_WORKOUT_LOGGED_URL, { workout_log_id: workoutLogId });
    } catch (err) {
      if (__DEV__) console.log('[Notify] coach workout notify failed', err);
    }
  }

  /**
   * Fired by the coach right after assigning a new program or unlocking a
   * new week for a client. The Edge Function re-derives everything (coach
   * ownership of the program, template name, client id) from
   * warrior_program_id server-side rather than trusting client-supplied text.
   */
  static async notifyClientProgramUpdate(warriorProgramId: string, updateType: ProgramUpdateType) {
    try {
      await postToEdgeFunction(NOTIFY_CLIENT_PROGRAM_UPDATE_URL, { warrior_program_id: warriorProgramId, update_type: updateType });
    } catch (err) {
      if (__DEV__) console.log('[Notify] client program update notify failed', err);
    }
  }

  /**
   * Fired by the submitter right after a leaderboard-improving submission
   * whose RPC response included an overtaken_notification_id — the row
   * (and the legitimacy of who it targets) was already created server-side
   * inside that same RPC call. This just prompts immediate delivery.
   */
  static async sendOvertakeNotificationPush(notificationId: string) {
    try {
      await postToEdgeFunction(SEND_OVERTAKE_NOTIFICATION_PUSH_URL, { notification_id: notificationId });
    } catch (err) {
      if (__DEV__) console.log('[Notify] overtake notify failed', err);
    }
  }
}

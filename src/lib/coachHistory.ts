import en from '../i18n/locales/en';
import ar from '../i18n/locales/ar';

// The chat shows the app's own "couldn't reach your coach" bubble as an
// assistant message, so it used to go back to the AI Coach in the history
// as if the coach had said it (seen 2026-11-14: a dropped send, then "?",
// reached the coach as [failed message, error text, "?"]). It is swapped
// for a short neutral note instead of removed, the same way the server
// treats the app's usage notices (supabase/functions/ai-coach/tools/
// usageNotices.ts), so user/assistant turns keep alternating and the coach
// knows the message before it was never answered.

// Both languages: a saved chat keeps the language it was written in.
const APP_ERROR_REPLIES = new Set([en.coach.errReach.trim(), ar.coach.errReach.trim()]);

export const APP_ERROR_NOTE =
  "(App note: the app couldn't reach the coach here, so nothing was answered at this point.)";

export function isAppErrorReply(m: { role: string; content: string }): boolean {
  return m.role === 'assistant' && APP_ERROR_REPLIES.has((m.content || '').trim());
}

/** The history sent to the AI Coach: role + content, app error bubbles neutralised. */
export function historyForCoach(messages: { role: 'user' | 'assistant'; content: string }[]) {
  return messages.map(({ role, content }) => ({
    role,
    content: isAppErrorReply({ role, content }) ? APP_ERROR_NOTE : content,
  }));
}

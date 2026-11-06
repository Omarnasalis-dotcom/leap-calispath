// The message the app sends by itself when a chat starts (CoachScreen.tsx
// startSession). The athlete didn't write it, so it doesn't use one of their
// messages (migration 20261107010000_ai_coach_fair_message_count.sql). Exact
// text and alone in the chat, so a real message can't pass for it.
export const AUTO_OPENER_TEXT = "Hi, I want to start working with my AI Coach.";

export function isAutoOpener(messages: Array<{ role: string; content: unknown }>): boolean {
  return messages.length === 1 && messages[0].role === "user" && messages[0].content === AUTO_OPENER_TEXT;
}

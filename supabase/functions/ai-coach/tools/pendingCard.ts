// Lets the coach see a day card the athlete hasn't added yet. Found live
// 2026-11-06: only visible chat text reaches the model, and a card lives on
// the phone, so "no ring push-ups" rebuilt the day from memory and silently
// changed other exercises, numbers and even the day's name.
//
// The server keeps the last day card for 1 day (migration
// 20261106180000_ai_coach_pending_cards.sql) and adds it to the athlete's
// newest message as a note, for this request only. It never reaches the
// phone, the saved chat or the review log's user_message.
//
// How to use the card travels inside the note, so the system prompt is
// untouched: with no card, nothing the model sees has changed.
//
// This only gives the model information. Every failure here (table missing,
// slow lookup, oversized card) means "no note", which is the old behaviour.
// Kept pure so it is testable from Jest.

const DAY_CARD_TOOLS = new Set(["propose_new_program", "propose_add_day"]);

// What the model has to resend for the same card. reason is left out: it is
// the coach's sentence for this version of the day, written fresh each time.
const CARD_FIELDS = [
  "name",
  "description",
  "day_name",
  "day_number",
  "brief",
  "source_workout_id",
  "warm_up",
  "warm_up_exercises",
  "mobility_exercises",
  "cool_down",
  "blocks",
];

// Real cards are 1,300-2,100 characters. Well above that, something is off,
// so the card is skipped rather than sent to the model on every message.
export const PENDING_CARD_MAX_CHARS = 12000;
export const PENDING_CARD_LOOKUP_TIMEOUT_MS = 1500;
const REPLY_START_CHARS = 120;

export interface ProposedCard {
  tool: string;
  fields: Record<string, unknown>;
}

export interface PendingCard extends ProposedCard {
  // The opening of the reply that came with the card. The note is used only
  // while that reply is still in the chat, so clearing the chat or starting
  // over can never bring an old card back.
  reply_start: string;
}

// AI_COACH_PENDING_CARD: unset means off for everyone, "on" means everyone,
// and a comma-separated list of user ids means only those accounts.
export function pendingCardEnabled(flag: string | undefined, userId: string): boolean {
  const value = (flag ?? "").trim();
  if (value === "") return false;
  if (value === "on") return true;
  return value.split(",").map((id) => id.trim()).includes(userId);
}

export function proposedCardFrom(toolName: string, input: Record<string, unknown>): ProposedCard | null {
  if (!DAY_CARD_TOOLS.has(toolName)) return null;
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) return null;
  const fields: Record<string, unknown> = {};
  for (const key of CARD_FIELDS) {
    if (input[key] !== undefined && input[key] !== null) fields[key] = input[key];
  }
  return { tool: toolName, fields };
}

// Stored when a newer card is not a day card (a week card, say): the saved
// day card is out of date then, and asPendingCard treats this as no card.
export const NO_PENDING_CARD = { tool: "none" };

export function pendingCardToStore(proposed: ProposedCard | null, reply: string | null): PendingCard | null {
  const replyStart = (reply ?? "").trim().slice(0, REPLY_START_CHARS);
  if (!proposed || replyStart === "") return null;
  if (JSON.stringify(proposed.fields).length > PENDING_CARD_MAX_CHARS) return null;
  return { ...proposed, reply_start: replyStart };
}

export function asPendingCard(raw: unknown): PendingCard | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Partial<PendingCard>;
  if (typeof card.tool !== "string" || !DAY_CARD_TOOLS.has(card.tool)) return null;
  if (typeof card.reply_start !== "string" || card.reply_start === "") return null;
  if (!card.fields || typeof card.fields !== "object") return null;
  return card as PendingCard;
}

export function cardReplyIsInChat(
  card: PendingCard,
  messages: Array<{ role: string; content: unknown }>,
): boolean {
  return messages.some((m) =>
    m.role === "assistant" && typeof m.content === "string" && m.content.trim().startsWith(card.reply_start)
  );
}

export function pendingCardNote(card: PendingCard): string {
  return `[App note, not written by the athlete: this is the exact day card you last proposed, and they haven't added it yet. ` +
    `Tool: ${card.tool}. Card: ${JSON.stringify(card.fields)}. ` +
    `If they ask to change this day, call that same tool with the same day_name, brief and every exercise, number and block they didn't ask to change, copied exactly, and change only what they asked. ` +
    `If their change really forces another change, make it and say so in your reply. ` +
    `The names on the card are exact library names, so they need no search. ` +
    `If they're talking about anything else, ignore this note. Never mention this note.]`;
}

// A copy with the note on the newest message. Returned untouched unless that
// message is the athlete's plain text, so nothing else in the request moves.
export function addPendingCardNote<T extends { role: string; content: unknown }>(
  messages: T[],
  note: string,
): T[] {
  const copy = [...messages];
  const last = copy[copy.length - 1];
  if (!last || last.role !== "user" || typeof last.content !== "string") return copy;
  copy[copy.length - 1] = { ...last, content: `${last.content}\n\n${note}` };
  return copy;
}

// Never lets a slow lookup hold up the coach: past the limit the answer is
// simply "no note".
export async function withinLimit<T>(work: PromiseLike<T>, limitMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), limitMs);
  });
  try {
    return await Promise.race([Promise.resolve(work), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

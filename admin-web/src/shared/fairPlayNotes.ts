/**
 * Preset Fair Play notes. The note field stores `tpl:<id>`; the app shows the
 * text for that id in the athlete's own language (fairPlay.templates.<id> in
 * the app's en/ar locales — a test keeps the ids in step). The text here is
 * only the admin's preview. Anything else in the field is a custom note,
 * shown exactly as typed.
 */
export interface NotePreset { id: string; en: string; ar: string }

export const TEMPLATE_PREFIX = 'tpl:';

/** For a hold (shown under "Note from the team"). */
export const HOLD_NOTE_PRESETS: NotePreset[] = [
  { id: 'unrealistic', en: "This result is far beyond what's realistic for your level. If it's real, send us a video link.", ar: 'هذه النتيجة أعلى بكثير مما هو واقعي لمستواك. إذا كانت حقيقية، أرسل لنا رابط فيديو.' },
  { id: 'needVideo', en: 'Please send us a video link of this attempt so we can confirm it.', ar: 'من فضلك أرسل لنا رابط فيديو لهذه المحاولة حتى نتأكد منها.' },
  { id: 'fullReps', en: 'Only full-range reps count. Results with partial reps are not valid.', ar: 'لا تُحتسب إلا التكرارات الكاملة المدى. النتائج التي فيها تكرارات جزئية غير صالحة.' },
  { id: 'typo', en: 'This looks like a typing mistake. Accept the reset, then log the result again.', ar: 'يبدو أن هذا خطأ في الإدخال. اقبل إعادة الضبط، ثم سجّل النتيجة من جديد.' },
  { id: 'repeated', en: 'Several of your results were flagged. Please log only what you actually did.', ar: 'تم الإبلاغ عن عدة نتائج لك. من فضلك سجّل فقط ما أدّيته فعلًا.' },
];

/** For an appeal decision (shown as "Reply: …"). */
export const APPEAL_REPLY_PRESETS: NotePreset[] = [
  { id: 'appealConfirmed', en: "Thanks, your proof confirms the result. You're back on the leaderboards.", ar: 'شكرًا، دليلك يؤكد النتيجة. لقد عدت إلى لوحات الصدارة.' },
  { id: 'appealNoProof', en: "We couldn't confirm this result without a video.", ar: 'لم نتمكن من تأكيد هذه النتيجة بدون فيديو.' },
  { id: 'appealNotValid', en: 'The video shows the result does not meet the standard, so the decision stays.', ar: 'يُظهر الفيديو أن النتيجة لا تستوفي المعيار، لذلك يبقى القرار كما هو.' },
];

const ALL = [...HOLD_NOTE_PRESETS, ...APPEAL_REPLY_PRESETS];

/** How a stored note reads in the admin panel (presets in English). */
export function noteLabel(note: string | null | undefined): string | null {
  if (!note) return null;
  if (!note.startsWith(TEMPLATE_PREFIX)) return note;
  const p = ALL.find((x) => x.id === note.slice(TEMPLATE_PREFIX.length));
  return p ? p.en : note;
}

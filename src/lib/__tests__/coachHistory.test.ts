import { APP_ERROR_NOTE, historyForCoach, isAppErrorReply } from '../coachHistory';
import en from '../../i18n/locales/en';
import ar from '../../i18n/locales/ar';

describe('historyForCoach', () => {
  it("sends the app's error bubble as a neutral note, keeping the turn order", () => {
    // The 2026-11-14 case: a send that never reached the server, then "?".
    const chat = [
      { role: 'user' as const, content: 'I want to add hip mobility' },
      { role: 'assistant' as const, content: 'Got it — can you do a tuck planche?' },
      { role: 'user' as const, content: 'I mean press to handstand' },
      { role: 'assistant' as const, content: en.coach.errReach },
      { role: 'user' as const, content: '?' },
    ];
    const out = historyForCoach(chat);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(out[3].content).toBe(APP_ERROR_NOTE);
    expect(out[2].content).toBe('I mean press to handstand');
    expect(out.some((m) => m.content === en.coach.errReach)).toBe(false);
  });

  it('recognises the Arabic bubble too (saved chats keep their language)', () => {
    expect(isAppErrorReply({ role: 'assistant', content: ar.coach.errReach })).toBe(true);
    expect(isAppErrorReply({ role: 'assistant', content: `  ${en.coach.errReach}\n` })).toBe(true);
  });

  it("leaves the coach's real replies, the user's words and extra fields alone", () => {
    expect(isAppErrorReply({ role: 'user', content: en.coach.errReach })).toBe(false);
    const out = historyForCoach([
      { role: 'assistant', content: 'Week 8 is ready.', blocks: [{ type: 'x' }] } as any,
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'Week 8 is ready.' }]);
  });
});

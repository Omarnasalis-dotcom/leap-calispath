import { parseCoachText } from '../CoachMessageText';

describe('parseCoachText', () => {
  it('turns recap lines into label / result / change', () => {
    const [p] = parseCoachText('PULL Strength (Banded Pull Ups): solid at RPE7 → hold reps, keep banded');
    expect(p[0]).toEqual({ type: 'recap', label: 'PULL Strength (Banded Pull Ups)', result: 'solid at RPE7', change: 'hold reps, keep banded' });
  });

  it('keeps a change that itself contains an arrow', () => {
    const [p] = parseCoachText('LEGS Strength (Goblet Squat): RPE7 → add load, 15kg → 17.5kg');
    expect(p[0]).toMatchObject({ type: 'recap', result: 'RPE7', change: 'add load, 15kg → 17.5kg' });
  });

  it('leaves ordinary sentences with a colon (and no arrow) as text', () => {
    const [p] = parseCoachText("Here's the plan: we build pull strength first.");
    expect(p[0]).toEqual({ type: 'text', text: "Here's the plan: we build pull strength first." });
  });

  it('splits paragraphs on blank lines and reads lists', () => {
    const paras = parseCoachText('Intro line\n\n- one\n2. two\n\nOutro');
    expect(paras).toHaveLength(3);
    expect(paras[1]).toEqual([{ type: 'bullet', text: 'one' }, { type: 'numbered', n: '2', text: 'two' }]);
  });

  it('reads a bulleted recap line as a recap', () => {
    const [p] = parseCoachText('- PUSH Strength - 1 (Push Ups): strong at RPE8 → progress to Decline Push Ups');
    expect(p[0]).toMatchObject({ type: 'recap', label: 'PUSH Strength - 1 (Push Ups)' });
  });
});

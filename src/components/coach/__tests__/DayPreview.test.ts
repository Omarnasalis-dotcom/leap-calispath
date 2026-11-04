// "See exercises" on the day card (2026-11-04, owner): how each exercise's
// dose reads, in English and Arabic.
import i18n from '../../../i18n';
import { isGrouped, previewDose } from '../DayPreview';

const ex = (o: Partial<{ sets: number | null; reps: number | null; hold_seconds: number | null; is_weighted: boolean }>) => ({
  name: 'X', sets: null, reps: null, hold_seconds: null, is_weighted: false, ...o,
});

describe('previewDose', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('reads sets × reps and holds for a straight block', () => {
    expect(previewDose(ex({ sets: 4, reps: 3 }), false)).toBe('4 × 3');
    expect(previewDose(ex({ sets: 3, hold_seconds: 15 }), false)).toBe('3 × 15s');
    expect(previewDose(ex({ sets: 4, reps: 5, is_weighted: true }), false)).toBe('4 × 5 + weight');
  });

  it('drops the sets count inside a circuit, where rounds repeat the group', () => {
    expect(previewDose(ex({ sets: 1, reps: 8 }), true)).toBe('8 reps');
    expect(previewDose(ex({ sets: 1, reps: 1 }), true)).toBe('1 rep');
    expect(previewDose(ex({ sets: 1, hold_seconds: 30 }), true)).toBe('30s');
  });

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar');
    expect(previewDose(ex({ sets: 4, reps: 3 }), false)).toBe('4 × 3');
    expect(previewDose(ex({ sets: 3, hold_seconds: 15 }), false)).toBe('3 × 15 ث');
    expect(previewDose(ex({ sets: 1, reps: 8 }), true)).toBe('8 تكرارات');
    expect(previewDose(ex({ sets: 1, reps: 12 }), true)).toBe('12 تكرارًا');
    expect(previewDose(ex({ sets: 4, reps: 5, is_weighted: true }), false)).toBe('4 × 5 + وزن');
    expect(i18n.t('coach.previewRounds', { count: 2 })).toBe('جولتان');
  });
});

describe('isGrouped', () => {
  it('treats circuits and supersets as grouped', () => {
    expect(isGrouped({ title: 'Warm-Up', structure: 'circuit', rounds: 2, exercises: [] })).toBe(true);
    expect(isGrouped({ title: 'A', structure: 'superset', rounds: 3, exercises: [] })).toBe(true);
    expect(isGrouped({ title: 'Skills', structure: 'single', rounds: null, exercises: [] })).toBe(false);
  });
});

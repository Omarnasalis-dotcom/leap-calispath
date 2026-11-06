import { programReviewError, ProgramReview, reviewChangeLine, reviewForWeek, reviewReasonText } from '../programReview';

jest.mock('../supabase', () => ({ supabase: {} }));

const change = (over: object = {}) => ({
  block_name: 'Pull',
  exercise_before: 'Pull Ups',
  exercise_after: 'Pull Ups',
  before: { sets: 5, reps: 8, rest_seconds: 90 },
  after: { sets: 4, reps: 6, rest_seconds: 90 },
  reason: 'too_hard',
  ...over,
});

describe('reviewChangeLine', () => {
  it('shows the new sets and reps', () => {
    expect(reviewChangeLine(change())).toContain('Pull Ups 5×8 → 4×6');
  });

  it('shows a swap with both names', () => {
    expect(reviewChangeLine(change({ exercise_after: 'Ring Rows' }))).toContain('Pull Ups 5×8 → Ring Rows 4×6');
  });

  it('shows holds in seconds', () => {
    expect(reviewChangeLine(change({
      before: { sets: 3, reps: null, hold_seconds: 20 },
      after: { sets: 3, reps: null, hold_seconds: 15 },
    }))).toContain('3×20s → 3×15s');
  });

  it('shows a rest-only change', () => {
    const line = reviewChangeLine(change({ after: { sets: 5, reps: 8, rest_seconds: 120 } }));
    expect(line).toContain('Pull Ups');
    expect(line).toContain('rest 90s → 120s');
    expect(line).not.toContain('→ 5×8');
  });
});

describe('a change to block settings', () => {
  const settings = (before: object, after: object) => reviewChangeLine(change({
    kind: 'settings', block_name: 'Strength', exercise_before: null, exercise_after: null, before, after,
  }));

  it('names the block and only what changed', () => {
    const line = settings({ rounds: '3', rest_after_round: 60 }, { rounds: '2', rest_after_round: 60 });
    expect(line).toContain('Strength');
    expect(line).toContain('3 rounds → 2');
    expect(line).not.toContain('rest');
    expect(line).not.toContain('null');
  });

  it('shows every kind of setting', () => {
    expect(settings({ rest_after_round: 60 }, { rest_after_round: 90 })).toContain('rest between rounds 60s → 90s');
    expect(settings({ time_cap_min: 10 }, { time_cap_min: 8 })).toContain('time cap 10 min → 8 min');
    expect(settings({ tabata_work_seconds: 20 }, { tabata_work_seconds: 30 })).toContain('work 20s → 30s');
    expect(settings({ tabata_rest_seconds: 10 }, { tabata_rest_seconds: 15 })).toContain('rest 10s → 15s');
    expect(settings({ tabata_rounds: 8 }, { tabata_rounds: 6 })).toContain('8 rounds → 6');
    expect(settings({ ladder_start: 10 }, { ladder_start: 8 })).toContain('starts at 10 → 8');
    expect(settings({ ladder_sub: 2 }, { ladder_sub: 1 })).toContain('step 2 → 1');
    expect(settings({ ladder_direction: 'down' }, { ladder_direction: 'up' })).toContain('down → up');
  });

  it('reads a setting added or removed', () => {
    expect(settings({ rest_after_round: null }, { rest_after_round: 60 })).toContain('none');
  });

  it('counts 90 and "90" as the same', () => {
    expect(settings({ rest_after_round: 90, rounds: '3' }, { rest_after_round: '90', rounds: '2' })).not.toContain('between rounds');
  });
});

describe('reviewReasonText', () => {
  it('translates a preset and keeps a written reason', () => {
    expect(reviewReasonText('too_hard')).toBe('It looked too hard for your current max.');
    expect(reviewReasonText('Slow the tempo')).toBe('Slow the tempo');
  });
});

describe('programReviewError', () => {
  it('maps the server codes', () => {
    expect(programReviewError({ message: 'REVIEW_LIMIT' })).toBe('Your plan includes one review per plan period.');
  });

  it('never shows raw text', () => {
    expect(programReviewError({ message: 'some database error' })).toBe("That didn't go through. Please try again.");
    expect(programReviewError(null)).toBe("That didn't go through. Please try again.");
  });
});

describe('reviewForWeek', () => {
  it('finds the week', () => {
    const reviews = [{ id: 'a', week_number: 2 }, { id: 'b', week_number: 1 }] as ProgramReview[];
    expect(reviewForWeek(reviews, 1)?.id).toBe('b');
    expect(reviewForWeek(reviews, 3)).toBeNull();
  });
});

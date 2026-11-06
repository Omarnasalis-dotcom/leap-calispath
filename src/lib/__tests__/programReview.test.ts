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

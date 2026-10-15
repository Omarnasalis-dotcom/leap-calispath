jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

import { describeFlag, FairPlayFlagSummary } from '../FairPlayService';

const flag = (p: Partial<FairPlayFlagSummary>): FairPlayFlagSummary => ({
  area: 'static', movement_id: null, value: null, rule: 'ceiling', created_at: '2026-10-16T00:00:00Z', ...p,
});

describe('describeFlag', () => {
  it('names static holds in seconds', () => {
    expect(describeFlag(flag({ area: 'static', movement_id: 'wall_handstand', value: 900 }))).toBe('Wall Handstand · 900 s');
  });

  it('names endurance sets in reps', () => {
    expect(describeFlag(flag({ area: 'endurance', movement_id: 'inverted_row', value: 70 }))).toBe('Inverted Row · 70 reps');
  });

  it('maps the power columns to their lifts', () => {
    expect(describeFlag(flag({ area: 'power', movement_id: 'pullup_1rm', value: 120 }))).toBe('Weighted Pull-up · 120 kg');
    expect(describeFlag(flag({ area: 'power', movement_id: 'muscleup_1rm', value: 60 }))).toBe('Weighted Muscle-up · 60 kg');
    expect(describeFlag(flag({ area: 'power', movement_id: 'dip_1rm', value: 150 }))).toBe('Weighted Dip · 150 kg');
  });

  it('formats strength trials as a clock', () => {
    expect(describeFlag(flag({ area: 'strength', movement_id: '3', value: 95 }))).toMatch(/Trial · 1:35$/);
  });

  it('falls back when a value or movement is missing', () => {
    expect(describeFlag(flag({ area: 'static', movement_id: 'unknown_hold' }))).toBe('unknown_hold');
    expect(describeFlag(flag({ area: 'weekly', value: 300 }))).toBe('Weekly Challenge · 300');
  });
});

jest.mock('../supabase', () => ({ supabase: {} }));

import { worldRows, WorldBests } from '../performance';

const bests: WorldBests = {
  static: [{ movement: 'tuck_front_lever', seconds: 30, points: 120 }, { movement: 'new_hold_move', seconds: 8.5, points: 40 }],
  onemm: [{ movement: 'unknown_move', reps: 25, points: 80 }],
  power: { pullup: 20, dip: 0, squat: 100, muscleup: null },
};

describe('worldRows (world tiles in My Progress)', () => {
  it('Static: the movement, seconds and points', () => {
    expect(worldRows('static', bests)[0]).toEqual({ name: 'Tuck Front Lever', kind: 'seconds', value: 30, points: 120 });
  });

  it('a movement not in the app yet still gets a readable name', () => {
    expect(worldRows('static', bests)[1].name).toBe('New hold move');
    expect(worldRows('onemm', bests)[0]).toEqual({ name: 'Unknown move', kind: 'reps', value: 25, points: 80 });
  });

  it('Power: only lifts with a result; squat is a load, the rest are added weight', () => {
    expect(worldRows('power', bests)).toEqual([
      { name: 'Pull-up', kind: 'load', value: 20, added: true },
      { name: 'Squat', kind: 'load', value: 100, added: false },
    ]);
  });

  it('older data or no results: nothing to list', () => {
    expect(worldRows('static', undefined)).toEqual([]);
    expect(worldRows('power', { static: [], onemm: [], power: null })).toEqual([]);
  });
});

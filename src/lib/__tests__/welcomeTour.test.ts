import { firstNameOf, greetingSize, isCompactHeight, litRings, WT_LINE0, WT_LINE1, WT_NODE_T } from '../welcomeTour';

describe('welcomeTour', () => {
  it('lights floor(tier / 2) + 1 rings', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(litRings)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(litRings(-1)).toBe(1);
    expect(litRings(12)).toBe(5);
  });

  it('reaches the stops evenly along the line', () => {
    expect(WT_NODE_T[0]).toBe(WT_LINE0);
    expect(WT_NODE_T[3]).toBeCloseTo(WT_LINE1);
    expect(WT_NODE_T[1] - WT_NODE_T[0]).toBeCloseTo(WT_NODE_T[2] - WT_NODE_T[1]);
  });

  it('uses the first token of the name', () => {
    expect(firstNameOf('  Omar Nasser ')).toBe('Omar');
    expect(firstNameOf('Abdulrahman-Maximilian Alexander')).toBe('Abdulrahman-Maximilian');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it('steps the greeting down for long names', () => {
    expect(greetingSize('Omar', false)).toBe(28);
    expect(greetingSize('Abdulrahman', false)).toBe(24);
    expect(greetingSize('Abdulrahman-Maximilian', false)).toBe(20);
    expect(greetingSize(null, true)).toBe(24);
  });

  it('goes compact under 760pt', () => {
    expect(isCompactHeight(667)).toBe(true);
    expect(isCompactHeight(874)).toBe(false);
  });
});

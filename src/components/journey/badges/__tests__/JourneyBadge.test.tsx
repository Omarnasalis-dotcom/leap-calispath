import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { JourneyBadge, BadgePart } from '../JourneyBadge';
import { ACHIEVEMENTS, levelForPoints } from '../../../../lib/journeyAchievements';

const LAYERS: readonly BadgePart[] = ['rays', 'wingL', 'wingR', 'body', 'gem'];

function countNodes(r: ReactTestRenderer): number {
  return r.root.findAll(() => true).length;
}

describe('JourneyBadge', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); r = undefined; });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('renders level %i full and simple', (level) => {
    act(() => { r = create(<JourneyBadge level={level} size={160} />); });
    expect(r!.toJSON()).toBeTruthy();
    act(() => r!.update(<JourneyBadge level={level} size={20} simple />));
    expect(r!.toJSON()).toBeTruthy();
  });

  it('renders the forge palette', () => {
    act(() => { r = create(<JourneyBadge level={4} size={160} hot />); });
    expect(r!.toJSON()).toBeTruthy();
  });

  it.each([6, 7, 8])('renders each layer of level %i on its own (alignment is checked in the dev gallery)', (level) => {
    act(() => { r = create(<JourneyBadge level={level} size={160} />); });
    const whole = countNodes(r!);
    act(() => r!.unmount());
    let sum = 0;
    for (const p of LAYERS) {
      act(() => { r = create(<JourneyBadge level={level} size={160} parts={[p]} />); });
      sum += countNodes(r!);
      act(() => r!.unmount());
    }
    r = undefined;
    // Every layer drew something (each repeats the Svg root and Defs).
    expect(sum).toBeGreaterThan(whole);
  });
});

describe('levelForPoints', () => {
  it('maps lifetime points to the highest level reached', () => {
    expect(levelForPoints(0)).toBe(0);
    expect(levelForPoints(99)).toBe(0);
    expect(levelForPoints(100)).toBe(1);
    expect(levelForPoints(1145)).toBe(3);
    expect(levelForPoints(12000)).toBe(8);
    expect(levelForPoints(99999)).toBe(8);
  });

  it('matches the server thresholds', () => {
    expect(ACHIEVEMENTS.map(a => a.threshold)).toEqual([100, 300, 750, 1500, 3000, 5000, 8000, 12000]);
  });
});

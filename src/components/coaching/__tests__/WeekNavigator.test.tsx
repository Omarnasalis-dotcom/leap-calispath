import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'light', theme: {} }) }));

import { WeekNavigator } from '../WarriorProgramSections';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const day = (...statuses: string[]): any => ({ blocks: statuses.map((completedStatus, i) => ({ id: i, completedStatus, exercises: [] })) });

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { mounted.splice(0).forEach(r => r.unmount()); }));
const week1 = (weeksData: any) => {
  let r!: ReactTestRenderer;
  act(() => { r = create(<WeekNavigator weeksData={weeksData} activeWeek={1} onSelectWeek={jest.fn()} />); });
  mounted.push(r);
  return texts(r.toJSON()).join('').split('WEEK').filter(Boolean)[0].trim();
};
const week2 = [day('none')];

it('every block completed: ✓', () => {
  expect(week1({ 1: [day('completed'), day('completed')], 2: week2 })).toBe('1 ✓');
});

it('a skipped block still counts: ✓ (owner, 2026-11-06)', () => {
  expect(week1({ 1: [day('missed', 'completed'), day('completed')], 2: week2 })).toBe('1 ✓');
});

it('every block skipped: ✓', () => {
  expect(week1({ 1: [day('missed')], 2: week2 })).toBe('1 ✓');
});

it('a block not logged yet: no ✓', () => {
  expect(week1({ 1: [day('completed'), day('completed', 'none')], 2: week2 })).toBe('1');
});

it('a week with no days: no ✓', () => {
  expect(week1({ 1: [], 2: week2 })).toBe('1');
});

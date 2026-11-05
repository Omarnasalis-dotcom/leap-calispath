import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { LogBlockSheet } from '../LogBlockSheet';

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { mounted.splice(0).forEach(r => r.unmount()); }));
const mount = (el: React.ReactElement) => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };

describe('LogBlockSheet: RPE per exercise', () => {
  const card = (id: string, name: string, askRpe: boolean) => ({ id, name, plan: 3, ticked: 0, repsLabel: '10 reps', weighted: false, hold: false, askRpe });
  const sheet = (cards: any[], extra: Record<string, unknown> = {}) => (
    <LogBlockSheet
      visible onClose={jest.fn()} blockName="Strength A" kind="sets" isRounds={false} status="completed" setStatus={jest.fn()}
      cards={cards} counts={{}} setCount={jest.fn()} touched={{}} topKg={{}} setTopKg={jest.fn()} holdSecs={{}} setHoldSecs={jest.fn()}
      amrap={{ rounds: 0, reps: 0, capLabel: null }} setAmrap={jest.fn()} forTime={{ min: 0, sec: 0, cap: false }} setForTime={jest.fn()}
      ladder={{ result: null }} feel={null} setFeel={jest.fn()} rpe={null} setRpe={jest.fn()} exerciseRpe={{}} setExerciseRpe={jest.fn()}
      reason={null} setReason={jest.fn()} note="" setNote={jest.fn()} noteOpen={false} setNoteOpen={jest.fn()}
      phase="form" error={null} onSubmit={jest.fn()} savedSummary="" {...extra}
    />
  );
  // Native views only: each button also appears once as its component.
  const fiveButtons = (r: ReactTestRenderer) =>
    r.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === 'RPE 5');
  const scales = (r: ReactTestRenderer) => fiveButtons(r).length;

  it('two exercises: one scale per exercise, no block scale', () => {
    const r = mount(sheet([card('a', 'Dips', true), card('b', 'Rows', true)]));
    expect(scales(r)).toBe(2);
  });

  it('one exercise, or a superset card: the single block scale', () => {
    expect(scales(mount(sheet([card('a', 'Dips', false)])))).toBe(1);
    expect(scales(mount(sheet([{ ...card('rounds', 'Dips · Rows', false) }], { isRounds: true })))).toBe(1);
  });

  it('rating goes to that exercise, and tapping it again clears it', () => {
    const setExerciseRpe = jest.fn();
    const r = mount(sheet([card('a', 'Dips', true), card('b', 'Rows', true)], { setExerciseRpe, exerciseRpe: { b: 5 } }));
    const press = (el: any) => {
      let n = el;
      while (typeof n.props.onPress !== 'function' && typeof n.props.onClick !== 'function') n = n.parent;
      act(() => (n.props.onPress ?? n.props.onClick)());
    };
    const fives = fiveButtons(r);
    press(fives[0]);
    expect(setExerciseRpe).toHaveBeenLastCalledWith('a', 5);
    press(fives[1]);
    expect(setExerciseRpe).toHaveBeenLastCalledWith('b', null);
  });

  it('an exercise marked not done has no scale', () => {
    const r = mount(sheet([card('a', 'Dips', true), card('b', 'Rows', true)], { counts: { b: 0 } }));
    expect(scales(r)).toBe(1);
  });
});

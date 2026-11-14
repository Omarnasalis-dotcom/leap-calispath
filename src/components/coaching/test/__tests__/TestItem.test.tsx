import React from 'react';
import { Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
const mockSound = { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() };
const mockFindDemo = jest.fn().mockResolvedValue('https://youtu.be/library');
jest.mock('../../../../services/TestItemService', () => ({
  TestItemService: { findDemoVideo: (...args: unknown[]) => mockFindDemo(...args) },
}));
jest.mock('../../../../lib/SoundService', () => ({
  get SoundServiceInstance() {
    return mockSound;
  },
}));

import { TestItemCard } from '../TestItemCard';
import { TestItemSheet } from '../TestItemSheet';
import type { TestItem, TestResult } from '../../../../lib/testItems';
import type { ProgramBlock } from '../../../../types/warriorProgram';

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { mounted.splice(0).forEach((r) => r.unmount()); }));
const mount = (el: React.ReactElement) => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
};

const block = (name: string, extra: Partial<ProgramBlock> = {}): ProgramBlock => ({
  id: 'b1',
  name,
  notes: 'Strict reps, full lockout.',
  exercises: [{ id: 'e1', name, youtube_url: 'https://youtu.be/abc', sets: 1, reps: '', rest_seconds: 0, notes: '' }],
  completedStatus: 'none',
  ...extra,
});

const result = (over: Partial<TestResult>): TestResult => ({
  id: 'r1',
  block_id: 'b1',
  week_number: 4,
  test_kind: 'max_reps',
  movement_id: 'pull_ups',
  item_name: 'Pull-ups',
  status: 'done',
  value: 18,
  unit: 'reps',
  skip_reason: null,
  skip_detail: null,
  world_status: 'saved',
  is_new_pb: true,
  coach_grade: null,
  coach_note: null,
  ...over,
});

const texts = (r: ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.type === 'string' && (n.type as string) === 'Text')
    .map((n) => [].concat(n.props.children).join(''))
    .join(' | ');

const press = (r: ReactTestRenderer, label: string) => {
  const hit = r.root.find(
    (n) => typeof n.type === 'string' && (n.type as string) === 'Text' && [].concat(n.props.children).join('') === label,
  );
  let n: any = hit;
  while (n && typeof n.props.onPress !== 'function') n = n.parent;
  act(() => { n.props.onPress(); });
};

const sheet = (item: TestItem, extra: Partial<React.ComponentProps<typeof TestItemSheet>> = {}) => (
  <TestItemSheet
    visible
    block={block('Pull-ups')}
    item={item}
    result={null}
    coach={{ name: 'Omar', whatsapp: '201001234567' }}
    weekNumber={4}
    onClose={jest.fn()}
    onSubmit={jest.fn().mockResolvedValue(undefined)}
    onClear={jest.fn().mockResolvedValue(undefined)}
    {...extra}
  />
);

describe('TestItemCard', () => {
  it('shows "not logged" before a result', () => {
    const r = mount(<TestItemCard block={block('Pull-ups')} index={0} item={{ kind: 'max_reps', movement: 'pull_ups' }} result={null} mode="dark" onOpen={jest.fn()} />);
    // The title already says PULL-UPS, so the line above doesn't repeat it.
    expect(texts(r)).toContain('TEST · MAX REPS · 1 MIN | PULL-UPS');
    expect(texts(r)).toContain('NOT LOGGED YET');
  });

  it('names a default-named block by its movement, once', () => {
    const r = mount(<TestItemCard block={block('Workout Routine', { exercises: [] })} index={0} item={{ kind: 'max_reps', movement: 'dips' }} result={null} mode="dark" onOpen={jest.fn()} />);
    expect(texts(r)).toContain('TEST · MAX REPS · 1 MIN | DIPS');
    expect(texts(r)).not.toContain('WORKOUT ROUTINE');
  });

  it('keeps the movement in the line when the coach named the block', () => {
    const r = mount(<TestItemCard block={block('Bar strength', { exercises: [] })} index={0} item={{ kind: 'one_rm', movement: 'squat' }} result={null} mode="dark" onOpen={jest.fn()} />);
    expect(texts(r)).toContain('TEST · 1RM · BACK SQUAT | BAR STRENGTH');
  });

  it('shows the value, the world and a PB', () => {
    const r = mount(<TestItemCard block={block('Pull-ups')} index={0} item={{ kind: 'max_reps', movement: 'pull_ups' }} result={result({})} mode="light" onOpen={jest.fn()} />);
    const all = texts(r);
    expect(all).toContain('18 REPS');
    expect(all).toContain('Counted in Endurance World');
    expect(all).toContain('NEW PB');
  });

  it('says a locked world kept the result for the coach', () => {
    const r = mount(
      <TestItemCard
        block={block('Back Squat')}
        index={1}
        item={{ kind: 'one_rm', movement: 'squat' }}
        result={result({ test_kind: 'one_rm', movement_id: 'squat', value: 100, unit: 'kg', world_status: 'locked', is_new_pb: false })}
        mode="dark"
        onOpen={jest.fn()}
      />,
    );
    expect(texts(r)).toContain('100 KG');
    expect(texts(r)).toContain('Power World is still locked · saved for your coach');
  });

  it('shows a skip reason and the coach grade', () => {
    const r = mount(
      <TestItemCard
        block={block('Wall Walk')}
        index={2}
        item={{ kind: 'form_check' }}
        result={result({ test_kind: 'form_check', status: 'skipped', value: null, unit: null, skip_reason: 'injury', world_status: 'none', is_new_pb: false, coach_grade: 'needs_work', coach_note: 'Rest the shoulder' })}
        mode="dark"
        onOpen={jest.fn()}
      />,
    );
    expect(texts(r)).toContain('SKIPPED · Injury / pain');
    expect(texts(r)).toContain('COACH: NEEDS WORK');
    expect(texts(r)).toContain('Coach: “Rest the shoulder”');
  });
});

describe('TestItemSheet', () => {
  it('without a coach exercise, offers the library demo of the movement', async () => {
    mockFindDemo.mockClear();
    const r = mount(sheet({ kind: 'max_reps', movement: 'dips' }, { block: block('Workout Routine', { exercises: [] }) }));
    await act(async () => {});
    expect(mockFindDemo).toHaveBeenCalledWith({ family: 'dip', variations: ['Parallel bar'] });
    expect(texts(r)).toContain('WATCH DEMO');
  });

  it('a hold looks up the demo of the picked progression', async () => {
    mockFindDemo.mockClear();
    const r = mount(sheet({ kind: 'max_hold', movement: 'front_lever' }, { block: block('Workout Routine', { exercises: [] }) }));
    await act(async () => {});
    expect(mockFindDemo).toHaveBeenLastCalledWith(expect.objectContaining({ family: 'front_lever', variations: ['Tuck', 'Advanced tuck'] }));
    await act(async () => { press(r, 'Full Front Lever'); });
    expect(mockFindDemo).toHaveBeenLastCalledWith({ family: 'front_lever', variations: ['Full'] });
  });

  it("uses the coach's exercise video without a library lookup", async () => {
    mockFindDemo.mockClear();
    const r = mount(sheet({ kind: 'max_reps', movement: 'dips' }));
    await act(async () => {});
    expect(mockFindDemo).not.toHaveBeenCalled();
    expect(texts(r)).toContain('WATCH DEMO');
  });

  it('counts 5 get-ready seconds before the minute starts, then buzzes at the end', () => {
    jest.useFakeTimers();
    try {
      const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }));
      press(r, 'START 60 S');
      expect(texts(r)).toContain('GET READY');
      expect(texts(r)).toContain('5');
      const second = () => act(() => { jest.advanceTimersByTime(1000); });
      second(); second();
      expect(texts(r)).toContain('3');
      second(); second(); second();
      expect(texts(r)).not.toContain('GET READY');
      expect(mockSound.playBoxingBell).toHaveBeenCalled();
      expect(mockSound.playTick.mock.calls.length).toBeGreaterThanOrEqual(5);
      act(() => { jest.advanceTimersByTime(30000); });
      expect(texts(r)).toMatch(/0:(29|30)/);
      act(() => { jest.advanceTimersByTime(31000); });
      expect(texts(r)).toContain('TIME!');
      expect(mockSound.playDigitalBuzzer).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('hold: get-ready first, then the stopwatch fills the seconds', () => {
    jest.useFakeTimers();
    try {
      const r = mount(sheet({ kind: 'max_hold', movement: 'front_lever' }));
      press(r, 'START');
      expect(texts(r)).toContain('GET READY');
      act(() => { jest.advanceTimersByTime(5000 + 12400); });
      press(r, 'STOP');
      const input = r.root.find((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput');
      expect(input.props.value).toBe('12');
      // Adjust after stopping.
      press(r, '+1');
      press(r, '+1');
      press(r, '−1');
      expect(r.root.find((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput').props.value).toBe('13');
    } finally {
      jest.useRealTimers();
    }
  });

  it('max reps: refuses an empty result, then sends whole reps', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, { onSubmit }));
    expect(texts(r)).toContain('REPS IN 1 MINUTE');
    expect(texts(r)).toContain('1:00');
    press(r, 'SAVE RESULT');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(texts(r)).toContain('Enter your result first.');
    const input = r.root.find((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput');
    act(() => { input.props.onChangeText('21'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 21, movementId: null });
  });

  it('1RM: labels bar weight for the squat and added weight for the pull-up', () => {
    expect(texts(mount(sheet({ kind: 'one_rm', movement: 'squat' })))).toContain('BAR WEIGHT (KG)');
    expect(texts(mount(sheet({ kind: 'one_rm', movement: 'pull_up' })))).toContain('ADDED WEIGHT (KG)');
  });

  it('max hold: sends the picked progression', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'max_hold', movement: 'front_lever' }, { onSubmit }));
    press(r, 'Straddle Front Lever');
    const input = r.root.find((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput');
    act(() => { input.props.onChangeText('9'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 9, movementId: 'straddle_front_lever' });
  });

  it('form check: opens WhatsApp to the coach, and "I sent it" saves', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'form_check' }, { onSubmit }));
    press(r, 'SEND VIDEO ON WHATSAPP');
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/201001234567?text='));
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('Hi Omar, here is my Pull-ups form check for the Week 4 test.');
    await act(async () => { press(r, 'I SENT IT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done' });
    open.mockRestore();
  });

  it('form check without a coach number explains what to do', () => {
    const r = mount(sheet({ kind: 'form_check' }, { coach: { name: 'Omar', whatsapp: null } }));
    expect(texts(r)).not.toContain('SEND VIDEO ON WHATSAPP');
    expect(texts(r)).toContain("Your coach hasn't added a WhatsApp number yet.");
  });

  it('skip: needs a reason, then sends it with the note', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'one_rm', movement: 'muscle_up' }, { onSubmit }));
    press(r, "CAN'T DO IT? SKIP");
    expect(texts(r)).toContain('PICK A REASON');
    press(r, "Can't do it yet");
    const note = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput').pop()!;
    act(() => { note.props.onChangeText('No muscle-up yet'); });
    await act(async () => { press(r, 'SAVE SKIP'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'skipped', skipReason: 'cant_do', skipDetail: 'No muscle-up yet' });
  });

  it('shows the server error in the sheet', async () => {
    const onSubmit = jest.fn().mockRejectedValue({ message: 'VALUE_TOO_HIGH' });
    const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, { onSubmit }));
    const input = r.root.find((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput');
    act(() => { input.props.onChangeText('99'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(texts(r)).toContain('That number is above the limit for this movement.');
  });
});

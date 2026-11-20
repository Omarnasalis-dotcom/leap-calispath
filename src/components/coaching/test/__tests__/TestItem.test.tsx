import React, { useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
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
const mockSchedule = jest.fn().mockResolvedValue('alert-id');
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
const mockKeepAwake = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: (...a: unknown[]) => mockKeepAwake(...a),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));

let appStateListeners: ((s: string) => void)[] = [];
let appState = 'active';
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
  appStateListeners.push(cb);
  return { remove: () => { appStateListeners = appStateListeners.filter((l) => l !== cb); } };
}) as never);
Object.defineProperty(AppState, 'currentState', { get: () => appState, configurable: true });
const setAppState = async (next: string) => {
  appState = next;
  await act(async () => { appStateListeners.forEach((l) => l(next)); });
};

import { TestItemCard } from '../TestItemCard';
import { TestItemSheet } from '../TestItemSheet';
import { useTestItemTimer } from '../../../../hooks/useTestItemTimer';
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

type SheetProps = Partial<React.ComponentProps<typeof TestItemSheet>>;

// Like WarriorProgramScreen: the runner owns the timer, the sheet and the
// card come and go. `hideSheet` stands in for closing the sheet.
let hideSheet: () => void = () => {};
let showSheet: () => void = () => {};
function Runner({ item, extra, onMinuteUp }: { item: TestItem; extra: SheetProps; onMinuteUp?: (id: string) => void }) {
  const timer = useTestItemTimer(onMinuteUp ?? (() => {}));
  const [open, setOpen] = useState(true);
  hideSheet = () => setOpen(false);
  showSheet = () => setOpen(true);
  const b = (extra.block as ProgramBlock) ?? block('Pull-ups');
  return (
    <>
      <TestItemCard block={b} index={0} item={item} result={null} mode="dark" onOpen={jest.fn()} timer={timer.timer?.blockId === String(b.id) ? timer.timer : null} />
      {open && (
        <TestItemSheet
          visible
          block={b}
          item={item}
          result={null}
          coach={{ name: 'Omar', whatsapp: '201001234567' }}
          weekNumber={4}
          onClose={jest.fn()}
          onSubmit={jest.fn().mockResolvedValue(undefined)}
          onClear={jest.fn().mockResolvedValue(undefined)}
          timer={timer}
          strengthTier={0}
          {...extra}
        />
      )}
    </>
  );
}
const sheet = (item: TestItem, extra: SheetProps = {}, onMinuteUp?: (id: string) => void) => (
  <Runner item={item} extra={extra} onMinuteUp={onMinuteUp} />
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
    expect(texts(r)).toContain('Saved for your coach');
    expect(texts(r)).not.toMatch(/locked/i);
  });

  it('shows MATCHED PB for a tie, and NEW PB wins over it', () => {
    const tie = mount(<TestItemCard block={block('Pull-ups')} index={0} item={{ kind: 'max_reps', movement: 'pull_ups' }} result={result({ is_new_pb: false, is_matched_pb: true })} mode="light" onOpen={jest.fn()} />);
    expect(texts(tie)).toContain('MATCHED PB');
    expect(texts(tie)).not.toContain('NEW PB');
    const both = mount(<TestItemCard block={block('Pull-ups')} index={0} item={{ kind: 'max_reps', movement: 'pull_ups' }} result={result({ is_new_pb: true, is_matched_pb: true })} mode="light" onOpen={jest.fn()} />);
    expect(texts(both)).toContain('NEW PB');
    expect(texts(both)).not.toContain('MATCHED PB');
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
      const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
      expect(input.props.value).toBe('12');
      // Adjust after stopping.
      press(r, '+1');
      press(r, '+1');
      press(r, '−1');
      expect(r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0].props.value).toBe('13');
    } finally {
      jest.useRealTimers();
    }
  });

  it('the minute keeps running when the sheet is closed, on the card, and comes back in the sheet', () => {
    jest.useFakeTimers();
    try {
      const onMinuteUp = jest.fn();
      const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, {}, onMinuteUp));
      press(r, 'START 60 S');
      act(() => { jest.advanceTimersByTime(5000 + 10000); });
      act(() => { hideSheet(); });
      expect(texts(r)).not.toContain('REPS IN 1 MINUTE');
      act(() => { jest.advanceTimersByTime(8000); });
      // Closed sheet: the card counts down by itself.
      expect(texts(r)).toMatch(/0:(42|43) LEFT/);
      act(() => { showSheet(); });
      act(() => { jest.advanceTimersByTime(300); });
      expect(texts(r)).toMatch(/0:(41|42)/);
      act(() => { hideSheet(); });
      act(() => { jest.advanceTimersByTime(43000); });
      expect(onMinuteUp).toHaveBeenCalledWith('b1');
      expect(mockSound.playDigitalBuzzer).toHaveBeenCalled();
      expect(texts(r)).toContain('TIME! TAP TO LOG YOUR REPS');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the screen on while it runs, and says when the minute is up if the app is left', async () => {
    jest.useFakeTimers();
    try {
      mockSchedule.mockClear();
      mockKeepAwake.mockClear();
      const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }));
      press(r, 'START 60 S');
      expect(mockKeepAwake).toHaveBeenCalledWith('test-item-timer');
      act(() => { jest.advanceTimersByTime(20000); });
      await setAppState('background');
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      const alert = mockSchedule.mock.calls[0][0];
      expect(alert.content.title).toBe("Minute's up");
      expect(alert.trigger.seconds).toBe(45);
      // Back after the minute ended (timeouts asleep meanwhile): it ends at once.
      jest.setSystemTime(Date.now() + 60000);
      await setAppState('active');
      expect(texts(r)).toContain('TIME!');
    } finally {
      appState = 'active';
      jest.useRealTimers();
    }
  });

  it('a hold stopwatch keeps counting while the sheet is closed', () => {
    jest.useFakeTimers();
    try {
      const r = mount(sheet({ kind: 'max_hold', movement: 'front_lever' }));
      press(r, 'START');
      act(() => { jest.advanceTimersByTime(5000 + 4000); });
      act(() => { hideSheet(); });
      act(() => { jest.advanceTimersByTime(6000); });
      expect(texts(r)).toContain('HOLDING · 10 S');
      act(() => { showSheet(); });
      press(r, 'STOP');
      const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
      expect(input.props.value).toBe('10');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a hold with no category lists every progression in wrapping rows', () => {
    const r = mount(sheet({ kind: 'max_hold' }));
    const row = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'View' && [].concat(n.props.style).some((x: any) => x?.flexWrap === 'wrap'));
    expect(row.length).toBeGreaterThan(0);
    expect(texts(r)).toContain('Full Planche');
  });

  it('max reps: refuses an empty result, then sends whole reps', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, { onSubmit }));
    expect(texts(r)).toContain('REPS IN 1 MINUTE');
    expect(texts(r)).toContain('1:00');
    press(r, 'SAVE RESULT');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(texts(r)).toContain('Enter your result first.');
    const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
    act(() => { input.props.onChangeText('21'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 21, movementId: null, note: null });
  });

  it("sends the athlete's note with the result, trimmed", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, { onSubmit }));
    const inputs = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput');
    expect(inputs).toHaveLength(2);
    expect(inputs[1].props.placeholder).toBe('A note for your coach (optional)');
    act(() => { inputs[0].props.onChangeText('14'); });
    act(() => { inputs[1].props.onChangeText('  felt grip go at the end  '); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 14, movementId: null, note: 'felt grip go at the end' });
  });

  it('asks before a result goes into its world, and only saves on Save', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      // Pull-ups are a MAIN movement: Endurance World from Strength tier 3.
      const r = mount(sheet({ kind: 'max_reps', movement: 'pull_ups' }, { onSubmit, strengthTier: 3 }));
      const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
      act(() => { input.props.onChangeText('45'); });
      press(r, 'SAVE RESULT');
      expect(onSubmit).not.toHaveBeenCalled();
      const [title, body, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
      expect(title).toBe('Save to Endurance World?');
      expect(body).toBe("45 REPS also goes to Endurance World. Clearing this test later won't remove it from there.");
      expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Save']);
      await act(async () => { buttons[1].onPress!(); });
      expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 45, movementId: null, note: null });
    } finally {
      alert.mockRestore();
    }
  });

  it('saves straight away when the result has no world to go to', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const r = mount(sheet({ kind: 'one_rm', movement: 'deadlift' }, { onSubmit, strengthTier: 9 }));
      const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
      act(() => { input.props.onChangeText('180'); });
      await act(async () => { press(r, 'SAVE RESULT'); });
      expect(alert).not.toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 180, movementId: null, note: null });
    } finally {
      alert.mockRestore();
    }
  });

  it('1RM: labels bar weight for the squat and added weight for the pull-up', () => {
    expect(texts(mount(sheet({ kind: 'one_rm', movement: 'squat' })))).toContain('BAR WEIGHT (KG)');
    expect(texts(mount(sheet({ kind: 'one_rm', movement: 'pull_up' })))).toContain('ADDED WEIGHT (KG)');
  });

  it('max hold: sends the picked progression', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'max_hold', movement: 'front_lever' }, { onSubmit }));
    press(r, 'Straddle Front Lever');
    const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
    act(() => { input.props.onChangeText('9'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', value: 9, movementId: 'straddle_front_lever', note: null });
  });

  it('form check: opens WhatsApp to the coach, and "I sent it" saves', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const r = mount(sheet({ kind: 'form_check' }, { onSubmit }));
    press(r, 'SEND VIDEO ON WHATSAPP');
    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/201001234567?text='));
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('Hi Omar, here is my Pull-ups form check for the Week 4 test.');
    await act(async () => { press(r, 'I SENT IT'); });
    expect(onSubmit).toHaveBeenCalledWith({ status: 'done', note: null });
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
    const input = r.root.findAll((n) => typeof n.type === 'string' && (n.type as string) === 'TextInput')[0];
    act(() => { input.props.onChangeText('99'); });
    await act(async () => { press(r, 'SAVE RESULT'); });
    expect(texts(r)).toContain('That number is above the limit for this movement.');
  });
});

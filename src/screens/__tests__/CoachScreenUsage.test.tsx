import React from 'react';
import { Alert, AppState, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CoachScreen } from '../CoachScreen';
import { t } from '../../i18n';
import { FunctionsHttpError } from '@supabase/functions-js';

// What matters here is what this feature must never do: change what reaches
// the AI Coach, or stop a message the server would allow.
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'is', 'in']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({ data: null, error: null });
      q.then = (ok: (v: unknown) => void) => ok({ data: [], error: null });
      return q;
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
  },
}));
jest.mock('@supabase/functions-js', () => {
  class FunctionsHttpError extends Error {
    context: unknown;
    constructor(context: unknown) { super('http'); this.context = context; }
  }
  return { FunctionsHttpError };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() } }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-purchases-ui', () => ({ __esModule: true, default: {} }));
jest.mock('../../components/GlobalErrorBoundary', () => ({ GlobalErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../components/LeapLogo', () => ({ LeapLogo: 'LeapLogo' }));
const mockProfile = {
  id: 'u1',
  subscription_tier: 'pro',
  access_expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
  coach_goal: 'strength',
  coach_setup_completed_at: '2026-01-01',
  onboarding_completed_at: '2026-01-01',
};
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile, refreshProfile: async () => {}, paywallEnabled: true }),
}));
jest.mock('../../lib/coachSetup', () => ({ ...jest.requireActual('../../lib/coachSetup'), needsCoachSetup: () => false }));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark',
    theme: { accent: '#FF5252', accentText: '#FF5252', text: { primary: '#fff', secondary: '#aaa' }, card: { background: '#000', border: '#222' } },
  }),
}));

const usageAnswer = (over: Record<string, unknown> = {}) => ({
  data: { tier: 'pro', window: 'day', messages_left: 7, messages_limit: 10, resets_at: null, budget_left_pct: 72, budget_until: null, ...over },
  error: null,
});
const REPLY = { reply: 'Great session.', recommendations: [], programAction: null, blocks: [], suggestedReplies: [] };

let tree: ReactTestRenderer | undefined;
let alertSpy: jest.SpyInstance;
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
// What's on screen: the ring's screen-reader label holds the details too.
const texts = () => JSON.stringify(tree!.toJSON(), (key, value) => (key === 'accessibilityLabel' ? undefined : value));
const open = async () => {
  await act(async () => { tree = create(<CoachScreen onBack={() => {}} />); });
  await flush();
};
const send = async (text: string) => {
  const input = tree!.root.findAllByType(TextInput).find(n => n.props.onChangeText)!;
  await act(async () => { input.props.onChangeText(text); });
  const button = tree!.root.findAllByType(TouchableOpacity).find(n => n.props.accessibilityLabel === t('coach.send'))!;
  await act(async () => { button.props.onPress(); });
  await flush();
};
const inputEditable = () => tree!.root.findAllByType(TextInput).find(n => n.props.onChangeText)!.props.editable;

beforeEach(() => {
  mockRpc.mockReset();
  mockInvoke.mockReset();
  mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usageAnswer() : { data: null, error: null }));
  mockInvoke.mockResolvedValue({ data: REPLY, error: null });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  alertSpy.mockRestore();
});

describe('AI Coach usage line', () => {
  const ring = () => tree!.root.findAll(n => n.props.accessibilityState?.expanded !== undefined && !!n.props.onPress)[0];
  const tapRing = async () => {
    await act(async () => { ring().props.onPress(); });
    await flush();
  };

  it('shows only the ring with room left: no text until tapped', async () => {
    await open();
    expect(ring().props.accessibilityLabel).toContain('7 of 10 left today');
    expect(texts()).toContain('Usage');
    expect(texts()).not.toContain('left today');
    expect(texts()).not.toContain('Budget');
  });

  it('shows the details on tap, and hides them on the next tap', async () => {
    await open();
    await tapRing();
    expect(texts()).toContain('7 of 10 left today');
    expect(texts()).toContain('Budget 72%');
    await tapRing();
    expect(texts()).not.toContain('Budget 72%');
  });

  it('hides the details by itself', async () => {
    await open();
    jest.useFakeTimers();
    await act(async () => { ring().props.onPress(); });
    expect(texts()).toContain('Budget 72%');
    await act(async () => { jest.advanceTimersByTime(7900); });
    expect(texts()).toContain('Budget 72%');
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(texts()).not.toContain('Budget 72%');
    jest.useRealTimers();
  });

  it('warns by itself only when close to a limit', async () => {
    mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usageAnswer({ messages_left: 3 }) : { data: null, error: null }));
    await open();
    expect(texts()).toContain('Messages left today: 3');
    expect(texts()).not.toContain('Budget left');
  });

  it('warns about the budget at 25%', async () => {
    mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usageAnswer({ budget_left_pct: 25 }) : { data: null, error: null }));
    await open();
    expect(texts()).toContain('Budget left: 25%');
  });

  it('sends the AI Coach exactly what it sent before: no usage anywhere', async () => {
    await open();
    await send('Plan my week');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [name, { body }] = mockInvoke.mock.calls[0];
    expect(name).toBe('ai-coach');
    expect(Object.keys(body).sort()).toEqual(['client_request_id', 'messages', 'platform']);
    expect(body.messages).toEqual([{ role: 'user', content: 'Plan my week' }]);
    expect(JSON.stringify(body)).not.toMatch(/Budget|left today|budget_left|messages_left/);
    expect(texts()).toContain('Great session.');
  });

  it('refreshes after the reply, not during it', async () => {
    await open();
    const before = mockRpc.mock.calls.filter(c => c[0] === 'get_ai_coach_usage').length;
    mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usageAnswer({ messages_left: 6 }) : { data: null, error: null }));
    let finish: (v: unknown) => void = () => {};
    mockInvoke.mockReturnValue(new Promise(r => { finish = r; }));
    await send('Hello');
    expect(mockRpc.mock.calls.filter(c => c[0] === 'get_ai_coach_usage').length).toBe(before);
    await act(async () => { finish({ data: REPLY, error: null }); });
    await flush();
    expect(mockRpc.mock.calls.filter(c => c[0] === 'get_ai_coach_usage').length).toBe(before + 1);
    expect(ring().props.accessibilityLabel).toContain('6 of 10 left today');
  });

  it('shows Thinking with a counter while waiting, not Leaping, and clears on reply', async () => {
    await open();
    let finish: (v: unknown) => void = () => {};
    mockInvoke.mockReturnValue(new Promise(r => { finish = r; }));
    await send('Hello');
    expect(texts()).toContain('THINKING');
    expect(texts()).toContain('0s');
    expect(texts()).not.toContain('LEAPING');
    await act(async () => { finish({ data: REPLY, error: null }); });
    await flush();
    expect(texts()).not.toContain('THINKING');
    expect(texts()).toContain('Great session.');
  });

  it('still sends when the numbers say blocked: only the server refuses', async () => {
    mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usageAnswer({ messages_left: 0 }) : { data: null, error: null }));
    await open();
    await send('Hello');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('Great session.');
  });

  it('still chats normally when the numbers fail to load', async () => {
    mockRpc.mockImplementation(async () => { throw new Error('offline'); });
    await open();
    expect(tree!.root.findAll(n => n.props.accessibilityState?.expanded !== undefined).length).toBe(0);
    await send('Hello');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('Great session.');
  });

  it('a refusal holds even if the numbers still say otherwise', async () => {
    await open();
    const { FunctionsHttpError } = jest.requireMock('@supabase/functions-js');
    mockInvoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({ status: 429, json: async () => ({ error: 'RATE_LIMIT', message: 'RATE_LIMIT:DAILY: x' }) }),
    });
    await send('Hello');
    expect(inputEditable()).toBe(false);
  });

  it('stays locked after a refusal, then opens again once the numbers reset', async () => {
    const listeners = new Set<(s: string) => void>();
    (AppState.addEventListener as jest.Mock).mockImplementation((_: string, cb: (s: string) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    });
    let usage = usageAnswer({ messages_left: 1 });
    mockRpc.mockImplementation(async (name: string) => (name === 'get_ai_coach_usage' ? usage : { data: null, error: null }));
    await open();
    usage = usageAnswer({ messages_left: 0 });
    const { FunctionsHttpError } = jest.requireMock('@supabase/functions-js');
    mockInvoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({ status: 429, json: async () => ({ error: 'RATE_LIMIT', message: 'RATE_LIMIT:DAILY: x' }) }),
    });
    await send('Hello');
    expect(texts()).toContain('Daily sessions exhausted');
    expect(texts()).not.toContain('Messages left today');
    expect(inputEditable()).toBe(false);

    usage = usageAnswer({ messages_left: 10 });
    await act(async () => { listeners.forEach(cb => cb('active')); });
    await flush();
    expect(inputEditable()).toBe(true);
    expect(ring().props.accessibilityLabel).toContain('10 of 10 left today');
  });
});

describe('AI Coach day card while the coach is working', () => {
  let clock: jest.SpyInstance;
  const card = (dayName: string, reason: string) => ({
    type: 'add_day',
    reason,
    dayNumber: 2,
    displayDayNumber: 2,
    totalDays: 3,
    payload: { dayName, blocks: [] },
    weekNumber: 1,
    warriorProgramId: 'w1',
    replacing: false,
    preview: null,
  });
  const showCard = async () => {
    mockInvoke.mockResolvedValueOnce({ data: { ...REPLY, reply: 'Day 2 is ready.', programAction: card('PUSH DAY', 'First version') }, error: null });
    await open();
    await send('Build day 2');
    expect(texts()).toContain(t('coach.changeDay'));
  };
  const sendAndHold = async (text: string) => {
    let finish: (v: unknown) => void = () => {};
    let fail: (e: unknown) => void = () => {};
    mockInvoke.mockReturnValue(new Promise((ok, no) => { finish = ok; fail = no; }));
    // Past the screen's 5-second slow-down guard.
    const later = Date.now() + 6000;
    clock = jest.spyOn(Date, 'now').mockReturnValue(later);
    await send(text);
    clock.mockRestore();
    return { finish, fail };
  };

  it('hides the card so the new message and loading show, then brings it back', async () => {
    await showCard();
    const { finish } = await sendAndHold('Why this exercise?');
    expect(texts()).toContain('Why this exercise?');
    expect(texts()).not.toContain(t('coach.changeDay'));
    await act(async () => { finish({ data: { ...REPLY, reply: 'It builds pressing strength.' }, error: null }); });
    await flush();
    expect(texts()).toContain('It builds pressing strength.');
    expect(texts()).toContain(t('coach.changeDay'));
    expect(texts()).toContain('First version');
  });

  it('shows the new card when the reply brings one', async () => {
    await showCard();
    const { finish } = await sendAndHold('Swap the push-ups');
    await act(async () => { finish({ data: { ...REPLY, reply: 'Updated.', programAction: card('PUSH DAY', 'Second version') }, error: null }); });
    await flush();
    expect(texts()).toContain('Second version');
    expect(texts()).not.toContain('First version');
  });

  it('brings the card back straight away after a server error', async () => {
    await showCard();
    const { finish } = await sendAndHold('Swap the push-ups');
    expect(texts()).not.toContain(t('coach.changeDay'));
    const error = new FunctionsHttpError({ status: 500, json: async () => ({}) } as unknown as Response);
    await act(async () => { finish({ data: null, error }); });
    await flush();
    expect(texts()).toContain(t('coach.errReach'));
    expect(texts()).toContain(t('coach.changeDay'));
    expect(texts()).toContain('First version');
  });

  it('brings the card back when the signal is lost and no answer can be collected', async () => {
    await showCard();
    const { fail } = await sendAndHold('Swap the push-ups');
    jest.useFakeTimers();
    await act(async () => { fail(new Error('Network request failed')); });
    for (let i = 0; i < 8; i++) {
      await act(async () => { jest.advanceTimersByTime(3000); });
      await flush();
    }
    jest.useRealTimers();
    await flush();
    expect(texts()).toContain(t('coach.errReach'));
    expect(texts()).toContain(t('coach.changeDay'));
    expect(texts()).toContain('First version');
  });
});

describe('AI Coach after a day card is added', () => {
  const storage = jest.requireMock('@react-native-async-storage/async-storage').default;
  const realStorage = { ...storage };
  let saved: Record<string, string>;
  let clock: jest.SpyInstance | undefined;

  const dayCard = (type: string, dayNumber: number, totalDays: number, over: Record<string, unknown> = {}) => ({
    type,
    reason: 'Ready',
    dayNumber,
    displayDayNumber: dayNumber,
    totalDays,
    payload: { name: 'Muscle Plan', dayName: `DAY ${dayNumber}`, blocks: [{}] },
    weekNumber: 1,
    warriorProgramId: 'w1',
    replacing: false,
    preview: null,
    ...over,
  });
  const reply = (programAction: unknown) => ({ data: { ...REPLY, reply: 'Card ready.', programAction }, error: null });
  const press = async (label: string) => {
    const button = tree!.root.findAllByType(TouchableOpacity).find(n => n.findAllByType(Text).some(x => x.props.children === label));
    if (!button) throw new Error(`no button: ${label}`);
    await act(async () => { button.props.onPress(); });
    await flush();
  };
  const pastSlowDown = () => {
    const later = Date.now() + 6000;
    clock?.mockRestore();
    clock = jest.spyOn(Date, 'now').mockReturnValue(later);
  };
  const getCard = async (action: unknown) => {
    mockInvoke.mockResolvedValueOnce(reply(action));
    await send('Build it');
  };
  const addButton = (n: number) => t('coach.dayButton', { verb: t('coach.add').toUpperCase(), n });

  beforeEach(() => {
    saved = {};
    storage.getItem = async (k: string) => saved[k] ?? null;
    storage.setItem = async (k: string, v: string) => { saved[k] = v; };
    storage.removeItem = async (k: string) => { delete saved[k]; };
  });
  afterEach(() => {
    Object.assign(storage, realStorage);
    clock?.mockRestore();
    clock = undefined;
  });

  it('offers the next day after adding a day, and sends it as a normal message', async () => {
    await open();
    await getCard(dayCard('create', 1, 3));
    expect(texts()).not.toContain('Build Day 2');
    await press(addButton(1));
    expect(mockRpc).toHaveBeenCalledWith('ai_coach_create_program', expect.anything());
    expect(texts()).toContain('Build Day 2');
    const sentBefore = mockInvoke.mock.calls.length;
    pastSlowDown();
    mockInvoke.mockResolvedValueOnce({ data: REPLY, error: null });
    await press('Build Day 2');
    expect(mockInvoke.mock.calls.length).toBe(sentBefore + 1);
    expect(mockInvoke.mock.calls.at(-1)![1].body.messages.at(-1)).toEqual({ role: 'user', content: 'Build Day 2' });
    expect(texts()).not.toContain('Build Day 2</');
    expect(saved['coach_next_day_v1_u1']).toBeUndefined();
  });

  it('adds nothing to the chat history, so the coach never reads it', async () => {
    await open();
    await getCard(dayCard('create', 1, 3));
    await press(addButton(1));
    expect(JSON.stringify(mockInvoke.mock.calls)).not.toContain('Build Day');
    expect(saved['coach_chat_v1_u1'] ?? '').not.toContain('Build Day');
  });

  it('keeps the next-day button after leaving the chat', async () => {
    await open();
    await getCard(dayCard('create', 1, 3));
    await press(addButton(1));
    act(() => tree?.unmount());
    await open();
    expect(texts()).toContain('Build Day 2');
  });

  it('shows the start card with the name when the chat stayed open', async () => {
    await open();
    await getCard(dayCard('create', 1, 2));
    await press(addButton(1));
    pastSlowDown();
    await getCard(dayCard('add_day', 2, 2));
    await press(addButton(2));
    expect(texts()).toContain('Muscle Plan');
    expect(texts()).toContain(' is ready');
    expect(texts()).toContain(t('coach.goToProgram'));
    expect(texts()).not.toContain('Build Day 3');
  });

  it('still shows the start card when the chat was closed between days', async () => {
    await open();
    await getCard(dayCard('create', 1, 2));
    await press(addButton(1));
    act(() => tree?.unmount());
    await open();
    pastSlowDown();
    await getCard(dayCard('add_day', 2, 2));
    await press(addButton(2));
    expect(texts()).toContain(t('coach.programReady'));
    expect(texts()).toContain(t('coach.goToProgram'));
    expect(texts()).not.toContain('undefined');
    expect(texts()).not.toContain('"null"');
  });

  it('shows no start card after redoing a day that was already added', async () => {
    await open();
    await getCard(dayCard('add_day', 2, 2, { replacing: true }));
    await press(t('coach.dayButton', { verb: t('coach.redo').toUpperCase(), n: 2 }));
    expect(mockRpc).toHaveBeenCalledWith('ai_coach_replace_day_in_week', expect.anything());
    expect(texts()).not.toContain(t('coach.goToProgram'));
    expect(texts()).not.toContain('Build Day');
  });

  it('shows no next-day button or start card after ending a program', async () => {
    await open();
    await getCard({ type: 'end', reason: 'Done', warriorProgramId: 'w1' });
    await press(t('coach.endProgram'));
    expect(texts()).not.toContain('Build Day');
    expect(texts()).not.toContain(t('coach.goToProgram'));
  });

  it('clears the next-day button when the chat is reset', async () => {
    await open();
    await getCard(dayCard('create', 1, 3));
    await press(addButton(1));
    expect(saved['coach_next_day_v1_u1']).toBe('2');
    alertSpy.mockImplementation((_t, _m, buttons) => { buttons?.find((b: { style?: string }) => b.style === 'destructive')?.onPress?.(); });
    const trash = tree!.root.findAllByType(TouchableOpacity).find(n => n.props.accessibilityLabel === t('coach.clearChat'))!;
    await act(async () => { trash.props.onPress(); });
    await flush();
    expect(saved['coach_next_day_v1_u1']).toBeUndefined();
    expect(texts()).not.toContain('Build Day 2');
  });
});

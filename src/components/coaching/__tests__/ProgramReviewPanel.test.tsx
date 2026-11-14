import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ProgramReviewPanel } from '../ProgramReviewPanel';
import { ProgramReview } from '../../../lib/programReview';

const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockPush = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a) },
    useFocusEffect: (cb: () => void) => R.useEffect(() => { cb(); }, [cb]),
  };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: { accent: '#f00', accentText: '#f00', text: { primary: '#000', secondary: '#555' }, card: { background: '#fff', border: '#ddd' } } }),
}));

const review = (over: Partial<ProgramReview> = {}): ProgramReview => ({
  id: 'r1', week_number: 1, status: 'closed', outcome: 'changed', message: null,
  requested_at: '2026-11-06', closed_at: '2026-11-07', seen_at: null, reverted_at: null,
  revert_skipped: null, can_revert: true,
  changes: [{
    block_name: 'Pull', exercise_before: 'Pull Ups', exercise_after: 'Pull Ups',
    before: { sets: 5, reps: 8 }, after: { sets: 4, reps: 6 }, reason: 'too_hard',
  }],
  ...over,
});

let reviews: ProgramReview[] = [];
let tree: ReactTestRenderer | undefined;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const words = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(5).filter(c => typeof c === 'string').join('')).join(' | ');
const press = async (label: string) => {
  const btn = tree!.root.findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(n => [n.props.children].flat(5).join('').includes(label)));
  if (!btn) throw new Error(`no button "${label}" in: ${words()}`);
  await act(async () => { btn!.props.onPress(); });
  await flush();
};
const open = async (props: Partial<React.ComponentProps<typeof ProgramReviewPanel>> = {}) => {
  await act(async () => {
    tree = create(<ProgramReviewPanel warriorProgramId="wp" week={1} weekDone={false} onReverted={() => {}} {...props} />);
  });
  await flush();
};

beforeEach(() => {
  reviews = [];
  mockPush.mockReset();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: null, error: null });
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_my_program_reviews') return { data: reviews, error: null };
    if (name === 'request_program_review') { reviews = [review({ status: 'open', outcome: null, changes: [] })]; return { data: 'r1', error: null }; }
    if (name === 'revert_program_review') { reviews = [review({ reverted_at: '2026-11-08', seen_at: '2026-11-08', can_revert: false })]; return { data: { reverted: 1, skipped: 0 }, error: null }; }
    return { data: null, error: null };
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

describe('ProgramReviewPanel', () => {
  it('offers the review on an unreviewed week', async () => {
    await open();
    expect(words()).toContain('Ask the Leap team to review this week');
  });

  it('shows nothing when the reviews cannot load', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    await open();
    expect(tree!.toJSON()).toBeNull();
  });

  it('offers nothing on a finished week', async () => {
    await open({ weekDone: true });
    expect(tree!.toJSON()).toBeNull();
  });

  it('offers nothing while another week is in review', async () => {
    reviews = [review({ week_number: 2, status: 'open', outcome: null })];
    await open();
    expect(tree!.toJSON()).toBeNull();
  });

  it('needs a rating, then sends it with the optional note and alerts the team', async () => {
    await open();
    await press('Ask the Leap team');
    expect(words()).toContain('usually within 48 hours');
    const send = () => tree!.root.findAllByType(TouchableOpacity).find(b => b.props.accessibilityState?.disabled !== undefined)!;
    expect(send().props.disabled).toBe(true);
    const star = tree!.root.findAll(n => n.props.accessibilityLabel === '4 out of 5' && !!n.props.onPress)[0];
    await act(async () => { star.props.onPress(); });
    await act(async () => { tree!.root.findByType(TextInput).props.onChangeText('  too hard  '); });
    await act(async () => { send().props.onPress(); });
    await flush();
    expect(mockRpc).toHaveBeenCalledWith('request_program_review', { p_warrior_program_id: 'wp', p_week_number: 1, p_satisfaction: 4, p_note: 'too hard' });
    expect(mockInvoke).toHaveBeenCalledWith('notify-program-review', { body: { review_id: 'r1' } });
    expect(words()).toContain('In review with the Leap team, usually within 48 hours.');
  });

  it('shows the server refusal in the sheet', async () => {
    mockRpc.mockImplementation(async (name: string) => (
      name === 'get_my_program_reviews' ? { data: [], error: null } : { data: null, error: { message: 'REVIEW_LIMIT' } }
    ));
    await open();
    await press('Ask the Leap team');
    const star = tree!.root.findAll(n => n.props.accessibilityLabel === '5 out of 5' && !!n.props.onPress)[0];
    await act(async () => { star.props.onPress(); });
    const send = tree!.root.findAllByType(TouchableOpacity).find(b => b.props.accessibilityState?.disabled !== undefined)!;
    await act(async () => { send.props.onPress(); });
    await flush();
    expect(words()).toContain('Your plan includes one review per plan period.');
  });

  it('shows the accurate result, with no revert', async () => {
    reviews = [review({ outcome: 'accurate', changes: [], can_revert: false })];
    await open();
    expect(words()).toContain('Your program is accurate, no changes needed.');
    expect(words()).toContain('ask Leap Coach directly');
    expect(words()).not.toContain('GO BACK TO MY PROGRAM');
  });

  it('shows what changed and why, and marks it seen', async () => {
    reviews = [review()];
    await open();
    expect(words()).toContain('The Leap team adjusted this week');
    expect(words()).toContain('Pull Ups 5×8 → 4×6');
    expect(words()).toContain('It looked too hard for your current max.');
    expect(mockRpc).toHaveBeenCalledWith('mark_program_review_seen', { p_review_id: 'r1' });
  });

  it('collapses a result already seen, and opens on tap', async () => {
    reviews = [review({ seen_at: '2026-11-07' })];
    await open();
    expect(words()).toContain('Reviewed by the Leap team');
    expect(words()).not.toContain('Pull Ups');
    await press('Reviewed by the Leap team');
    expect(words()).toContain('Pull Ups 5×8 → 4×6');
  });

  const fold = async () => {
    const btn = tree!.root.findAllByType(TouchableOpacity).find(b => b.props.accessibilityLabel === 'Hide review');
    if (!btn) throw new Error(`no fold button in: ${words()}`);
    await act(async () => { btn.props.onPress(); });
    await flush();
  };

  it('folds the result on its first look, and opens it again', async () => {
    reviews = [review({ outcome: 'accurate', changes: [], can_revert: false })];
    await open();
    expect(words()).toContain('Your program is accurate, no changes needed.');
    await fold();
    expect(words()).toContain('Reviewed by the Leap team');
    expect(words()).not.toContain('ASK LEAP COACH');
    await press('Reviewed by the Leap team');
    expect(words()).toContain('Your program is accurate, no changes needed.');
  });

  it('folds a result again after opening it from the quiet line', async () => {
    reviews = [review({ seen_at: '2026-11-07' })];
    await open();
    await press('Reviewed by the Leap team');
    expect(words()).toContain('Pull Ups 5×8 → 4×6');
    await fold();
    expect(words()).toContain('Reviewed by the Leap team');
    expect(words()).not.toContain('Pull Ups');
  });

  it('asks first, then reverts everything and reloads the workout', async () => {
    reviews = [review()];
    const onReverted = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open({ onReverted });
    await press('GO BACK TO MY PROGRAM');
    expect(mockRpc).not.toHaveBeenCalledWith('revert_program_review', expect.anything());
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => { await buttons[1].onPress!(); });
    await flush();
    expect(mockRpc).toHaveBeenCalledWith('revert_program_review', { p_review_id: 'r1' });
    expect(onReverted).toHaveBeenCalled();
    expect(words()).toContain('You went back to the program you built.');
    expect(words()).not.toContain('GO BACK TO MY PROGRAM');
    alert.mockRestore();
  });

  it('opens Leap Coach', async () => {
    reviews = [review()];
    await open();
    await press('ASK LEAP COACH');
    expect(mockPush).toHaveBeenCalledWith('/coach');
  });
});

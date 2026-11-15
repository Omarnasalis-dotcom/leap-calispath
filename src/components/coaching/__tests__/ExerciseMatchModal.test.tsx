import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark',
    theme: { card: { border: '#333', borderStrong: '#444' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } },
  }),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { ExerciseMatchModal } from '../ExerciseMatchModal';
import { InlineVideoPlayer } from '../InlineVideoPlayer';

const circuit = {
  label: 'PULL DAY | Finisher',
  kind: 'Circuit · 3 rounds',
  exercises: [
    { name: 'Dips', detail: '3 × 10', isThis: false, alsoUnmatched: false },
    { name: 'Child Pose', detail: '3 × 45s', isThis: true, alsoUnmatched: false },
  ],
};
const items = [
  { name: 'Child Pose', suggestions: [{ id: 'lib-childe', name: 'Childe Pose', youtube_url: 'https://www.youtube.com/watch?v=pYejthV2sYU' }], blocks: [circuit], emptiesBlocks: 0 },
  { name: 'Dragon Flag', suggestions: [], blocks: [{ ...circuit, exercises: [{ name: 'Dragon Flag', detail: '', isThis: true, alsoUnmatched: false }] }], emptiesBlocks: 1 },
];

const texts = () => r.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));

const button = (label: string) =>
  r.root.findAll((n) => n.type === TouchableOpacity && n.findAllByType(Text).some((t) => t.props.children === label))[0];

describe('ExerciseMatchModal', () => {
  it('keeps CONTINUE off until a name with suggestions is picked', () => {
    const onConfirm = jest.fn();
    act(() => { r = create(<ExerciseMatchModal items={items} onConfirm={onConfirm} onCancel={jest.fn()} />); });
    expect(button('CONTINUE').props.disabled).toBe(true);

    act(() => button('Childe Pose').props.onPress());
    expect(button('CONTINUE').props.disabled).toBe(false);

    act(() => button('CONTINUE').props.onPress());
    expect(onConfirm).toHaveBeenCalledWith([
      { name: 'Child Pose', exerciseId: 'lib-childe' },
      { name: 'Dragon Flag', create: true }, // no close match: starts on "Add as new"
    ]);
  });

  it('cancels', () => {
    const onCancel = jest.fn();
    act(() => { r = create(<ExerciseMatchModal items={items} onConfirm={jest.fn()} onCancel={onCancel} />); });
    act(() => button('CANCEL IMPORT').props.onPress());
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders nothing when there is nothing to ask', () => {
    act(() => { r = create(<ExerciseMatchModal items={null} onConfirm={jest.fn()} onCancel={jest.fn()} />); });
    expect(r.toJSON()).toBeNull();
  });

  it('opens the whole block with the exercise marked', () => {
    act(() => { r = create(<ExerciseMatchModal items={items} onConfirm={jest.fn()} onCancel={jest.fn()} />); });
    expect(texts()).not.toContain('PULL DAY | Finisher');
    act(() => button('View block').props.onPress());
    expect(texts()).toContain('PULL DAY | Finisher');
    expect(texts()).toContain('Circuit · 3 rounds');
    expect(texts()).toContain('2. Child Pose  ← this one');
  });

  it('can remove an exercise from its block, and warns when that empties a block', () => {
    const onConfirm = jest.fn();
    act(() => { r = create(<ExerciseMatchModal items={items} onConfirm={onConfirm} onCancel={jest.fn()} />); });
    const removes = r.root.findAll((n) => n.type === TouchableOpacity && n.findAllByType(Text).some((t) => t.props.children === 'Remove from block'));
    act(() => removes[0].props.onPress());
    act(() => removes[1].props.onPress());
    expect(texts()).toContain('This leaves 1 block with no exercises.');
    act(() => button('CONTINUE').props.onPress());
    expect(onConfirm).toHaveBeenCalledWith([
      { name: 'Child Pose', remove: true },
      { name: 'Dragon Flag', remove: true },
    ]);
  });

  it('plays a suggestion\'s video without picking it', () => {
    const onConfirm = jest.fn();
    act(() => { r = create(<ExerciseMatchModal items={items} onConfirm={onConfirm} onCancel={jest.fn()} />); });
    expect(r.root.findAllByType(InlineVideoPlayer)).toHaveLength(0);
    act(() => button('▶').props.onPress());
    const players = r.root.findAllByType(InlineVideoPlayer);
    expect(players).toHaveLength(1);
    expect(players[0].props.url).toBe('https://www.youtube.com/watch?v=pYejthV2sYU');
    expect(button('CONTINUE').props.disabled).toBe(true); // watching is not picking
    act(() => button('■').props.onPress());
    expect(r.root.findAllByType(InlineVideoPlayer)).toHaveLength(0);
  });
});

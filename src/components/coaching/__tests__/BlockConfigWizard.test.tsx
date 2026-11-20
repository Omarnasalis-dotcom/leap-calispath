// The mobile builder's Test item option (BlockConfigWizard): same metadata
// shape as the admin builder's ConceptWizard.
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark',
    theme: { accent: '#f00', card: { border: '#333' }, text: { primary: '#fff', secondary: '#ccc', tertiary: '#999' } },
  }),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

import { BlockConfigWizard } from '../BlockConfigWizard';

let renderer: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [].concat(n.props.children).join(''));
const press = (r: ReactTestRenderer, label: string) => {
  const btn = r.root.findAll((n) => typeof n.props.onPress === 'function' && texts({ root: n } as any).includes(label))[0];
  act(() => btn.props.onPress());
};
const mount = (initial: Record<string, unknown>) => {
  const onChange = jest.fn();
  act(() => {
    renderer = create(<BlockConfigWizard initialMetadata={initial as any} onChange={onChange} />);
  });
  return { r: renderer!, onChange, last: () => onChange.mock.calls[onChange.mock.calls.length - 1][0] };
};

describe('BlockConfigWizard test item', () => {
  it('turns a block into a test item with the first movement, and hides timing', () => {
    const { r, last } = mount({ timing_system: 'amrap', structure: 'circuit', time_cap_min: '12', is_tier_trial: true, focus_tag: 'PULL' });
    expect(texts(r)).toContain('1. TIMING SYSTEM');
    press(r, '1RM');
    expect(last()).toEqual({ focus_tag: 'PULL', timing_system: 'straight_set', structure: 'single', test_kind: 'one_rm', test_movement: 'pull_up' });
    expect(texts(r)).not.toContain('1. TIMING SYSTEM');
    expect(texts(r)).toContain('BACK SQUAT (BAR KG)');
    press(r, 'BACK SQUAT (BAR KG)');
    expect(last()).toMatchObject({ test_kind: 'one_rm', test_movement: 'squat' });
  });

  it('keeps an existing test item, and NORMAL BLOCK turns it back', () => {
    const { r, last } = mount({ timing_system: 'straight_set', structure: 'single', test_kind: 'max_hold', test_movement: 'front_lever' });
    expect(last()).toMatchObject({ test_kind: 'max_hold', test_movement: 'front_lever' });
    press(r, 'NORMAL BLOCK');
    expect(last().test_kind).toBeUndefined();
    expect(last().test_movement).toBeUndefined();
    expect(texts(r)).toContain('1. TIMING SYSTEM');
  });

  it('a form check has no movement', () => {
    const { r, last } = mount({ timing_system: 'straight_set', structure: 'single' });
    press(r, 'FORM CHECK');
    expect(last()).toEqual({ timing_system: 'straight_set', structure: 'single', test_kind: 'form_check' });
  });
});

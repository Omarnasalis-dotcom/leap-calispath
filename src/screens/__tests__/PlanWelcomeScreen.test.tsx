import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
const mockTrack = jest.fn();
jest.mock('../../lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));

import { PlanWelcomeScreen } from '../PlanWelcomeScreen';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && (texts(n.children as any).join('').includes(label) || n.props.accessibilityLabel === label))[0];

let r: ReactTestRenderer;
beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });
afterEach(() => act(() => r?.unmount()));

it('welcomes a new Pro member with what they unlocked and remembers it was shown', async () => {
  await act(async () => { r = create(<PlanWelcomeScreen tier="pro" upgrade={false} />); });
  const text = allText(r);
  expect(text).toContain('Welcome to PRO');
  expect(text).toContain('Your AI Coach');
  expect(text).toContain('Every program and workout');
  expect(text).toContain('Custom programs');
  expect(await AsyncStorage.getItem('plan_welcome_seen_u1')).toBe('pro');
  expect(mockTrack).toHaveBeenCalledWith('plan_welcome_viewed', { tier: 'pro', upgrade: false });
});

it('shows only what Max adds after an upgrade', async () => {
  await act(async () => { r = create(<PlanWelcomeScreen tier="max" upgrade />); });
  const text = allText(r);
  expect(text).toContain("You're on MAX now");
  expect(text).toContain('More AI Coach');
  expect(text).toContain('Everything in Pro stays');
  expect(text).not.toContain('Custom programs');
});

it('opens the AI Coach or the programs, or goes back', async () => {
  await act(async () => { r = create(<PlanWelcomeScreen tier="pro" upgrade={false} />); });
  await act(async () => { button(r, 'TALK TO YOUR AI COACH').props.onPress(); });
  expect(router.replace).toHaveBeenCalledWith('/coach');
  act(() => r.unmount());

  await act(async () => { r = create(<PlanWelcomeScreen tier="pro" upgrade={false} />); });
  await act(async () => { button(r, 'BROWSE PROGRAMS').props.onPress(); });
  expect(router.replace).toHaveBeenCalledWith('/program-templates');
  act(() => r.unmount());

  await act(async () => { r = create(<PlanWelcomeScreen tier="pro" upgrade={false} />); });
  await act(async () => { button(r, 'Later').props.onPress(); });
  expect(router.back).toHaveBeenCalled();
});

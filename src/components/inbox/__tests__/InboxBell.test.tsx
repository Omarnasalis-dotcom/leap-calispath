import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  // Runs the focus callback once, like a screen gaining focus.
  useFocusEffect: (cb: () => void) => { const R = require('react'); R.useEffect(() => { cb(); }, [cb]); },
}));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: () => ({ remove: jest.fn() }) }));
const mockUnread = jest.fn();
jest.mock('../../../services/InboxService', () => ({
  InboxService: { fetchBadgeCount: () => mockUnread() },
  onInboxChanged: () => () => { },
}));

import { InboxBell, badgeLabel } from '../InboxBell';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));

it('labels the badge 1 to 9, then 9+', () => {
  expect(badgeLabel(1)).toBe('1');
  expect(badgeLabel(9)).toBe('9');
  expect(badgeLabel(10)).toBe('9+');
  expect(badgeLabel(63)).toBe('9+');
});

it('shows the unread count on the bell', async () => {
  mockUnread.mockResolvedValue(3);
  await act(async () => { r = create(<InboxBell color="#fff" />); });
  expect(texts(r.toJSON())).toContain('3');
});

it('shows 9+ for a long list and nothing when all is read', async () => {
  mockUnread.mockResolvedValue(21);
  await act(async () => { r = create(<InboxBell color="#fff" />); });
  expect(texts(r.toJSON())).toContain('9+');
  await act(async () => { r.unmount(); });
  mockUnread.mockResolvedValue(0);
  await act(async () => { r = create(<InboxBell color="#fff" />); });
  // Only the bell icon's own glyph is left: no digits.
  expect(texts(r.toJSON()).join('')).not.toMatch(/[0-9]/);
});

it('opens the Notifications screen', async () => {
  mockUnread.mockResolvedValue(0);
  await act(async () => { r = create(<InboxBell color="#fff" />); });
  await act(async () => { r.root.findByProps({ accessibilityRole: 'button' }).props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith('/notifications');
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { UndoToast, UNDO_WINDOW_MS } from '../UndoToast';

let r: ReactTestRenderer;
beforeEach(() => jest.useFakeTimers());
afterEach(() => { act(() => r?.unmount()); jest.useRealTimers(); });

const undoButton = () => r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];

it('offers UNDO, then expires after the window', () => {
  const onUndo = jest.fn();
  const onExpire = jest.fn();
  act(() => { r = create(<UndoToast message="Week 3 added" onUndo={onUndo} onExpire={onExpire} />); });
  act(() => { undoButton().props.onPress(); });
  expect(onUndo).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(UNDO_WINDOW_MS - 1); });
  expect(onExpire).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(onExpire).toHaveBeenCalledTimes(1);
});

it('renders nothing without a message', () => {
  act(() => { r = create(<UndoToast message={null} onUndo={jest.fn()} onExpire={jest.fn()} />); });
  expect(r.toJSON()).toBeNull();
  expect(UNDO_WINDOW_MS).toBe(7000);
});

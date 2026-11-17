import React from 'react';
import { Modal } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));

import { PastProgramsSheet } from '../PastProgramsSheet';

// The restore sheet reports when it has really finished closing (iOS Modal
// onDismiss): TrainingCenterScreen opens the paywall only then, because
// RevenueCat's native paywall never appears while this sheet is still
// sliding away (endless paywall spinner, TestFlight 2026-11-17).
describe('PastProgramsSheet', () => {
  let r: ReactTestRenderer;
  afterEach(() => act(() => r.unmount()));

  it('passes onDismiss to the Modal', () => {
    const onDismiss = jest.fn();
    act(() => {
      r = create(
        <PastProgramsSheet
          visible
          onClose={jest.fn()}
          onDismiss={onDismiss}
          programs={[]}
          restoringId={null}
          deletingId={null}
          onRestore={jest.fn()}
          onDelete={jest.fn()}
        />,
      );
    });
    const modal = r.root.findByType(Modal);
    modal.props.onDismiss();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

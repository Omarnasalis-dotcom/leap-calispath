import React from 'react';
import * as ReactNative from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { installArabicText } from '../arabicStyles';

it('Arabic Text drops letterSpacing and swaps the font, even for inline styles', () => {
  const OriginalText = ReactNative.Text;
  installArabicText();
  const { Text } = ReactNative;
  expect(Text).not.toBe(OriginalText);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Text style={[{ fontSize: 12 }, { letterSpacing: 2, fontFamily: 'Oswald-Bold' }]}>مرحبا</Text>);
  });
  const style = ReactNative.StyleSheet.flatten(tree.root.findByType(OriginalText).props.style);
  expect(style.letterSpacing).toBeUndefined();
  expect(style.fontFamily).toBe('Cairo-Bold');
  expect(style.fontSize).toBe(12);
});

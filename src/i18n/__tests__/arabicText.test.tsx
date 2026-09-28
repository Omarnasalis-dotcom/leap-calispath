import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { installArabicText } from '../arabicStyles';

it('Arabic Text drops letterSpacing and swaps the font, even for inline styles', () => {
  // Read through require(), like the app's compiled imports do.
  const ReactNative = require('react-native');
  const OriginalText = ReactNative.Text;
  installArabicText();
  const { Text } = require('react-native');
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

it('English text inside the Arabic app keeps its design font', () => {
  installArabicText();
  const ReactNative = require('react-native');
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ReactNative.Text style={{ letterSpacing: 2, fontFamily: 'Oswald-Bold' }}>HOPLITE</ReactNative.Text>);
  });
  const inner = tree.root.findAll((n) => n.props.children === 'HOPLITE' && n.props.style)[0];
  const style = ReactNative.StyleSheet.flatten(inner.props.style);
  expect(style.fontFamily).toBe('Oswald-Bold');
  expect(style.letterSpacing).toBe(2);
});

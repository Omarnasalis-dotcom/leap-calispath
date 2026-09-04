import React from 'react';
import { Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';

// TouchableWithoutFeedback + Keyboard.dismiss dismisses the on-screen
// keyboard when tapping outside an input on native. On web there's no
// software keyboard (Keyboard.dismiss is a no-op there), and clicks inside
// nested TextInputs bubble up through the wrapper and trigger it anyway,
// blurring whatever field the user is typing in. Skip it on web.
export function DismissKeyboardOnOutsideTap({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <>{children}</>;
  }
  return <TouchableWithoutFeedback onPress={Keyboard.dismiss}>{children}</TouchableWithoutFeedback>;
}

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';

/**
 * Root of a world screen. SpartanLayout insets its content below the status
 * bar and paints that strip with the app theme's gradient, which left a
 * visible seam above the world's own background (#050505 over #000 in dark,
 * #F8F8F8 over #F6F6F7 in light). This extends the world background up
 * under the status bar.
 */
export function WorldPage({ tokens: t, children }: { tokens: WorldKitTokens; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, marginTop: -insets.top, paddingTop: insets.top }}>
      {children}
    </View>
  );
}

import React from 'react';
import { Text, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { kt } from './type';
import { KitButton } from './KitButton';
import { t as tr } from '../../../i18n';

/**
 * Shown in place of a world's movement list when the athlete's own records
 * couldn't be loaded. Never show zeros instead: a 0 "best" makes any result
 * look like a new PB and skips the below-your-best choice.
 */
export function LoadErrorCard({ tokens: t, onRetry, message }: { tokens: WorldKitTokens; onRetry: () => void; message?: string }) {
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 14 }}>
      <Text style={[kt('regular', 14, t.textMuted, 0, 20), { textAlign: 'center' }]}>{message ?? tr('worlds.recordsLoadFailed')}</Text>
      <KitButton tokens={t} label={tr('worlds.tryAgain')} onPress={onRetry} variant="outline" height={44} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

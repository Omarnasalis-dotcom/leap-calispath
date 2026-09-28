import React, { useMemo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorldKitTokens } from '../../../constants/worldKitTokens';
import { KitButton, kt } from '../worlds/kit';
import { tierName } from '../../lib/strengthClimb';
import { t, tierLevelLabel } from '../../i18n';

interface Props {
  visible: boolean;
  tier: number;
  name?: string | null;
  onStart: () => void;
  onSkip: () => void;
}

/**
 * Shown once on Profile after onboarding: your current tier, then the choice
 * to take the Profile tour or skip it. Settings > Replay Tutorial replays it.
 */
export function WelcomeTourCard({ visible, tier, name, onStart, onSkip }: Props) {
  const { mode } = useTheme();
  const k = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{
          width: '100%', maxWidth: 360, borderRadius: 26, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18,
          backgroundColor: k.mode === 'dark' ? '#0d0d0d' : '#FFFFFF', borderWidth: 1, borderColor: `${k.accent}73`,
        }}>
          <Text style={kt('semibold', 11, k.textMuted, 2.2)}>
            {firstName ? t('tour.welcomeName', { name: firstName.toUpperCase() }) : t('tour.welcome')}
          </Text>

          <Text style={[kt('medium', 11, k.textMuted, 2), { marginTop: 22 }]}>{t('tour.currentTier')}</Text>
          <Text style={[kt('bold', 46, k.text, 1.4, 50), { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {tierName(tier)}
          </Text>
          <Text style={[kt('semibold', 13, k.accentText, 1.2), { marginTop: 2 }]}>{tierLevelLabel(tier)}</Text>

          <View style={{ height: 1, backgroundColor: k.divider, marginVertical: 20 }} />

          <Text style={kt('regular', 14, k.textSecondary, 0.2, 21)}>{t('tour.offerBody')}</Text>

          <KitButton tokens={k} label={t('tour.offerStart')} onPress={onStart} height={52} fontSize={15} style={{ marginTop: 22 }} />
          <Pressable
            accessibilityRole="button"
            onPress={onSkip}
            style={({ pressed }) => ({ height: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={kt('semibold', 14, k.textMuted, 1.2)}>{t('tour.offerSkip')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

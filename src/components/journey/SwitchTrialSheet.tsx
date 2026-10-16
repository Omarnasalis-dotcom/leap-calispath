import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSwitchSheetStyles } from './SwitchDaySheet';
import { ClimbItem, ClimbOption, climbTrialTier, sameClimbItem } from '../../lib/trialSteps';
import { formatTime } from '../../lib/trials';
import { TIER_NAMES } from '../../types';
import { t, ltr } from '../../i18n';

interface SwitchTrialSheetProps {
  visible: boolean;
  /** Steps of the athlete's tier in order, then the trial; or an Eternity athlete's trials to improve (climbOptions). */
  options: ClimbOption[];
  /** What the checkpoint offers now. */
  current: ClimbItem | null;
  /** Best time per step, when known. */
  best?: Partial<Record<number, number>>;
  onPick: (item: ClimbItem) => void;
  onClose: () => void;
}

/**
 * Journey trial checkpoint's switch sheet (owner decision 2026-10-16): pick
 * Step 1, Step 2 or the trial for this checkpoint. A later step stays locked
 * until the one before it is cleared; cleared steps can be picked again.
 */
export function SwitchTrialSheet({ visible, options, current, best, onPick, onClose }: SwitchTrialSheetProps) {
  const styles = useSwitchSheetStyles();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('trialSteps.switchTitle')}</Text>
          <Text style={styles.sub}>{t('trialSteps.switchSub')}</Text>

          <View style={{ gap: 8 }}>
            {options.map((o) => {
              const isCurrent = sameClimbItem(o.item, current);
              const name = o.item.kind === 'step'
                ? t('trialSteps.title', { tier: (TIER_NAMES[o.item.tier] ?? '').toUpperCase(), n: o.item.step })
                : t('trialSteps.trialName', { tier: (TIER_NAMES[climbTrialTier(o.item)] ?? '').toUpperCase() });
              const stepBest = o.item.kind === 'step' ? best?.[o.item.step] : undefined;
              const meta = o.locked && o.item.kind === 'step'
                ? t('trialSteps.switchLocked', { n: o.item.step - 1 })
                : o.item.kind === 'step'
                  ? [t(o.item.step === 1 ? 'trialSteps.firstTaste' : 'trialSteps.bridge'), stepBest != null ? t('trialSteps.yourBest', { time: ltr(formatTime(stepBest)) }) : null]
                    .filter(Boolean).join(' · ')
                  : null;
              const icon = o.locked ? 'lock-outline' : o.item.kind === 'trial' ? 'sword-cross' : o.cleared ? 'check' : 'stairs-up';
              return (
                <TouchableOpacity
                  key={o.item.kind === 'step' ? `step-${o.item.step}` : `trial-${climbTrialTier(o.item)}`}
                  style={[styles.row, isCurrent && styles.rowCurrent, o.locked && { opacity: 0.5 }]}
                  onPress={() => onPick(o.item)}
                  disabled={o.locked}
                  accessibilityRole="button"
                  accessibilityLabel={meta ? `${name}, ${meta}` : name}
                  accessibilityState={{ selected: isCurrent, disabled: o.locked }}
                >
                  <View style={[styles.iconWell, isCurrent && styles.iconWellCurrent]}>
                    <MaterialCommunityIcons name={icon} size={17} color={isCurrent ? '#FFFFFF' : styles.muted.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                    {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  {isCurrent ? (
                    <View style={styles.upNextPill}>
                      <Text style={styles.upNextText}>{t('journey.switchDayUpNext')}</Text>
                    </View>
                  ) : o.cleared ? (
                    <Text style={[styles.meta, { marginTop: 0, letterSpacing: 1 }]}>{t('trialSteps.switchCleared')}</Text>
                  ) : !o.locked ? (
                    <MaterialCommunityIcons name="swap-vertical" size={18} color={styles.muted.color} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>{t('journey.switchDayCancel')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

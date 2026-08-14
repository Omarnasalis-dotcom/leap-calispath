import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';
import { TIER_REQUIREMENTS, POWER_TIER_REQUIREMENTS } from '../../constants/Progression';
import { RITES_OF_PASSAGE } from '../../lib/trials';
import { WarriorButton } from '../../components/atoms/WarriorButton';

interface TierDetailsModalProps {
  showTierModal: boolean;
  setShowTierModal: (val: boolean) => void;
  modalTier: number | null;
  category: 'strength' | 'power';
  activeCurrentTier: number;
  onOpenPowerAssessment?: () => void;
  onStartTrial?: (tier: number) => void;
}

export function TierDetailsModal({
  showTierModal,
  setShowTierModal,
  modalTier,
  category,
  activeCurrentTier,
  onOpenPowerAssessment,
  onStartTrial
}: TierDetailsModalProps) {
  const { theme } = useTheme();

  return (
    <>
{/* Tier Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTierModal}
        onRequestClose={() => setShowTierModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.modalTitleFrame, { borderColor: theme.accent }]}>
                <Text style={[styles.modalTitle, { color: theme.accent }]}>
                  {modalTier !== null ? ((category === 'power' ? POWER_TIER_NAMES[modalTier] : TIER_NAMES[modalTier]) || 'UNKNOWN').toUpperCase() : 'TIER'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowTierModal(false)}
              >
                <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTierLabel, { color: theme.text.secondary }]}>
              Tier {modalTier}
            </Text>

            <ScrollView contentContainerStyle={{ paddingBottom: 4 }}>
            {/* Difficulty Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>DIFFICULTY</Text>
              <View style={styles.modalDifficultyRow}>
                <View style={[styles.modalDifficultyBar, { backgroundColor: theme.background.secondary }]}>
                  <View
                    style={[
                      styles.modalDifficultyFill,
                      {
                        backgroundColor: theme.accent,
                        width: modalTier !== null ? `${(((category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.difficulty || 1) / 9) * 100}%` : '11%'
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.modalDifficultyValue, { color: theme.accent }]}>
                  {modalTier !== null ? (category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.difficulty : 1}/9
                </Text>
              </View>
            </View>

            {/* Requirements Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>REQUIREMENTS</Text>
              <Text style={[styles.modalDesc, { color: theme.text.secondary }]}>
                {modalTier !== null ? (category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.desc : 'Complete the trial to advance'}
              </Text>
            </View>

            {/* Trial Movements Preview */}
            {category === 'strength' && modalTier !== null && RITES_OF_PASSAGE[modalTier] && (
              <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
                <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>TRIAL MOVEMENTS</Text>
                <View style={styles.movementsList}>
                  {RITES_OF_PASSAGE[modalTier].movements.map((movement, idx) => (
                    <View key={idx} style={styles.movementItem}>
                      <View style={[styles.movementDot, { backgroundColor: theme.accent }]} />
                      <Text style={[styles.movementText, { color: theme.text.secondary }]}>
                        {movement.name}: {movement.reps}x
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            </ScrollView>

            {/* LEAP NOW Button - Only show if tier is not locked */}
            {modalTier !== null && modalTier <= activeCurrentTier && (
              <WarriorButton
                title="LEAP NOW"
                onPress={() => {
                  setShowTierModal(false);
                  if (category === 'power') {
                    if (onOpenPowerAssessment) onOpenPowerAssessment();
                  } else {
                    if (onStartTrial) onStartTrial(modalTier);
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderWidth: 1,
    borderRadius: 24,
    width: '100%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalTitleFrame: {
    borderBottomWidth: 2,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '900',
  },
  modalTierLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 20,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  modalSection: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  modalSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  modalDifficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalDifficultyBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalDifficultyFill: {
    height: '100%',
    borderRadius: 4,
  },
  modalDifficultyValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  modalDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  movementsList: {
    gap: 8,
  },
  movementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  movementText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
  },
});

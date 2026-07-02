import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform } from 'react-native';

interface BodyweightCheckInModalProps {
  visible: boolean;
  theme: any;
  bronzeGold: string;
  onSubmit: (weightKg: number) => void;
  onSkip: () => void;
  loading?: boolean;
  // Pre-fills the input when reopened to edit an already-logged weekly entry
  // rather than a fresh check-in.
  currentValue?: number | null;
}

export const BodyweightCheckInModal: React.FC<BodyweightCheckInModalProps> = ({
  visible,
  theme,
  bronzeGold,
  onSubmit,
  onSkip,
  loading,
  currentValue,
}) => {
  const [weight, setWeight] = useState('');
  const isEditing = currentValue !== null && currentValue !== undefined;

  useEffect(() => {
    if (visible) {
      setWeight(isEditing ? String(currentValue) : '');
    }
  }, [visible, currentValue]);

  const handleSubmit = () => {
    const parsed = parseFloat(weight);
    if (!weight || isNaN(parsed) || parsed <= 0) return;
    onSubmit(parsed);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onSkip}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>WEEKLY CHECK-IN</Text>
            <Text style={[styles.modalSubtext, { color: theme.text.secondary }]}>
              {isEditing ? 'UPDATE YOUR BODYWEIGHT FOR THIS WEEK' : 'LOG YOUR BODYWEIGHT FOR THIS WEEK (OPTIONAL)'}
            </Text>

            <View style={{ marginBottom: 24, width: '100%' }}>
              <Text style={[styles.modalLabel, { color: theme.text.secondary }]}>BODYWEIGHT (KG)</Text>
              <TextInput
                style={[styles.weightInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor={theme.text.tertiary}
                value={weight}
                onChangeText={setWeight}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalSkipBtn, { borderColor: theme.card.border }]}
                onPress={onSkip}
                disabled={loading}
              >
                <Text style={[styles.modalSkipBtnText, { color: theme.text.secondary }]}>{isEditing ? 'CANCEL' : 'SKIP'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: bronzeGold, opacity: (!weight || loading) ? 0.5 : 1 }]}
                onPress={handleSubmit}
                disabled={!weight || loading}
              >
                <Text style={styles.modalSubmitBtnText}>{loading ? 'SAVING...' : 'SAVE'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderWidth: 2,
    borderRadius: 8,
  },
  modalHeading: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  modalSubtext: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.5,
  },
  modalLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  weightInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalSkipBtn: {
    flex: 1,
    borderWidth: 1.2,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSkipBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSubmitBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
    color: '#000',
  },
});

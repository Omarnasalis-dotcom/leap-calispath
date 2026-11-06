import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { programReviewError, requestProgramReview } from '../../lib/programReview';
import { t } from '../../i18n';

const NOTE_LIMIT = 500;

/** Asks the Leap team to review a week: how satisfied, and an optional note. */
export function ProgramReviewSheet({ visible, warriorProgramId, week, onClose, onSent }: {
  visible: boolean;
  warriorProgramId: string;
  week: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const { theme } = useTheme();
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setRating(0);
    setNote('');
    setError('');
  }, [visible]);

  const send = async () => {
    if (!rating || sending) return;
    setSending(true);
    setError('');
    try {
      await requestProgramReview(warriorProgramId, week, rating, note);
      onSent();
    } catch (err) {
      setError(programReviewError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Pressable accessibilityLabel={t('common.close')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <Text style={[styles.title, { color: theme.text.primary }]}>{t('programReview.sheetTitle')}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{t('programReview.sheetBody')}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{t('programReview.sheetKeep')}</Text>

          <Text style={[styles.label, { color: theme.text.primary }]}>{t('programReview.satisfaction')}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                accessibilityRole="button"
                accessibilityLabel={t('programReview.starLabel', { n })}
                accessibilityState={{ selected: rating === n }}
                hitSlop={4}
                onPress={() => setRating(n)}
              >
                <MaterialCommunityIcons
                  name={n <= rating ? 'star' : 'star-outline'}
                  size={34}
                  color={n <= rating ? theme.accent : theme.text.secondary}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('programReview.notePlaceholder')}
            placeholderTextColor={theme.text.secondary}
            multiline
            maxLength={NOTE_LIMIT}
            style={[styles.input, { color: theme.text.primary, borderColor: theme.card.border }]}
          />

          {!!error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.accentText }]}>{error}</Text>}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !rating || sending }}
            disabled={!rating || sending}
            onPress={send}
            style={[styles.send, { backgroundColor: theme.accent, opacity: !rating || sending ? 0.45 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#000" /> : <Text style={styles.sendText}>{t('programReview.send')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 32, gap: 8 },
  title: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 18 },
  body: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 13.5, lineHeight: 19 },
  label: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, marginTop: 10 },
  stars: { flexDirection: 'row', gap: 8, marginTop: 2 },
  input: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 14, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 72, marginTop: 8, textAlignVertical: 'top' },
  error: { fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13 },
  send: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sendText: { color: '#000', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 14, letterSpacing: 0.6 },
});

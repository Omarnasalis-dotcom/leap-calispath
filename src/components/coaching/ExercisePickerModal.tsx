import React from 'react';
import { Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { LeapLogo } from '../LeapLogo';


interface ExerciseLibraryItem {
  id: string | number;
  name: string;
  youtube_url: string;
  category: string;
  difficulty: string;
}

interface ExercisePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectExercise: (item: ExerciseLibraryItem) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  selectedCategory: string;
  setSelectedCategory: (val: string) => void;
  exerciseLibrary: ExerciseLibraryItem[];
  libraryLoading: boolean;
  categories: string[];
}

export function ExercisePickerModal({
  visible,
  onClose,
  onSelectExercise,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  exerciseLibrary,
  libraryLoading,
  categories,
}: ExercisePickerModalProps) {
  const { theme, mode } = useTheme();
  const bronzeGold = '#C8A040';
  const solidCardBg = mode === 'dark' ? '#151515' : '#FFFFFF';
  const inactiveBorder = mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';

  const filteredLibrary = exerciseLibrary.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category?.toLowerCase() === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
          <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
            SELECT <Text style={{ color: bronzeGold }}>EXERCISE</Text>
          </Text>

          <TextInput
            style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="SEARCH EXERCISES..."
            placeholderTextColor="rgba(255,255,255,0.25)"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modalFilterScroll} contentContainerStyle={{ paddingRight: 20 }}>
            {categories.map((cat: string) => (
              <LinearGradient
                key={cat}
                colors={selectedCategory === cat ? ['#7E57C2', '#FF5252', '#FF7043'] : [inactiveBorder, inactiveBorder]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ padding: 1.2, borderRadius: 12, marginRight: 8 }}
              >
                <TouchableOpacity
                  style={{
                    backgroundColor: selectedCategory === cat ? 'transparent' : solidCardBg,
                    borderRadius: 11,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5, color: selectedCategory === cat ? '#FFFFFF' : theme.text.secondary }}>
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            ))}
          </ScrollView>

          {libraryLoading ? (
            <View style={{ padding: 40 }}>
              <LeapLogo size={40} animated />
            </View>
          ) : (
            <ScrollView style={{ width: '100%', maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {filteredLibrary.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.text.secondary, padding: 24 }]}>
                  NO MATCHING EXERCISES.
                </Text>
              ) : (
                filteredLibrary.map((item: ExerciseLibraryItem) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.pickerItem, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                    onPress={() => onSelectExercise(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemName, { color: theme.text.primary }]}>
                        {item.name.toUpperCase()}
                      </Text>
                      <Text style={[styles.pickerItemBadge, { color: bronzeGold }]}>
                        {item.category.toUpperCase()} • {item.difficulty.toUpperCase()}
                      </Text>
                    </View>
                    {item.youtube_url ? (
                      <TouchableOpacity
                        style={styles.pickerYtIcon}
                        onPress={() => Linking.openURL(item.youtube_url)}
                      >
                        <Text style={{ color: bronzeGold, fontSize: 11, fontFamily: 'BarlowCondensed-Bold' }}>VIDEO</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={[styles.cancelButtonText, { color: theme.text.secondary }]}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 16 },
  modalContent: { borderWidth: 1, borderRadius: 16, padding: 20, width: '100%', maxHeight: '90%' },
  modalHeading: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 1.5, marginBottom: 14, textAlign: 'center' },
  searchInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5, marginBottom: 10 },
  modalFilterScroll: { marginBottom: 12 },
  emptyText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center' },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  pickerItemName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 0.5 },
  pickerItemBadge: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11, marginTop: 2 },
  pickerYtIcon: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#C8A040' },
  cancelButton: { marginTop: 16, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  cancelButtonText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 },
});

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

interface ProgramBlock {
  id: string;
  db_id?: string | number;
  name: string;
  notes: string;
  exercises: any[];
  type?: string;
  rounds?: string;
  rest_after_round?: string;
  timer_seconds?: string;
}

interface ProgramDay {
  id: string;
  name: string;
  blocks: ProgramBlock[];
}

interface CopyBlockModalProps {
  visible: boolean;
  onClose: () => void;
  sourceBlock: ProgramBlock | null;
  copyView: 'options' | 'day' | 'template';
  setCopyView: (view: 'options' | 'day' | 'template') => void;
  days: ProgramDay[];
  otherTemplates: { id: string; name: string }[];
  targetBlocks: { id: string; name: string }[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  successMessage: string | null;
  onCopyDay: (targetBlockId: string) => void;
  onFetchOtherTemplates: () => Promise<void>;
  onFetchTargetBlocks: (templateId: string) => Promise<void>;
  onCopyTemplate: (targetBlockDbId: string | number) => Promise<void>;
}

export function CopyBlockModal({
  visible,
  onClose,
  sourceBlock,
  copyView,
  setCopyView,
  days,
  otherTemplates,
  targetBlocks,
  selectedTemplateId,
  setSelectedTemplateId,
  successMessage,
  onCopyDay,
  onFetchOtherTemplates,
  onFetchTargetBlocks,
  onCopyTemplate,
}: CopyBlockModalProps) {
  const { theme } = useTheme();
  const bronzeGold = '#C8A040';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: bronzeGold }]}>
          <Text style={[styles.modalHeading, { color: theme.text.primary }]}>
            COPY <Text style={{ color: bronzeGold }}>EXERCISES</Text>
          </Text>

          {successMessage ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ color: '#4CAF50', fontFamily: 'BarlowCondensed-Bold', fontSize: 18, textAlign: 'center', marginBottom: 12 }}>
                ✓ {successMessage}
              </Text>
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              {copyView === 'options' && (
                <View style={{ gap: 12, width: '100%', paddingVertical: 10 }}>
                  <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                    SELECT A DESTINATION OPTION FOR WORKOUT BLOCK "{sourceBlock?.name.toUpperCase()}"
                  </Text>

                  <TouchableOpacity
                    style={[styles.copyOptionCard, { borderColor: theme.card.border }]}
                    onPress={() => setCopyView('day')}
                  >
                    <Text style={[styles.copyOptionTitle, { color: bronzeGold }]}>COPY TO ANOTHER DAY / BLOCK</Text>
                    <Text style={[styles.copyOptionDesc, { color: theme.text.secondary }]}>
                      Paste exercises inside this program template.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.copyOptionCard, { borderColor: theme.card.border }]}
                    onPress={async () => {
                      await onFetchOtherTemplates();
                      setCopyView('template');
                    }}
                  >
                    <Text style={[styles.copyOptionTitle, { color: bronzeGold }]}>COPY TO ANOTHER PROGRAM</Text>
                    <Text style={[styles.copyOptionDesc, { color: theme.text.secondary }]}>
                      Paste exercises into another one of your saved templates.
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {copyView === 'day' && (
                <View style={{ width: '100%' }}>
                  <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                    SELECT TARGET BLOCK TO PASTE INTO:
                  </Text>
                  <ScrollView style={{ width: '100%', maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                    {(() => {
                      const otherBlocks = days.flatMap(d =>
                        d.blocks.map(b => ({ ...b, dayName: d.name }))
                      ).filter(b => b.id !== sourceBlock?.id);

                      if (otherBlocks.length === 0) {
                        return (
                          <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', padding: 20 }}>
                            NO OTHER BLOCKS AVAILABLE IN THIS TEMPLATE.
                          </Text>
                        );
                      }

                      return otherBlocks.map(b => (
                        <TouchableOpacity
                          key={b.id}
                          style={[styles.targetBlockItem, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                          onPress={() => onCopyDay(b.id)}
                        >
                          <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                            {b.dayName.toUpperCase()} - {b.name.toUpperCase()}
                          </Text>
                          <Text style={{ color: theme.text.tertiary, fontSize: 11 }}>
                            {b.exercises.length} EXERCISES
                          </Text>
                        </TouchableOpacity>
                      ));
                    })()}
                  </ScrollView>
                </View>
              )}

              {copyView === 'template' && (
                <View style={{ width: '100%' }}>
                  {!selectedTemplateId ? (
                    <View>
                      <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                        SELECT TARGET WORKOUT PROGRAM:
                      </Text>
                      <ScrollView style={{ width: '100%', maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                        {otherTemplates.length === 0 ? (
                          <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', padding: 20 }}>
                            NO OTHER PROGRAM TEMPLATES FOUND.
                          </Text>
                        ) : (
                          otherTemplates.map(t => (
                            <TouchableOpacity
                              key={t.id}
                              style={[styles.targetBlockItem, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                              onPress={() => onFetchTargetBlocks(t.id)}
                            >
                              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                                {t.name.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  ) : (
                    <View>
                      <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                        SELECT BLOCK WITHIN THAT PROGRAM:
                      </Text>
                      <ScrollView style={{ width: '100%', maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                        {targetBlocks.length === 0 ? (
                          <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', padding: 20 }}>
                            THIS PROGRAM HAS NO BLOCKS DEFINED.
                          </Text>
                        ) : (
                          targetBlocks.map(tb => (
                            <TouchableOpacity
                              key={tb.id}
                              style={[styles.targetBlockItem, { borderBottomColor: 'rgba(255,255,255,0.03)' }]}
                              onPress={() => onCopyTemplate(tb.id)}
                            >
                              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                                {tb.name.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                      <TouchableOpacity
                        style={{ marginTop: 12, alignSelf: 'center', padding: 8 }}
                        onPress={() => setSelectedTemplateId('')}
                      >
                        <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>GO BACK TO PROGRAMS</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text.secondary }]}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 16 },
  modalContent: { borderWidth: 1, borderRadius: 16, padding: 20, width: '100%', maxHeight: '90%' },
  modalHeading: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 1.5, marginBottom: 14, textAlign: 'center' },
  copyOptionCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 8 },
  copyOptionTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 0.5, marginBottom: 4 },
  copyOptionDesc: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },
  targetBlockItem: { paddingVertical: 14, borderBottomWidth: 1 },
  cancelButton: { marginTop: 16, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  cancelButtonText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 },
});

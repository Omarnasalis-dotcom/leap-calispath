import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { BlockConceptParser } from '../../lib/BlockConceptParser';

interface SelectedExercise {
  id: string;
  exercise_id: string | number;
  name: string;
  youtube_url: string;
  sets: string;
  reps: string;
  rest_seconds: string;
  hold_seconds?: string;
  is_weighted?: boolean;
  notes: string;
}

interface ProgramBlock {
  id: string;
  db_id?: string | number;
  name: string;
  notes: string;
  exercises: SelectedExercise[];
  metadata?: any;
  week_number?: number;
  previous_log_from_block_id?: string | number;
}

interface ProgramDay {
  id: string;
  name: string;
  blocks: ProgramBlock[];
  focusTag?: string;
}

interface CopyBlockModalProps {
  visible: boolean;
  onClose: () => void;
  sourceBlock: ProgramBlock | null;
  sourceDay: ProgramDay | null;
  copyView: 'options' | 'day' | 'template';
  setCopyView: (view: 'options' | 'day' | 'template') => void;
  days: ProgramDay[];
  weeks?: Record<number, ProgramDay[]>;
  activeWeek?: number;
  otherTemplates: { id: string; name: string }[];
  targetBlocks: { id: string | number; name: string }[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  successMessage: string | null;
  coachId?: string;
  onCopyDay: (targetBlockId: string, targetWeek?: number) => void;
  onCopyDayToDay: (sourceDayId: string, targetWeek?: number) => void;
  onFetchOtherTemplates: () => Promise<void>;
  onFetchTargetBlocks: (templateId: string) => Promise<void>;
  onCopyTemplate: (targetBlockDbId: string | number) => Promise<void>;
}

type CopyMode = 'block' | 'day';
type CopyTarget = 'options' | 'same_day' | 'same_template_day' | 'other_template' | 'client';

export function CopyBlockModal({
  visible, onClose, sourceBlock, sourceDay, copyView, setCopyView,
  days, weeks, activeWeek, otherTemplates, targetBlocks, selectedTemplateId, setSelectedTemplateId,
  successMessage, coachId, onCopyDay, onCopyDayToDay, onFetchOtherTemplates,
  onFetchTargetBlocks, onCopyTemplate,
}: CopyBlockModalProps) {
  const { theme, mode } = useTheme();
  const bronzeGold = '#C8A040';
  const solidBg = mode === 'dark' ? '#151515' : '#FFFFFF';

  const [copyMode, setCopyMode] = useState<CopyMode>('block');
  const [target, setTarget] = useState<CopyTarget>('options');
  const [selectedTargetWeek, setSelectedTargetWeek] = useState<number>(activeWeek || 1);
  const [clients, setClients] = useState<{ id: string; template_id: string; warrior_name: string }[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [copying, setCopying] = useState(false);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (!sourceBlock && sourceDay) {
        setCopyMode('day');
      } else {
        setCopyMode('block');
      }
      setSelectedTargetWeek(activeWeek || 1);
    }
  }, [visible, sourceBlock, sourceDay]);

  function reset() {
    setCopyMode('block');
    setTarget('options');
    setSelectedTargetWeek(activeWeek || 1);
    setClients([]);
    setLocalSuccess(null);
    setLocalError(null);
    setSelectedTemplateId('');
  }

  function handleClose() { reset(); onClose(); }

  function showSuccess(msg: string) {
    setLocalSuccess(msg);
    setTimeout(() => { setLocalSuccess(null); handleClose(); }, 2000);
  }

  async function fetchClients() {
    if (!coachId) return;
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('warrior_programs')
        .select('id, template_id, profiles:warrior_id (display_name)')
        .eq('coach_id', coachId)
        .eq('status', 'active');
      if (error) throw error;
      setClients((data || []).map((a: any) => ({
        id: a.id,
        template_id: a.template_id,
        warrior_name: a.profiles?.display_name || 'UNKNOWN WARRIOR',
      })));
    } catch (err: any) {
      setLocalError('FAILED TO LOAD CLIENTS.');
    } finally {
      setLoadingClients(false);
    }
  }

  async function copyBlockToClient(templateId: string) {
    if (!sourceBlock) return;
    setCopying(true);
    try {
      const notesWithMeta = sourceBlock.metadata
        ? BlockConceptParser.stringify(sourceBlock.metadata, sourceBlock.notes || '')
        : (sourceBlock.notes || '');
      const { data: existingBlocks } = await supabase.from('program_blocks').select('id').eq('template_id', templateId);
      const orderIndex = existingBlocks ? existingBlocks.length : 0;
      const { data: newBlock, error: blockErr } = await supabase
        .from('program_blocks')
        .insert({ template_id: templateId, name: `DAY 1 | ${sourceBlock.name}`, notes: notesWithMeta, order_index: orderIndex, week_number: 1 })
        .select('id').single();
      if (blockErr) throw blockErr;
      if (sourceBlock.exercises.length > 0) {
        const { error: exErr } = await supabase.from('block_exercises').insert(
          sourceBlock.exercises.map((ex, idx) => ({
            block_id: newBlock.id, exercise_id: ex.exercise_id,
            sets: parseInt(ex.sets) || null, reps: (ex.reps || '').trim(),
            rest_seconds: parseInt(ex.rest_seconds) || null, 
            hold_seconds: parseInt(ex.hold_seconds || '0') || null,
            is_weighted: ex.is_weighted || false,
            notes: (ex.notes || '').trim(), order_index: idx,
          }))
        );
        if (exErr) throw exErr;
      }
      showSuccess('BLOCK COPIED TO CLIENT!');
    } catch (err: any) {
      setLocalError(err.message?.toUpperCase() || 'FAILED TO COPY.');
    } finally { setCopying(false); }
  }

  async function copyDayToClient(templateId: string) {
    if (!sourceDay) return;
    setCopying(true);
    try {
      const { data: existingBlocks } = await supabase.from('program_blocks').select('id').eq('template_id', templateId);
      let orderIndex = existingBlocks ? existingBlocks.length : 0;
      for (const block of sourceDay.blocks) {
        const notesWithMeta = block.metadata ? BlockConceptParser.stringify(block.metadata, block.notes || '') : (block.notes || '');
        const { data: newBlock, error: blockErr } = await supabase
          .from('program_blocks')
          .insert({ template_id: templateId, name: `${sourceDay.name} | ${block.name}`, notes: notesWithMeta, order_index: orderIndex++, week_number: 1 })
          .select('id').single();
        if (blockErr) throw blockErr;
        if (block.exercises.length > 0) {
          const { error: exErr } = await supabase.from('block_exercises').insert(
            block.exercises.map((ex, idx) => ({
              block_id: newBlock.id, exercise_id: ex.exercise_id,
              sets: parseInt(ex.sets) || null, reps: (ex.reps || '').trim(),
              rest_seconds: parseInt(ex.rest_seconds) || null, 
              hold_seconds: parseInt(ex.hold_seconds || '0') || null,
              is_weighted: ex.is_weighted || false,
              notes: (ex.notes || '').trim(), order_index: idx,
            }))
          );
          if (exErr) throw exErr;
        }
      }
      showSuccess('DAY COPIED TO CLIENT!');
    } catch (err: any) {
      setLocalError(err.message?.toUpperCase() || 'FAILED TO COPY.');
    } finally { setCopying(false); }
  }

  async function copyDayToTemplate(targetTemplateId: string) {
    if (!sourceDay) return;
    setCopying(true);
    try {
      const { data: existingBlocks } = await supabase.from('program_blocks').select('id').eq('template_id', targetTemplateId);
      let orderIndex = existingBlocks ? existingBlocks.length : 0;
      for (const block of sourceDay.blocks) {
        const notesWithMeta = block.metadata ? BlockConceptParser.stringify(block.metadata, block.notes || '') : (block.notes || '');
        const { data: newBlock, error: blockErr } = await supabase
          .from('program_blocks')
          .insert({ template_id: targetTemplateId, name: `${sourceDay.name} | ${block.name}`, notes: notesWithMeta, order_index: orderIndex++, week_number: 1 })
          .select('id').single();
        if (blockErr) throw blockErr;
        if (block.exercises.length > 0) {
          const { error: exErr } = await supabase.from('block_exercises').insert(
            block.exercises.map((ex, idx) => ({
              block_id: newBlock.id, exercise_id: ex.exercise_id,
              sets: parseInt(ex.sets) || null, reps: (ex.reps || '').trim(),
              rest_seconds: parseInt(ex.rest_seconds) || null, 
              hold_seconds: parseInt(ex.hold_seconds || '0') || null,
              is_weighted: ex.is_weighted || false,
              notes: (ex.notes || '').trim(), order_index: idx,
            }))
          );
          if (exErr) throw exErr;
        }
      }
      showSuccess('DAY COPIED TO TEMPLATE!');
    } catch (err: any) {
      setLocalError(err.message?.toUpperCase() || 'FAILED TO COPY.');
    } finally { setCopying(false); }
  }

  const sourceName = copyMode === 'block' ? (sourceBlock?.name || 'BLOCK') : (sourceDay?.name || 'DAY');

  const renderWeekSelector = () => {
    if (!weeks) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>SELECT TARGET WEEK</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {Object.keys(weeks).map((weekStr) => {
            const wNum = parseInt(weekStr, 10);
            const isActive = wNum === selectedTargetWeek;
            return (
              <TouchableOpacity
                key={wNum}
                onPress={() => setSelectedTargetWeek(wNum)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent',
                  borderWidth: 1,
                  borderColor: isActive ? bronzeGold : theme.card.border,
                }}
              >
                <Text style={{
                  fontFamily: 'BarlowCondensed-Bold',
                  fontSize: 12,
                  color: isActive ? bronzeGold : theme.text.secondary
                }}>
                  WEEK {wNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const targetDays = weeks ? (weeks[selectedTargetWeek] || []) : days;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: solidBg, borderColor: bronzeGold }]}>
          <Text style={[styles.heading, { color: theme.text.primary }]}>
            COPY <Text style={{ color: bronzeGold }}>{sourceName.toUpperCase()}</Text>
          </Text>

          {(localSuccess || successMessage) && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{localSuccess || successMessage}</Text>
            </View>
          )}
          {localError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{localError}</Text>
            </View>
          )}

          {copying ? (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <ActivityIndicator color={bronzeGold} />
              <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, marginTop: 8 }}>COPYING...</Text>
            </View>
          ) : !localSuccess && !successMessage ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>

              {target === 'options' && (
                <View>
                  <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>STEP 1 — WHERE TO PASTE</Text>
                  <View style={{ gap: 8 }}>
                    {copyMode === 'block' && (
                      <TouchableOpacity style={[styles.targetCard, { borderColor: theme.card.border }]} onPress={() => setTarget('same_day')}>
                        <Text style={[styles.targetTitle, { color: bronzeGold }]}>PASTE INTO BLOCK (SAME TEMPLATE)</Text>
                        <Text style={[styles.targetDesc, { color: theme.text.secondary }]}>Add these exercises into another block in this program</Text>
                      </TouchableOpacity>
                    )}
                    {copyMode === 'day' && (
                      <TouchableOpacity style={[styles.targetCard, { borderColor: theme.card.border }]} onPress={() => setTarget('same_template_day')}>
                        <Text style={[styles.targetTitle, { color: bronzeGold }]}>DUPLICATE DAY (THIS TEMPLATE)</Text>
                        <Text style={[styles.targetDesc, { color: theme.text.secondary }]}>Add a copy of this day into this program</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.targetCard, { borderColor: theme.card.border }]} onPress={async () => { await onFetchOtherTemplates(); setTarget('other_template'); }}>
                      <Text style={[styles.targetTitle, { color: bronzeGold }]}>COPY TO ANOTHER TEMPLATE</Text>
                      <Text style={[styles.targetDesc, { color: theme.text.secondary }]}>Paste into one of your saved program templates</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.targetCard, { borderColor: theme.card.border }]} onPress={async () => { await fetchClients(); setTarget('client'); }}>
                      <Text style={[styles.targetTitle, { color: bronzeGold }]}>COPY TO CLIENT</Text>
                      <Text style={[styles.targetDesc, { color: theme.text.secondary }]}>Add directly into a client's active warrior program</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {target === 'same_day' && (
                <View>
                  {renderWeekSelector()}
                  <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>SELECT TARGET BLOCK</Text>
                  {targetDays.flatMap(d => d.blocks.map(b => ({ ...b, dayName: d.name }))).filter(b => b.id !== sourceBlock?.id).length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>NO OTHER BLOCKS IN THIS WEEK.</Text>
                  ) : (
                    targetDays.flatMap(d => d.blocks.map(b => ({ ...b, dayName: d.name }))).filter(b => b.id !== sourceBlock?.id).map(b => (
                      <TouchableOpacity key={b.id} style={[styles.listItem, { borderBottomColor: theme.card.border }]} onPress={() => { onCopyDay(b.id, selectedTargetWeek); showSuccess('EXERCISES COPIED!'); }}>
                        <Text style={[styles.listItemTitle, { color: theme.text.primary }]}>{b.dayName.toUpperCase()} — {b.name.toUpperCase()}</Text>
                        <Text style={[styles.listItemSub, { color: theme.text.tertiary }]}>{b.exercises.length} EXERCISES</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {target === 'same_template_day' && sourceDay && (
                <View>
                  {renderWeekSelector()}
                  <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>DUPLICATE DAY INTO THIS WEEK</Text>
                  <View style={[styles.confirmCard, { borderColor: bronzeGold }]}>
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>
                      {sourceDay.name.toUpperCase()} — {sourceDay.blocks.length} BLOCKS, {sourceDay.blocks.reduce((a, b) => a + b.exercises.length, 0)} EXERCISES
                    </Text>
                    <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, marginTop: 4 }}>A COPY WILL BE ADDED TO WEEK {selectedTargetWeek}</Text>
                  </View>
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: bronzeGold }]} onPress={() => { onCopyDayToDay(sourceDay.id, selectedTargetWeek); showSuccess('DAY COPIED!'); }}>
                    <Text style={styles.confirmBtnText}>CONFIRM DUPLICATE</Text>
                  </TouchableOpacity>
                </View>
              )}

              {target === 'other_template' && (
                <View>
                  {!selectedTemplateId ? (
                    <>
                      <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>SELECT TARGET TEMPLATE</Text>
                      {otherTemplates.length === 0 ? (
                        <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>NO OTHER TEMPLATES FOUND.</Text>
                      ) : otherTemplates.map(t => (
                        <TouchableOpacity key={t.id} style={[styles.listItem, { borderBottomColor: theme.card.border }]}
                          onPress={() => { if (copyMode === 'block') onFetchTargetBlocks(t.id); else setSelectedTemplateId(t.id); }}>
                          <Text style={[styles.listItemTitle, { color: theme.text.primary }]}>{t.name.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : copyMode === 'day' ? (
                    <>
                      <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>CONFIRM DAY COPY</Text>
                      <View style={[styles.confirmCard, { borderColor: bronzeGold }]}>
                        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 }}>{sourceDay?.name.toUpperCase()} — {sourceDay?.blocks.length} BLOCKS</Text>
                        <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, marginTop: 4 }}>TO: {otherTemplates.find(t => t.id === selectedTemplateId)?.name.toUpperCase()}</Text>
                      </View>
                      <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: bronzeGold }]} onPress={() => copyDayToTemplate(selectedTemplateId)}>
                        <Text style={styles.confirmBtnText}>CONFIRM COPY</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setSelectedTemplateId('')} style={styles.backBtn}>
                        <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>← BACK TO TEMPLATES</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>SELECT TARGET BLOCK</Text>
                      {targetBlocks.length === 0 ? (
                        <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>NO BLOCKS IN THIS TEMPLATE.</Text>
                      ) : targetBlocks.map(tb => (
                        <TouchableOpacity key={tb.id} style={[styles.listItem, { borderBottomColor: theme.card.border }]} onPress={() => onCopyTemplate(tb.id)}>
                          <Text style={[styles.listItemTitle, { color: theme.text.primary }]}>{tb.name.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity onPress={() => setSelectedTemplateId('')} style={styles.backBtn}>
                        <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>← BACK TO TEMPLATES</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {target === 'client' && (
                <View>
                  <Text style={[styles.stepLabel, { color: theme.text.tertiary }]}>SELECT CLIENT</Text>
                  {loadingClients ? (
                    <ActivityIndicator color={bronzeGold} style={{ marginVertical: 20 }} />
                  ) : clients.length === 0 ? (
                    <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>NO ACTIVE CLIENT PROGRAMS FOUND.</Text>
                  ) : clients.map(c => (
                    <TouchableOpacity key={c.id} style={[styles.listItem, { borderBottomColor: theme.card.border }]}
                      onPress={() => copyMode === 'block' ? copyBlockToClient(c.template_id) : copyDayToClient(c.template_id)}>
                      <Text style={[styles.listItemTitle, { color: theme.text.primary }]}>{c.warrior_name.toUpperCase()}</Text>
                      <Text style={[styles.listItemSub, { color: theme.text.tertiary }]}>TAP TO COPY {copyMode === 'block' ? 'BLOCK' : 'DAY'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            {target !== 'options' && !copying && !localSuccess && !successMessage && (
              <TouchableOpacity onPress={() => { setTarget('options'); setSelectedTemplateId(''); setLocalError(null); }} style={styles.backBtn}>
                <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 }}>← BACK</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.05)' }]} onPress={handleClose}>
              <Text style={[styles.closeBtnText, { color: theme.text.secondary }]}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 16 },
  content: { borderWidth: 1, borderRadius: 16, padding: 20, width: '100%', maxHeight: '90%' },
  heading: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 1.5, marginBottom: 16, textAlign: 'center' },
  stepLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 1.5, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  modeBtn: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  modeBtnText: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14, letterSpacing: 0.5 },
  modeBtnSub: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10, marginTop: 2 },
  targetCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  targetTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5, marginBottom: 3 },
  targetDesc: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1 },
  listItemTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
  listItemSub: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10, marginTop: 2 },
  confirmCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 14 },
  confirmBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  confirmBtnText: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14, letterSpacing: 1, color: '#000' },
  emptyText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center', padding: 20 },
  successBanner: { backgroundColor: 'rgba(76,175,80,0.1)', borderRadius: 8, padding: 12, marginBottom: 12, alignItems: 'center' },
  successText: { color: '#4CAF50', fontFamily: 'BarlowCondensed-Bold', fontSize: 13 },
  errorBanner: { backgroundColor: 'rgba(255,82,82,0.1)', borderRadius: 8, padding: 12, marginBottom: 12, alignItems: 'center' },
  errorText: { color: '#FF5252', fontFamily: 'BarlowCondensed-Bold', fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 10 },
  backBtn: { padding: 8 },
  closeBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  closeBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 },
});

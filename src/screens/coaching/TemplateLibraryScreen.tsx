import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { LeapLogo } from '../../components/LeapLogo';
import { styles } from './ProgramBuilderScreen.styles';
import { importLibraryTemplate } from '../../lib/TemplateLibraryImport';
import { publishLibraryTemplate } from '../../lib/TemplateLibraryPublish';
import { TierRange } from '../../lib/templateLibrary';

interface LibraryTemplateRow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  matching_criteria: { goal: string; tier_range: TierRange } | null;
  equipment_tags: string[];
  block_count: number;
  week_count: number;
}

const bronzeGold = '#C8A040';
type StatusFilter = 'draft' | 'published' | 'archived';
const STATUS_FILTERS: StatusFilter[] = ['draft', 'published', 'archived'];

interface Props {
  coachId?: string;
  isAdmin?: boolean;
}

export function TemplateLibraryScreen({ coachId, isAdmin }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const [templates, setTemplates] = useState<LibraryTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('draft');
  const [importing, setImporting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [editingTemplate, setEditingTemplate] = useState<LibraryTemplateRow | null>(null);
  const [goalInput, setGoalInput] = useState('strength');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [equipmentInput, setEquipmentInput] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [coachId, isAdmin]);

  async function loadTemplates() {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('program_templates')
        .select('id, name, description, status, matching_criteria, equipment_tags')
        .eq('is_library_template', true);

      if (!isAdmin) {
        query = query.eq('coach_id', coachId);
      }

      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;

      const templateIds = (data || []).map((t: any) => t.id);
      const blockCountMap: Record<string, number> = {};
      const weekNumbersMap: Record<string, Set<number>> = {};
      if (templateIds.length > 0) {
        const { data: blocksData, error: blocksError } = await supabase
          .from('program_blocks')
          .select('id, template_id, week_number')
          .in('template_id', templateIds);
        if (blocksError) throw blocksError;
        (blocksData || []).forEach((b: any) => {
          blockCountMap[b.template_id] = (blockCountMap[b.template_id] || 0) + 1;
          if (!weekNumbersMap[b.template_id]) weekNumbersMap[b.template_id] = new Set();
          weekNumbersMap[b.template_id].add(b.week_number || 1);
        });
      }

      setTemplates((data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status,
        matching_criteria: t.matching_criteria,
        equipment_tags: Array.isArray(t.equipment_tags) ? t.equipment_tags : [],
        block_count: blockCountMap[t.id] || 0,
        week_count: weekNumbersMap[t.id]?.size || 0,
      })));
    } catch (err: any) {
      setErrorMsg(err.message?.toUpperCase() || 'FAILED TO LOAD TEMPLATE LIBRARY.');
    } finally {
      setLoading(false);
    }
  }

  const handleImport = async () => {
    if (!coachId) return;
    setImporting(true);
    try {
      const DocumentPicker = require('expo-document-picker');
      // '*/*' rather than 'application/json' — files dragged/AirDropped onto a
      // simulator or synced from other apps often lack the exact UTI iOS wants
      // for a strict JSON MIME filter, which silently hides them from the
      // picker. Content is already validated as real JSON right below.
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets?.[0]) {
        setImporting(false);
        return;
      }

      const asset = result.assets[0];
      const text = Platform.OS === 'web'
        ? await (await fetch(asset.uri)).text()
        : await require('expo-file-system/legacy').readAsStringAsync(asset.uri, { encoding: 'utf8' });

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        Alert.alert('IMPORT FAILED', 'That file is not valid JSON.');
        return;
      }

      const { summary } = await importLibraryTemplate(parsed, coachId);
      const weekPhrase = summary.week_count > 1 ? ` over ${summary.week_count} weeks` : '';
      Alert.alert(
        'IMPORTED',
        `Created "${summary.template_name}" with ${summary.block_count} block(s) across ${summary.training_days_per_week} day(s)/week${weekPhrase}. ${summary.exercise_match_count.newly_created} new exercise(s) created. Set a tier range and goal, then publish when ready.`
      );
      await loadTemplates();
    } catch (err: any) {
      console.error('Failed to import library template:', err);
      Alert.alert('IMPORT FAILED', err.message?.toUpperCase() || 'FAILED TO IMPORT TEMPLATE.');
    } finally {
      setImporting(false);
    }
  };

  const handlePublish = async (templateId: string) => {
    setPublishingId(templateId);
    try {
      const result = await publishLibraryTemplate(templateId);
      if (!result.valid) {
        Alert.alert('CANNOT PUBLISH', result.error || 'Validation failed.');
        return;
      }
      await loadTemplates();
    } catch (err: any) {
      Alert.alert('PUBLISH FAILED', err.message?.toUpperCase() || 'FAILED TO PUBLISH TEMPLATE.');
    } finally {
      setPublishingId(null);
    }
  };

  const handleArchive = (templateId: string) => {
    const performArchive = async () => {
      setArchivingId(templateId);
      try {
        const { error } = await supabase
          .from('program_templates')
          .update({ status: 'archived' })
          .eq('id', templateId);
        if (error) throw error;
        await loadTemplates();
      } catch (err: any) {
        Alert.alert('ARCHIVE FAILED', err.message?.toUpperCase() || 'FAILED TO ARCHIVE TEMPLATE.');
      } finally {
        setArchivingId(null);
      }
    };

    const warning = 'Archived templates are removed from client recommendations but are not deleted.';
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) performArchive();
    } else {
      Alert.alert('ARCHIVE TEMPLATE?', warning, [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'ARCHIVE', style: 'destructive', onPress: performArchive },
      ]);
    }
  };

  const openCriteriaEditor = (t: LibraryTemplateRow) => {
    setEditingTemplate(t);
    setGoalInput(t.matching_criteria?.goal || 'strength');
    setMinInput(t.matching_criteria?.tier_range ? String(t.matching_criteria.tier_range.min) : '');
    setMaxInput(t.matching_criteria?.tier_range ? String(t.matching_criteria.tier_range.max) : '');
    setEquipmentInput(t.equipment_tags.join(', '));
  };

  const handleSaveCriteria = async () => {
    if (!editingTemplate) return;
    const min = parseInt(minInput, 10);
    const max = parseInt(maxInput, 10);
    if (!goalInput.trim()) {
      Alert.alert('INVALID CRITERIA', 'Goal is required.');
      return;
    }
    if (Number.isNaN(min) || Number.isNaN(max)) {
      Alert.alert('INVALID CRITERIA', 'Tier min/max must be numbers.');
      return;
    }

    setSavingCriteria(true);
    try {
      const equipment_tags = equipmentInput.split(',').map(s => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from('program_templates')
        .update({
          matching_criteria: { goal: goalInput.trim(), tier_range: { min, max } },
          equipment_tags,
        })
        .eq('id', editingTemplate.id);
      if (error) throw error;

      setEditingTemplate(null);
      await loadTemplates();
    } catch (err: any) {
      Alert.alert('SAVE FAILED', err.message?.toUpperCase() || 'FAILED TO SAVE CRITERIA.');
    } finally {
      setSavingCriteria(false);
    }
  };

  const visibleTemplates = templates.filter(t => t.status === statusFilter);

  return (
    <ScrollView style={rootStyles.container} contentContainerStyle={rootStyles.scrollContainer}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, letterSpacing: 4, color: theme.text.primary, textAlign: 'center' }}>
          TEMPLATE LIBRARY
        </Text>
        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 12, letterSpacing: 2.5, color: bronzeGold, textAlign: 'center', marginTop: -2 }}>
          P U B L I S H  T O  C L I E N T S
        </Text>
      </View>

      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: 1.5, width: '100%', marginBottom: 20 }}
      />

      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: theme.card.border, borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: importing ? 0.6 : 1 }}
        onPress={handleImport}
        disabled={importing}
      >
        <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
          {importing ? 'IMPORTING...' : 'IMPORT LIBRARY TEMPLATE FROM JSON'}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {STATUS_FILTERS.map(status => {
          const isActive = statusFilter === status;
          return (
            <TouchableOpacity
              key={status}
              style={[styles.chip, { borderColor: isActive ? bronzeGold : theme.card.border, backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent' }]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.chipText, { color: isActive ? bronzeGold : theme.text.tertiary }]}>
                {status.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <LeapLogo size={40} animated />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>LOADING TEMPLATE LIBRARY...</Text>
        </View>
      ) : visibleTemplates.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
          <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>
            NO {statusFilter.toUpperCase()} TEMPLATES.
          </Text>
        </View>
      ) : (
        visibleTemplates.map(t => (
          <LinearGradient
            key={t.id}
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 1.2, borderRadius: 12, marginBottom: 12 }}
          >
            <View style={[styles.catalogCardItem, { backgroundColor: theme.card.background, borderWidth: 0, borderRadius: 11, flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ width: '100%' }}>
                <Text style={[styles.catalogCardName, { color: theme.text.primary }]}>{t.name.toUpperCase()}</Text>
                <Text style={[styles.catalogCardCount, { color: bronzeGold }]}>
                  {t.block_count} BLOCKS{t.week_count > 1 ? ` ACROSS ${t.week_count} WEEKS` : ''}
                </Text>
                {t.matching_criteria?.tier_range ? (
                  <Text style={{ color: theme.text.secondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11, marginTop: 4 }}>
                    GOAL: {t.matching_criteria.goal.toUpperCase()} • TIER {t.matching_criteria.tier_range.min}-{t.matching_criteria.tier_range.max}
                  </Text>
                ) : (
                  <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 11, marginTop: 4 }}>
                    NO TIER RANGE / GOAL SET
                  </Text>
                )}
                {t.equipment_tags.length > 0 && (
                  <Text style={{ color: theme.text.tertiary, fontFamily: 'Barlow-Regular', fontSize: 11, marginTop: 4 }}>
                    {t.equipment_tags.join(', ')}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.catalogCardEditBtn, { borderColor: theme.card.border }]}
                  onPress={() => router.push(`/program-builder?templateId=${t.id}`)}
                >
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>EDIT BLOCKS</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.catalogCardEditBtn, { borderColor: bronzeGold }]} onPress={() => openCriteriaEditor(t)}>
                  <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>EDIT CRITERIA</Text>
                </TouchableOpacity>

                {t.status === 'draft' && (
                  <TouchableOpacity
                    style={[styles.catalogCardEditBtn, { borderColor: theme.card.border, opacity: publishingId === t.id ? 0.6 : 1 }]}
                    onPress={() => handlePublish(t.id)}
                    disabled={publishingId === t.id}
                  >
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>
                      {publishingId === t.id ? 'PUBLISHING...' : 'PUBLISH'}
                    </Text>
                  </TouchableOpacity>
                )}

                {t.status !== 'archived' && (
                  <TouchableOpacity
                    style={[styles.catalogCardDelBtn, { borderColor: 'rgba(255,107,107,0.2)', opacity: archivingId === t.id ? 0.6 : 1 }]}
                    onPress={() => handleArchive(t.id)}
                    disabled={archivingId === t.id}
                  >
                    <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>
                      {archivingId === t.id ? 'ARCHIVING...' : 'ARCHIVE'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </LinearGradient>
        ))
      )}

      <Modal visible={!!editingTemplate} transparent animationType="fade" onRequestClose={() => setEditingTemplate(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.modalHeading, { color: theme.text.primary }]}>MATCHING CRITERIA</Text>

            <View style={[styles.inputContainerStyle, { width: '100%' }]}>
              <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>GOAL</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={goalInput}
                onChangeText={setGoalInput}
                placeholder="strength"
                placeholderTextColor="rgba(255,255,255,0.2)"
                autoCapitalize="none"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <View style={[styles.inputContainerStyle, { flex: 1 }]}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>TIER MIN</Text>
                <TextInput
                  style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                  value={minInput}
                  onChangeText={setMinInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={[styles.inputContainerStyle, { flex: 1 }]}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>TIER MAX</Text>
                <TextInput
                  style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                  value={maxInput}
                  onChangeText={setMaxInput}
                  keyboardType="number-pad"
                  placeholder="9"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>

            <View style={[styles.inputContainerStyle, { width: '100%' }]}>
              <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>EQUIPMENT TAGS (COMMA SEPARATED)</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={equipmentInput}
                onChangeText={setEquipmentInput}
                placeholder="pull_bar, resistance_bands"
                placeholderTextColor="rgba(255,255,255,0.2)"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={{ width: '100%', borderRadius: 8, paddingVertical: 14, alignItems: 'center', backgroundColor: bronzeGold, opacity: savingCriteria ? 0.6 : 1 }}
              onPress={handleSaveCriteria}
              disabled={savingCriteria}
            >
              <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                {savingCriteria ? 'SAVING...' : 'SAVE CRITERIA'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setEditingTemplate(null)}>
              <Text style={[styles.cancelButtonText, { color: theme.text.tertiary }]}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const rootStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
  },
});

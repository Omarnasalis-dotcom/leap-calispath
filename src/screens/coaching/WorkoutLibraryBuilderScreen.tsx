// Admin-only authoring UI for standalone_workouts/standalone_workout_exercises
// (Workouts + Quick Workouts) — the CONTENT tab in Coaching Center, visible
// only to admins (unlike the LIBRARY tab, which is shown to every coach and
// only fails server-side for non-admins; this tab is hidden outright, see
// CoachingHubScreen). Structurally modeled on TemplateLibraryScreen's
// list-with-status-filter shell, reusing ProgramBuilderScreen's shared
// stylesheet for the exercise-row editor and ExercisePickerModal as-is for
// exercise selection.

import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Platform, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { LeapLogo } from '../../components/LeapLogo';
import { ExercisePickerModal } from '../../components/coaching/ExercisePickerModal';
import { styles } from './ProgramBuilderScreen.styles';
import { useWorkoutLibraryBuilder } from '../../hooks/coaching/useWorkoutLibraryBuilder';
import { StandaloneWorkoutStatus, StandaloneWorkoutKind, Difficulty, QuickWorkoutFormat, GoalTag } from '../../lib/workoutLibrary';

const bronzeGold = '#C8A040';
const STATUS_FILTERS: StandaloneWorkoutStatus[] = ['draft', 'published', 'archived'];
const KIND_FILTERS: ('all' | StandaloneWorkoutKind)[] = ['all', 'workout', 'quick_workout'];
const CATEGORY_OPTIONS = ['PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'];
const DIFFICULTY_OPTIONS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const FORMAT_OPTIONS: QuickWorkoutFormat[] = ['amrap', 'emom', 'fortime', 'tabata'];

export function WorkoutLibraryBuilderScreen() {
  const { theme } = useTheme();
  const b = useWorkoutLibraryBuilder();
  const [kindFilter, setKindFilter] = React.useState<'all' | StandaloneWorkoutKind>('all');
  const [statusFilter, setStatusFilter] = React.useState<StandaloneWorkoutStatus>('draft');

  useEffect(() => {
    b.loadWorkouts();
  }, []);

  const visible = b.workouts.filter(
    (w) => w.status === statusFilter && (kindFilter === 'all' || w.kind === kindFilter)
  );

  const handleDelete = (id: string, title: string) => {
    const perform = () => b.remove(id);
    const warning = `Delete "${title}"? This cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(warning)) perform();
    } else {
      Alert.alert('DELETE WORKOUT?', warning, [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'DELETE', style: 'destructive', onPress: perform },
      ]);
    }
  };

  // ─── EDIT/CREATE FORM ───
  if (b.editingId !== null) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 26, letterSpacing: 3, color: theme.text.primary, textAlign: 'center' }}>
            {b.editingId === 'new' ? 'NEW WORKOUT' : 'EDIT WORKOUT'}
          </Text>
        </View>

        {b.errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{b.errorMsg}</Text>
          </View>
        )}

        {b.formLoading ? (
          <View style={styles.centerContainer}>
            <LeapLogo size={40} animated />
          </View>
        ) : (
          <>
            <View style={[styles.inputContainerStyle, { width: '100%' }]}>
              <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>TITLE</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={b.form.title}
                onChangeText={(v) => b.updateForm('title', v)}
                placeholder="Push Power Circuit"
                placeholderTextColor="rgba(255,255,255,0.2)"
              />
            </View>

            <View style={[styles.inputContainerStyle, { width: '100%' }]}>
              <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>DESCRIPTION</Text>
              <TextInput
                style={[styles.textareaStyle, { color: theme.text.primary, borderColor: theme.card.border }]}
                value={b.form.description}
                onChangeText={(v) => b.updateForm('description', v)}
                placeholder="Short description shown on the detail card"
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline
              />
            </View>

            <ChipRow label="KIND" theme={theme} options={['workout', 'quick_workout']} selected={b.form.kind} onSelect={(v) => b.updateForm('kind', v)} />
            <ChipRow label="CATEGORY" theme={theme} options={CATEGORY_OPTIONS} selected={b.form.category} onSelect={(v) => b.updateForm('category', v)} />
            <ChipRow label="DIFFICULTY" theme={theme} options={DIFFICULTY_OPTIONS} selected={b.form.difficulty} onSelect={(v) => b.updateForm('difficulty', v)} />
            <MultiChipRow label="SKILL FOCUS (OPTIONAL)" theme={theme} options={b.goalTags} selected={b.form.goal_tags} onToggle={b.toggleGoalTag} />

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={[styles.inputContainerStyle, { flex: 1 }]}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>TIER MIN (0-9, OPTIONAL)</Text>
                <TextInput
                  style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                  value={b.form.tier_min}
                  onChangeText={(v) => b.updateForm('tier_min', v)}
                  placeholder="ANY"
                  keyboardType="number-pad"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={[styles.inputContainerStyle, { flex: 1 }]}>
                <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>TIER MAX (0-9, OPTIONAL)</Text>
                <TextInput
                  style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                  value={b.form.tier_max}
                  onChangeText={(v) => b.updateForm('tier_max', v)}
                  placeholder="ANY"
                  keyboardType="number-pad"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>

            {b.form.kind === 'quick_workout' && (
              <>
                <ChipRow label="FORMAT" theme={theme} options={FORMAT_OPTIONS} selected={b.form.format} onSelect={(v) => b.updateForm('format', v)} />
                <View style={[styles.inputContainerStyle, { width: '100%' }]}>
                  <Text style={[styles.inputLabelStyle, { color: theme.text.secondary }]}>DURATION (MINUTES)</Text>
                  <TextInput
                    style={[styles.searchInput, { color: theme.text.primary, borderColor: theme.card.border }]}
                    value={b.form.duration_minutes}
                    onChangeText={(v) => b.updateForm('duration_minutes', v)}
                    placeholder="20"
                    keyboardType="number-pad"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>
              </>
            )}

            <ChipRow label="STATUS" theme={theme} options={STATUS_FILTERS} selected={b.form.status} onSelect={(v) => b.updateForm('status', v)} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 14 }}>
              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.5 }}>FREE (NOT PRO-LOCKED)</Text>
              <Switch value={b.form.is_free} onValueChange={(v) => b.updateForm('is_free', v)} trackColor={{ true: bronzeGold }} />
            </View>

            <Text style={[styles.sectionTitleStyle, { color: theme.text.primary, marginTop: 12 }]}>
              {b.form.kind === 'quick_workout' ? 'BLOCK (USUALLY JUST ONE)' : 'BLOCKS — WARM-UP THROUGH COOL-DOWN'}
            </Text>
            {b.blocks.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: theme.card.border }]}>
                <Text style={[styles.emptyCardText, { color: theme.text.tertiary }]}>NO BLOCKS ADDED YET.</Text>
              </View>
            ) : (
              b.blocks.map((block, bi) => (
                <View key={block.key} style={[styles.blockCard, { borderColor: theme.card.border }]}>
                  <View style={styles.blockHeader}>
                    <TextInput
                      style={[styles.blockTitleInput, { color: theme.text.primary, flex: 1 }]}
                      value={block.name}
                      onChangeText={(v) => b.updateBlockName(bi, v)}
                      placeholder="Block name (e.g. Warm-Up)"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    <View style={styles.blockReorderRow}>
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => b.moveBlock(bi, -1)} disabled={bi === 0}>
                        <Text style={{ color: bi === 0 ? theme.text.tertiary : theme.text.primary }}>{'↑'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => b.moveBlock(bi, 1)} disabled={bi === b.blocks.length - 1}>
                        <Text style={{ color: bi === b.blocks.length - 1 ? theme.text.tertiary : theme.text.primary }}>{'↓'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBlockBtn} onPress={() => b.removeBlock(bi)}>
                        <Text style={styles.deleteBlockBtnText}>REMOVE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {block.exercises.length === 0 ? (
                    <View style={[styles.emptyCard, { borderColor: theme.card.border, marginTop: 10 }]}>
                      <Text style={[styles.emptyCardText, { color: theme.text.tertiary }]}>NO EXERCISES IN THIS BLOCK YET.</Text>
                    </View>
                  ) : (
                    block.exercises.map((ex, i) => (
                      <View key={i} style={[styles.exerciseRow, { borderColor: theme.card.border, marginTop: 10 }]}>
                        <View style={styles.exInfoCol}>
                          <Text style={[styles.exTitle, { color: theme.text.primary }]} numberOfLines={1}>{ex.name.toUpperCase()}</Text>
                          <View style={styles.blockReorderRow}>
                            <TouchableOpacity style={styles.reorderBtn} onPress={() => b.moveExercise(bi, i, -1)} disabled={i === 0}>
                              <Text style={{ color: i === 0 ? theme.text.tertiary : theme.text.primary }}>{'↑'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.reorderBtn} onPress={() => b.moveExercise(bi, i, 1)} disabled={i === block.exercises.length - 1}>
                              <Text style={{ color: i === block.exercises.length - 1 ? theme.text.tertiary : theme.text.primary }}>{'↓'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={styles.exInputsGrid}>
                          <NumField theme={theme} label="SETS" value={ex.sets} onChange={(v) => b.updateExercise(bi, i, 'sets', v)} />
                          <NumField theme={theme} label="REPS" value={ex.reps} onChange={(v) => b.updateExercise(bi, i, 'reps', v)} />
                          <NumField theme={theme} label="REST S" value={ex.rest_seconds} onChange={(v) => b.updateExercise(bi, i, 'rest_seconds', v)} />
                        </View>
                        <View style={[styles.exInputsGrid, { marginTop: 8 }]}>
                          <NumField theme={theme} label="HOLD S" value={ex.hold_seconds} onChange={(v) => b.updateExercise(bi, i, 'hold_seconds', v)} />
                          <NumField theme={theme} label="WORK S" value={ex.work_seconds} onChange={(v) => b.updateExercise(bi, i, 'work_seconds', v)} />
                          <View style={styles.exInputCol}>
                            <Text style={[styles.exInputLabel, { color: theme.text.tertiary }]}>WEIGHTED</Text>
                            <Switch value={ex.is_weighted} onValueChange={(v) => b.updateExercise(bi, i, 'is_weighted', v)} trackColor={{ true: bronzeGold }} />
                          </View>
                        </View>

                        <TextInput
                          style={[styles.exNotesField, { color: theme.text.primary, borderColor: theme.card.border, marginTop: 8 }]}
                          value={ex.notes}
                          onChangeText={(v) => b.updateExercise(bi, i, 'notes', v)}
                          placeholder="Notes (optional)"
                          placeholderTextColor="rgba(255,255,255,0.2)"
                        />

                        <TouchableOpacity style={styles.exDeleteBtn} onPress={() => b.removeExercise(bi, i)}>
                          <Text style={styles.exDeleteBtnText}>REMOVE EXERCISE</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}

                  <TouchableOpacity style={[styles.addExerciseTrigger, { borderColor: theme.card.border, marginTop: 10 }]} onPress={() => b.openPicker(bi)}>
                    <Text style={[styles.addExerciseTriggerText, { color: bronzeGold }]}>+ ADD EXERCISE TO THIS BLOCK</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity style={[styles.addExerciseTrigger, { borderColor: bronzeGold }]} onPress={b.addBlock}>
              <Text style={[styles.addExerciseTriggerText, { color: bronzeGold }]}>+ ADD BLOCK</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={styles.cancelButton} onPress={b.cancelEdit} disabled={b.saving}>
                <Text style={[styles.cancelButtonText, { color: theme.text.tertiary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 2, borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: bronzeGold, opacity: b.saving ? 0.6 : 1 }}
                onPress={b.save}
                disabled={b.saving}
              >
                <Text style={{ color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>
                  {b.saving ? 'SAVING...' : 'SAVE WORKOUT'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <ExercisePickerModal
          visible={b.pickerVisible}
          onClose={() => b.setPickerVisible(false)}
          onSelectExercise={b.addExercise}
          searchQuery={b.searchQuery}
          setSearchQuery={b.setSearchQuery}
          selectedCategory={b.selectedCategory}
          setSelectedCategory={b.setSelectedCategory}
          exerciseLibrary={b.exerciseLibrary}
          libraryLoading={b.libraryLoading}
          categories={b.categories}
        />
      </ScrollView>
    );
  }

  // ─── LIST VIEW ───
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, letterSpacing: 4, color: theme.text.primary, textAlign: 'center' }}>
          WORKOUT CONTENT
        </Text>
        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 12, letterSpacing: 2.5, color: bronzeGold, textAlign: 'center', marginTop: -2 }}>
          W O R K O U T S  &amp;  Q U I C K  W O R K O U T S
        </Text>
      </View>

      <LinearGradient colors={['#7E57C2', '#FF5252', '#FF7043']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 1.5, width: '100%', marginBottom: 20 }} />

      {b.errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{b.errorMsg}</Text>
        </View>
      )}

      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: bronzeGold, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}
        onPress={b.startNew}
      >
        <Text style={{ color: bronzeGold, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 }}>+ NEW WORKOUT</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {KIND_FILTERS.map((k) => {
          const isActive = kindFilter === k;
          return (
            <TouchableOpacity
              key={k}
              style={[styles.chip, { borderColor: isActive ? bronzeGold : theme.card.border, backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent' }]}
              onPress={() => setKindFilter(k)}
            >
              <Text style={[styles.chipText, { color: isActive ? bronzeGold : theme.text.tertiary }]}>{k.replace('_', ' ').toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {STATUS_FILTERS.map((s) => {
          const isActive = statusFilter === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.chip, { borderColor: isActive ? bronzeGold : theme.card.border, backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent' }]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.chipText, { color: isActive ? bronzeGold : theme.text.tertiary }]}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {b.loading ? (
        <View style={styles.centerContainer}>
          <LeapLogo size={40} animated />
          <Text style={[styles.loadingText, { color: theme.text.secondary }]}>LOADING WORKOUTS...</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: theme.card.border }]}>
          <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13 }}>
            NO {statusFilter.toUpperCase()} WORKOUTS.
          </Text>
        </View>
      ) : (
        visible.map((w) => (
          <LinearGradient
            key={w.id}
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 1.2, borderRadius: 12, marginBottom: 12 }}
          >
            <View style={[styles.catalogCardItem, { backgroundColor: theme.card.background, borderWidth: 0, borderRadius: 11, flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={[styles.catalogCardName, { color: theme.text.primary }]}>{w.title.toUpperCase()}</Text>
              <Text style={[styles.catalogCardCount, { color: bronzeGold }]}>
                {w.kind.replace('_', ' ').toUpperCase()} • {(w.category || 'UNCATEGORIZED')} • {w.is_free ? 'FREE' : 'PRO'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 12 }}>
                <TouchableOpacity style={[styles.catalogCardEditBtn, { borderColor: theme.card.border }]} onPress={() => b.startEdit(w.id)}>
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.catalogCardDelBtn, { borderColor: 'rgba(255,107,107,0.2)', opacity: b.deletingId === w.id ? 0.6 : 1 }]}
                  onPress={() => handleDelete(w.id, w.title)}
                  disabled={b.deletingId === w.id}
                >
                  <Text style={{ color: '#FF6B6B', fontFamily: 'BarlowCondensed-Bold', fontSize: 11 }}>
                    {b.deletingId === w.id ? 'DELETING...' : 'DELETE'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        ))
      )}
    </ScrollView>
  );
}

function ChipRow({
  label, theme, options, selected, onSelect,
}: {
  label: string; theme: any; options: readonly string[]; selected: string; onSelect: (v: any) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.inputLabelStyle, { color: theme.text.secondary, marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isActive = selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, { borderColor: isActive ? bronzeGold : theme.card.border, backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent' }]}
              onPress={() => onSelect(opt)}
            >
              <Text style={[styles.chipText, { color: isActive ? bronzeGold : theme.text.tertiary }]}>{opt.replace('_', ' ').toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Same visual language as ChipRow, but `selected` is a whole set and every
// tap toggles membership rather than replacing the selection — goal tags
// are "matches any of", not mutually exclusive like category/difficulty.
function MultiChipRow({
  label, theme, options, selected, onToggle,
}: {
  label: string; theme: any; options: readonly GoalTag[]; selected: GoalTag[]; onToggle: (tag: GoalTag) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.inputLabelStyle, { color: theme.text.secondary, marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isActive = selected.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, { borderColor: isActive ? bronzeGold : theme.card.border, backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : 'transparent' }]}
              onPress={() => onToggle(opt)}
            >
              <Text style={[styles.chipText, { color: isActive ? bronzeGold : theme.text.tertiary }]}>{opt.replace('_', ' ').toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NumField({ theme, label, value, onChange }: { theme: any; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.exInputCol}>
      <Text style={[styles.exInputLabel, { color: theme.text.tertiary }]}>{label}</Text>
      <TextInput
        style={[styles.exField, { color: theme.text.primary, borderColor: theme.card.border }]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="-"
        placeholderTextColor="rgba(255,255,255,0.2)"
      />
    </View>
  );
}

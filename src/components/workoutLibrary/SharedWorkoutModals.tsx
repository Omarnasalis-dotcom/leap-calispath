import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LeapLogo } from '../LeapLogo';
import { TemplateDetailBlock } from '../../lib/templateLibrary';
import { StandaloneWorkoutSummary, StandaloneWorkoutDetail } from '../../lib/workoutLibrary';

// Three modals shared across the Training Center's browse screens
// (ProgramTemplatesScreen, CustomizeProgramScreen — QuickWorkoutScreen
// starts a session directly with no preview step, per its own "no brief
// screen" design intent) — split out from the original WorkoutLibraryScreen
// once that screen itself became unreachable (nothing routes to it anymore;
// every Training Center path now has its own dedicated screen) so this
// shared UI doesn't live inside a ~2000-line dead legacy file.

const bronzeGold = '#C8A040';

export function StandaloneWorkoutDetailModal({
  visible,
  theme,
  detail,
  loading,
  mode,
  isSelected,
  nextDayNumber,
  onAdd,
  onRemove,
  onClose,
  onStartWorkout,
}: {
  visible: boolean;
  theme: any;
  detail: StandaloneWorkoutDetail | null;
  loading: boolean;
  mode: 'browse' | 'select';
  isSelected: boolean;
  nextDayNumber: number;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
  onStartWorkout: () => void;
}) {
  // Blocks collapsed by default — the meta summary row above already gives
  // the "can I decide yes/no" gist (block/movement counts); the chevron is
  // what reveals each block's actual exercise pills on demand, so a
  // multi-block workout doesn't dump every pill at once.
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const toggleBlock = (blockId: string) => setExpandedBlocks((prev) => ({ ...prev, [blockId]: !prev[blockId] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          {loading || !detail ? (
            <View style={previewStyles.loadingBox}>
              <LeapLogo size={32} animated />
            </View>
          ) : (
            <>
              <View style={previewStyles.header}>
                <Text style={[previewStyles.title, { color: theme.text.primary }]} numberOfLines={2}>{detail.title.toUpperCase()}</Text>
                {detail.format && detail.duration_minutes && (
                  <Text style={previewStyles.subtitle}>{detail.format.toUpperCase()} · {detail.duration_minutes} MIN CAP</Text>
                )}
              </View>
              {/* Meta summary — real fields (category/difficulty/movement
                  count) always shown up top so there's something concrete
                  to decide from even before scrolling into the block
                  breakdown below. */}
              <View style={previewStyles.metaSummaryRow}>
                {!!detail.category && (
                  <View style={[previewStyles.exercisePill, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                    <Text style={[previewStyles.exercisePillText, { color: theme.text.primary }]}>{detail.category.replace('_', ' ')}</Text>
                  </View>
                )}
                {!!detail.difficulty && (
                  <View style={[previewStyles.exercisePill, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                    <Text style={[previewStyles.exercisePillText, { color: theme.text.primary }]}>{detail.difficulty.toUpperCase()}</Text>
                  </View>
                )}
                <View style={[previewStyles.exercisePill, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                  <Text style={[previewStyles.exercisePillText, { color: theme.text.primary }]}>
                    {detail.blocks.length} BLOCK{detail.blocks.length === 1 ? '' : 'S'} · {detail.blocks.reduce((n, b) => n + b.exercises.length, 0)} MOVEMENTS
                  </Text>
                </View>
              </View>

              {/* Program structure — every block's name is shown as a
                  section header regardless of whether its exercises have
                  been authored yet, so the real day structure (Warm-Up ->
                  Main -> Cool-Down, etc.) is always visible; exercises
                  render as pill tags underneath when present. A block name
                  alone is real, decision-useful info — hiding the whole
                  section just because exercises are thin was the actual
                  bug (a card with named-but-empty blocks rendered as
                  nothing at all below the title). */}
              {detail.blocks.length > 0 ? (
                // flex:1 alone (previewStyles.body) can collapse to zero
                // height here — this card has no explicit height, only a
                // maxHeight cap, and Yoga doesn't reliably grow a flex:1
                // child to fill "remaining space" in that case. minHeight
                // forces a real, always-visible scroll area regardless;
                // maxHeight still keeps the modal from growing unbounded.
                <ScrollView style={[previewStyles.body, { flex: undefined, minHeight: 140, maxHeight: 320 }]}>
                  {detail.blocks.map((block) => {
                    const hasExercises = block.exercises.length > 0;
                    const isBlockExpanded = !!expandedBlocks[block.id];
                    return (
                      <View key={block.id} style={{ marginBottom: 16 }}>
                        <TouchableOpacity
                          activeOpacity={hasExercises ? 0.7 : 1}
                          disabled={!hasExercises}
                          onPress={() => toggleBlock(block.id)}
                          style={previewStyles.blockHeaderRow}
                        >
                          <Text style={[localStyles.sectionLabel, { color: bronzeGold, marginTop: 0, marginBottom: 0 }]}>
                            {block.name.toUpperCase()}
                          </Text>
                          {hasExercises ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={[previewStyles.blockCountText, { color: theme.text.tertiary }]}>{block.exercises.length}</Text>
                              <MaterialCommunityIcons
                                name={isBlockExpanded ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={theme.text.secondary}
                              />
                            </View>
                          ) : null}
                        </TouchableOpacity>
                        {hasExercises ? (
                          isBlockExpanded && (
                            <View style={[previewStyles.pillWrap, { marginTop: 8 }]}>
                              {block.exercises.map((ex) => {
                                const metric = ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.work_seconds ? `${ex.work_seconds}S` : ex.hold_seconds ? `${ex.hold_seconds}S` : '';
                                return (
                                  <View key={ex.exercise_id + String(ex.order_index)} style={[previewStyles.exercisePill, { borderColor: theme.card.border, backgroundColor: theme.card.background }]}>
                                    {ex.is_weighted && <MaterialCommunityIcons name="dumbbell" size={10} color={bronzeGold} style={{ marginRight: 4 }} />}
                                    <Text style={[previewStyles.exercisePillText, { color: theme.text.primary }]} numberOfLines={1}>
                                      {ex.name}{metric ? ` · ${metric}` : ''}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          )
                        ) : (
                          <Text style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 11.5, fontStyle: 'italic', marginTop: 4 }}>
                            Exercises not listed yet.
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  {detail.description && (
                    <Text style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 13, marginTop: 4 }}>
                      {detail.description}
                    </Text>
                  )}
                </ScrollView>
              ) : detail.description ? (
                <ScrollView style={[previewStyles.body, { flex: undefined, minHeight: 140, maxHeight: 320 }]}>
                  <Text style={{ color: theme.text.secondary, fontFamily: 'Barlow-Regular', fontSize: 13 }}>
                    {detail.description}
                  </Text>
                </ScrollView>
              ) : (
                <View style={[localStyles.emptyBox, { borderColor: theme.card.border }]}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={theme.text.secondary} style={{ marginBottom: 8 }} />
                  <Text style={[previewStyles.emptyText, { color: theme.text.secondary }]}>
                    NO STRUCTURE AVAILABLE FOR THIS ONE YET.
                  </Text>
                </View>
              )}
            </>
          )}
          {mode === 'select' ? (
            <View style={[previewStyles.actions, { marginTop: 12 }]}>
              <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]} onPress={onClose}>
                <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
              </TouchableOpacity>
              {isSelected ? (
                <TouchableOpacity style={previewStyles.removeBtn} onPress={onRemove}>
                  <MaterialCommunityIcons name="close-circle-outline" size={16} color="#FF6B6B" />
                  <Text style={previewStyles.removeBtnText}>REMOVE FROM PROGRAM</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={previewStyles.startBtn} onPress={onAdd}>
                  <Text style={previewStyles.startBtnText}>ADD AS DAY {nextDayNumber}</Text>
                  <MaterialCommunityIcons name="plus" size={16} color="#000" />
                </TouchableOpacity>
              )}
            </View>
          ) : detail?.kind === 'quick_workout' ? (
            <View style={[previewStyles.actions, { marginTop: 12 }]}>
              <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]} onPress={onClose}>
                <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CLOSE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={previewStyles.startBtn} onPress={onStartWorkout}>
                <Text style={previewStyles.startBtnText}>START WORKOUT</Text>
                <MaterialCommunityIcons name="play" size={16} color="#000" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[previewStyles.cancelBtn, { borderColor: theme.card.border, marginTop: 12 }]} onPress={onClose}>
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CLOSE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Reviews the day-picker's current selection before committing — matches
// ProgramPreviewModal's card/overlay chrome (reuses previewStyles) since
// this is the same "confirm before you write anything" moment, just for a
// caller-assembled program instead of a pre-authored one.
export function BuildSummaryModal({
  visible,
  theme,
  days,
  switchWarning,
  creating,
  onRemove,
  onAddAnother,
  onStart,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  theme: any;
  days: StandaloneWorkoutSummary[];
  switchWarning: string | null;
  creating: boolean;
  onRemove: (workoutId: string) => void;
  onAddAnother: () => void;
  onStart: () => void;
  onClose: () => void;
  // iOS-only native signal (RN's Modal never calls this on Android) that
  // the dismiss animation has actually finished — callers navigating to
  // /paywall right after closing this modal should wait for this instead
  // of guessing a delay; see CustomizeProgramScreen's
  // requestPaywallAfterModalCloses for why that guess used to fail.
  onDismiss?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <View style={previewStyles.header}>
            <Text style={[previewStyles.title, { color: theme.text.primary }]}>YOUR CUSTOM WEEK</Text>
            <Text style={previewStyles.subtitle}>
              {days.length} DAY{days.length === 1 ? '' : 'S'} SELECTED
            </Text>
          </View>

          {switchWarning && (
            <View style={previewStyles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={14} color={bronzeGold} />
              <Text style={previewStyles.warningText}>{switchWarning}</Text>
            </View>
          )}

          <ScrollView
            style={[previewStyles.body, { flex: undefined, minHeight: 140, maxHeight: 320 }]}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {days.length === 0 ? (
              <Text style={[previewStyles.emptyText, { color: theme.text.tertiary }]}>
                NO DAYS SELECTED YET.
              </Text>
            ) : (
              days.map((d, i) => (
                <View
                  key={d.id + String(i)}
                  style={[previewStyles.dayRow, { borderColor: theme.card.border, justifyContent: 'space-between' }]}
                >
                  <Text style={[previewStyles.dayRowText, { color: theme.text.primary, flex: 1 }]} numberOfLines={1}>
                    DAY {i + 1} — {d.title.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={() => onRemove(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={18} color={theme.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          <View style={previewStyles.actions}>
            <TouchableOpacity
              style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]}
              onPress={onAddAnother}
              disabled={creating}
            >
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>ADD ANOTHER DAY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[previewStyles.startBtn, { opacity: creating || days.length === 0 ? 0.7 : 1 }]}
              onPress={onStart}
              disabled={creating || days.length === 0}
            >
              {creating ? (
                <LeapLogo size={22} animated />
              ) : (
                <>
                  <Text style={previewStyles.startBtnText}>START MY PROGRAM</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Shown instead of BuildSummaryModal when a free user hits Create on a
// custom program — Customize Program is "browse free, paywall on Create"
// (Pro/Max only), so this is the moment that actually needs to sell the
// upgrade rather than just confirm-and-create. Reuses previewStyles'
// card/overlay/actions chrome for consistency with the modal it replaces;
// startBtn's existing bronzeGold fill already reads as "the premium
// action" in this file's own vocabulary, so no new button treatment
// needed — only the content between the header and the actions is new.
export function UpgradeToSaveModal({
  visible,
  theme,
  dayCount,
  upgrading,
  onUpgrade,
  onCancel,
  onDismiss,
}: {
  visible: boolean;
  theme: any;
  dayCount: number;
  // iOS-only native signal (RN's Modal never calls this on Android) that
  // the dismiss animation has actually finished — see BuildSummaryModal's
  // onDismiss above for why the caller wants this instead of a guessed
  // delay before navigating to /paywall.
  onDismiss?: () => void;
  // True from the moment "Upgrade to Save" is tapped until the paywall
  // route actually pushes — disables both buttons and shows a spinner so
  // a second tap (very plausible during the deliberate delay before
  // navigating, see CustomizeProgramScreen's onUpgrade comment) can't fire
  // router.push('/paywall') twice, stacking two PaywallScreen instances
  // that each independently call RevenueCatUI.presentPaywall() — confirmed
  // live as the cause of an indefinite native-paywall hang.
  upgrading: boolean;
  onUpgrade: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} onDismiss={onDismiss}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, upgradeStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <View style={upgradeStyles.iconWell}>
            <MaterialCommunityIcons name="crown" size={26} color={bronzeGold} />
          </View>

          <Text style={[upgradeStyles.title, { color: theme.text.primary }]}>SAVE YOUR PROGRAM</Text>

          <View style={upgradeStyles.dayCountPill}>
            <MaterialCommunityIcons name="calendar-check" size={12} color={bronzeGold} />
            <Text style={upgradeStyles.dayCountText}>{dayCount}-DAY PROGRAM BUILT</Text>
          </View>

          <Text style={[upgradeStyles.body, { color: theme.text.secondary }]}>
            Custom programs are a Pro and Max feature. Upgrade to save this one and start training today — your days stay exactly as you built them.
          </Text>

          <View style={previewStyles.actions}>
            <TouchableOpacity
              style={[previewStyles.cancelBtn, { borderColor: theme.card.border }, upgrading && { opacity: 0.5 }]}
              onPress={onCancel}
              disabled={upgrading}
            >
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>KEEP EDITING</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[previewStyles.startBtn, upgrading && { opacity: 0.7 }]}
              onPress={onUpgrade}
              disabled={upgrading}
            >
              {upgrading ? (
                <LeapLogo size={22} animated />
              ) : (
                <>
                  <Text style={previewStyles.startBtnText}>UPGRADE TO SAVE</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const upgradeStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingTop: 28,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(200,160,64,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,160,64,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 21,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 12,
  },
  dayCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(200,160,64,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,160,64,0.3)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  dayCountText: {
    color: bronzeGold,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  body: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
});

// Library template days are authored as "{FOCUS} DAY {N} | {Section}" (e.g.
// "PUSH DAY 1 | Strength - 1", "FULL BODY DAY 3 | Warm-Up") — getTemplateDetails
// already splits off the "| Section" part into blockName, so block.day here is
// "PUSH DAY 1" etc. This pulls the day number and focus back out of that so the
// preview can show just "DAY 1 — PUSH" once per day, not once per section.
function parseDayLabel(day: string): { dayNumber: number; focus: string } | null {
  const match = day.match(/^(.*?)\s*DAY\s*(\d+)\s*$/i);
  if (!match) return null;
  return { focus: match[1].trim(), dayNumber: parseInt(match[2], 10) };
}

function summarizeWeek1Days(week1: TemplateDetailBlock[]): { key: string; label: string; sortOrder: number }[] {
  const seen = new Map<string, { label: string; sortOrder: number }>();
  week1.forEach((block, i) => {
    if (seen.has(block.day)) return;
    const parsed = parseDayLabel(block.day);
    const label = parsed ? `DAY ${parsed.dayNumber} — ${parsed.focus.toUpperCase()}` : block.day.toUpperCase();
    seen.set(block.day, { label, sortOrder: parsed?.dayNumber ?? i });
  });
  return Array.from(seen.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ProgramPreviewModal({
  visible,
  theme,
  templateName,
  weekCount,
  week1,
  loading,
  starting,
  switchWarning,
  onCancel,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  theme: any;
  templateName: string;
  weekCount: number;
  week1: TemplateDetailBlock[];
  loading: boolean;
  starting: boolean;
  switchWarning: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  // iOS-only native signal (RN's Modal never calls this on Android) that
  // the dismiss animation has actually finished — see BuildSummaryModal's
  // onDismiss (SharedWorkoutModals.tsx) for why ProgramTemplatesScreen
  // wants this instead of a guessed delay before navigating to /paywall.
  onDismiss?: () => void;
}) {
  const days = summarizeWeek1Days(week1);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} onDismiss={onDismiss}>
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
          <View style={previewStyles.header}>
            <Text style={[previewStyles.title, { color: theme.text.primary }]} numberOfLines={2}>
              {templateName.toUpperCase()}
            </Text>
            <Text style={previewStyles.subtitle}>
              WEEK 1 OF {weekCount} — WHAT YOU'LL START WITH
            </Text>
          </View>

          {switchWarning && (
            <View style={previewStyles.warningBanner}>
              <MaterialCommunityIcons name="alert-outline" size={14} color={bronzeGold} />
              <Text style={previewStyles.warningText}>{switchWarning}</Text>
            </View>
          )}

          <ScrollView
            style={[previewStyles.body, { flex: undefined, minHeight: 140, maxHeight: 320 }]}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {loading ? (
              <View style={previewStyles.loadingBox}>
                <LeapLogo size={32} animated />
                <Text style={[previewStyles.loadingText, { color: theme.text.tertiary }]}>LOADING PREVIEW...</Text>
              </View>
            ) : days.length === 0 ? (
              <Text style={[previewStyles.emptyText, { color: theme.text.tertiary }]}>
                PREVIEW UNAVAILABLE — YOU CAN STILL START THE PROGRAM.
              </Text>
            ) : (
              days.map(d => (
                <View key={d.key} style={[previewStyles.dayRow, { borderColor: theme.card.border }]}>
                  <Text style={[previewStyles.dayRowText, { color: theme.text.primary }]} numberOfLines={1}>
                    {d.label}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={previewStyles.actions}>
            <TouchableOpacity
              style={[previewStyles.cancelBtn, { borderColor: theme.card.border }]}
              onPress={onCancel}
              disabled={starting}
            >
              <Text style={[previewStyles.cancelBtnText, { color: theme.text.secondary }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[previewStyles.startBtn, { opacity: starting ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={starting}
            >
              {starting ? (
                <LeapLogo size={22} animated />
              ) : (
                <>
                  <Text style={previewStyles.startBtnText}>START NOW</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#000" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  sectionLabel: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 12,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
});

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: '82%',
    padding: 20,
    overflow: 'hidden',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: bronzeGold,
    marginTop: 4,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(200,160,64,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,160,64,0.35)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    color: bronzeGold,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  // flex:1 (not just marginBottom) is required for this to actually
  // scroll internally — without it, the ScrollView sizes to its full
  // content height instead of the space remaining under the card's
  // maxHeight, pushing the footer buttons (CLOSE / ADD AS DAY N) below the
  // visible card for any workout with enough exercises to overflow.
  body: {
    flex: 1,
    marginBottom: 16,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  emptyText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingVertical: 24,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dayRowText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 15,
    letterSpacing: 1,
  },
  metaSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockCountText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exercisePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  exercisePillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 12.5,
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  startBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: bronzeGold,
    borderRadius: 10,
    paddingVertical: 15,
    gap: 8,
  },
  startBtnText: {
    color: '#000',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  removeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 10,
    paddingVertical: 15,
    gap: 6,
  },
  removeBtnText: {
    color: '#FF6B6B',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});

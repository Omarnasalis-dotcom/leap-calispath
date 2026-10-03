import React, { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n';
import type { Feel } from './FeelRpePicker';
import type { MissedReason } from './MissedReasonPicker';

// Log Block sheet — design handoff assets/design_handoff_log_workout_sheet
// (README.md is the spec). Fixed dark palette,
// like the rest of the workout runner. All state lives in
// WarriorProgramScreen; this component only renders and reports changes.

const C = {
  sheet: '#141416',
  card: '#0E0E10',
  control: '#18181B',
  control2: '#1C1C20',
  input: '#0C0C0E',
  border: '#222226',
  border2: '#26262A',
  border3: '#2A2A2E',
  border4: '#2E2E34',
  divider: '#1F1F23',
  white: '#FFFFFF',
  secondary: '#C8C8D0',
  muted: '#8A8A94',
  faint: '#6E6E78',
  faint2: '#5E5E68',
  coral: '#FF6A4D',
  coralLight: '#FF8A6D',
  coralTint: '#2A1512',
  green: '#4CD964',
  greenTint: '#16301B',
  greenBorder: '#2F6B35',
  greenText: '#7FE08C',
  greenSub: '#5FB86B',
  amber: '#E0B54A',
  amberTint: '#2E2610',
  amberInk: '#1A1406',
  grabber: '#3A3A40',
  ink: '#0C0C0E',
};
const GRADIENT = ['#8A5CD0', '#FF5A55', '#FF7A45'] as const;
const GRADIENT_STOPS = [0, 0.6, 1] as const;
const COND_800 = 'BarlowCondensed-ExtraBold';
const COND_700 = 'BarlowCondensed-Bold';
const BODY = 'Barlow-Regular';

export type SheetStatus = 'completed' | 'missed';
export type SheetKind = 'sets' | 'amrap' | 'fortime' | 'ladder' | 'timer';

/** One card in SETS / ROUNDS. For circuits/supersets there is one card for
 * the whole round structure. */
export interface SheetCard {
  id: string;
  name: string;
  /** Planned sets (rounds for circuits). */
  plan: number;
  /** Sets ticked on the block card — locked, the count can't go below. */
  ticked: number;
  /** Bottom line on a counted tile: "6 reps", "10s" or "done". */
  repsLabel: string | null;
  /** Shows the Top set (kg) stepper. */
  weighted: boolean;
  /** Shows the Hold (s) stepper. */
  hold: boolean;
  /** Per-tile bottom line instead of repsLabel (ladder rungs: "10 reps"). */
  tileLabels?: string[];
  /** Starting count when nothing was ticked (default: the full plan). */
  defaultCount?: number;
  /** Tabata: the status line reads "All done" / "3 of 6", never "untouched". */
  roundsStatus?: boolean;
}

const RPE_WORDS = ['rpe1', 'rpe2', 'rpe3', 'rpe4', 'rpe5', 'rpe6', 'rpe7', 'rpe8', 'rpe9', 'rpe10'] as const;
const FEELS: Feel[] = ['hard', 'ok', 'good', 'strong', 'beast'];
const REASONS: MissedReason[] = ['no_time', 'too_tired', 'injury', 'other'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtKg = (n: number) => String(Math.round(n * 10) / 10);

export interface LogBlockSheetProps {
  visible: boolean;
  onClose: () => void;
  blockName: string;
  kind: SheetKind;
  /** Circuit/superset: section reads ROUNDS. */
  isRounds: boolean;
  status: SheetStatus;
  setStatus: (s: SheetStatus) => void;
  cards: SheetCard[];
  counts: Record<string, number>;
  setCount: (id: string, n: number) => void;
  /** Whether the athlete changed a card (drives its status line). */
  touched: Record<string, boolean>;
  topKg: Record<string, number>;
  setTopKg: (id: string, kg: number) => void;
  holdSecs: Record<string, number>;
  setHoldSecs: (id: string, s: number) => void;
  amrap: { rounds: number; reps: number; capLabel: string | null };
  setAmrap: (v: { rounds: number; reps: number }) => void;
  forTime: { min: number; sec: number; cap: boolean };
  setForTime: (v: { min: number; sec: number; cap: boolean }) => void;
  ladder: { result: string | null };
  feel: Feel | null;
  setFeel: (f: Feel | null) => void;
  rpe: number | null;
  setRpe: (n: number | null) => void;
  reason: MissedReason | null;
  setReason: (r: MissedReason) => void;
  note: string;
  setNote: (s: string) => void;
  noteOpen: boolean;
  setNoteOpen: (v: boolean) => void;
  phase: 'form' | 'saving' | 'saved';
  error: string | null;
  onSubmit: () => void;
  savedSummary: string;
}

export function LogBlockSheet(p: LogBlockSheetProps) {
  const insets = useSafeAreaInsets();
  const isDone = p.status === 'completed';
  const ready = isDone || !!p.reason;
  const saving = p.phase === 'saving';

  // Swipe down on the grabber / header = cancel.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) p.onClose();
      },
    }),
  ).current;

  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={p.onClose} accessibilityLabel={t('logSheet.close')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
          <View style={s.sheet}>
            <View {...pan.panHandlers}>
              <View style={s.grabberRow}>
                <View style={s.grabber} />
              </View>
              {p.phase !== 'saved' && (
                <View style={s.header}>
                  <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                    <Text style={s.blockName} numberOfLines={2}>
                      {p.blockName}
                    </Text>
                    <TouchableOpacity
                      style={s.pill}
                      onPress={() => p.setStatus(isDone ? 'missed' : 'completed')}
                      accessibilityRole="button"
                      accessibilityHint={t('logSheet.changeStatus')}
                    >
                      <View style={[s.pillDot, { backgroundColor: isDone ? C.green : C.amber }]} />
                      <Text style={s.pillLabel}>{isDone ? t('logSheet.completed') : t('logSheet.skipped')}</Text>
                      <Text style={s.pillChange}>{t('logSheet.change')}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={s.close}
                    onPress={p.onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('logSheet.close')}
                  >
                    <Text style={s.closeX}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {p.phase === 'saved' ? (
              <Saved isDone={isDone} title={isDone ? t('logSheet.savedTitle', { block: p.blockName.toUpperCase() }) : t('logSheet.savedMissTitle')} summary={p.savedSummary} />
            ) : (
              <>
                <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
                  {isDone && (p.kind === 'sets' || p.kind === 'ladder' || p.kind === 'timer') && p.cards.length > 0 && (
                    <View style={{ gap: 8 }}>
                      <SectionLabel
                        label={p.kind === 'ladder' ? t('logSheet.ladder') : p.isRounds || p.kind === 'timer' ? t('logSheet.rounds') : t('logSheet.sets')}
                        helper={p.kind === 'ladder' ? t('logSheet.ladderHelper') : t('logSheet.setsHelper')}
                      />
                      {p.cards.map((card) => (
                        <SetsCard key={card.id} card={card} {...p} />
                      ))}
                    </View>
                  )}

                  {isDone && p.kind === 'amrap' && (
                    <View style={{ gap: 10 }}>
                      <SectionLabel label={p.amrap.capLabel ? t('logSheet.amrapScoreCap', { cap: p.amrap.capLabel }) : t('logSheet.amrapScore')} />
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <BigStepper
                          label={t('logSheet.amrapRounds')}
                          value={p.amrap.rounds}
                          onChange={(v) => p.setAmrap({ rounds: v, reps: p.amrap.reps })}
                        />
                        <BigStepper
                          label={t('logSheet.amrapReps')}
                          value={p.amrap.reps}
                          onChange={(v) => p.setAmrap({ rounds: p.amrap.rounds, reps: v })}
                        />
                      </View>
                    </View>
                  )}

                  {isDone && p.kind === 'fortime' && <ForTime {...p} />}


                  {isDone && <FeelRpe {...p} />}

                  {!isDone && (
                    <View style={{ gap: 10 }}>
                      <SectionLabel label={t('logSheet.whyMissed')} />
                      <View style={s.reasonGrid}>
                        {REASONS.map((r) => {
                          const on = p.reason === r;
                          return (
                            <TouchableOpacity
                              key={r}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              onPress={() => p.setReason(r)}
                              style={[s.reason, on && { borderColor: C.amber, backgroundColor: C.amberTint }]}
                            >
                              <Text style={[s.reasonText, on && { color: C.amber }]}>{t(`logModal.missed_${r}`)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {p.noteOpen ? (
                    <TextInput
                      style={s.note}
                      value={p.note}
                      onChangeText={p.setNote}
                      placeholder={isDone ? t('logSheet.notePlaceholder') : t('logSheet.notePlaceholderMissed')}
                      placeholderTextColor={C.faint}
                      multiline
                      maxLength={1000}
                      autoFocus={!p.note}
                      textAlignVertical="top"
                    />
                  ) : (
                    <TouchableOpacity style={s.addNote} onPress={() => p.setNoteOpen(true)} accessibilityRole="button">
                      <Text style={s.addNotePlus}>+</Text>
                      <Text style={s.addNoteText}>{isDone ? t('logSheet.addNote') : t('logSheet.addDetails')}</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                <View style={[s.footer, { paddingBottom: 14 + Math.max(insets.bottom, 20) }]}>
                  {p.error && <Text style={s.error}>{p.error}</Text>}
                  <TouchableOpacity
                    onPress={p.onSubmit}
                    disabled={!ready || saving}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !ready || saving, busy: saving }}
                  >
                    {ready && isDone ? (
                      <LinearGradient colors={GRADIENT} locations={GRADIENT_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.cta}>
                        <Text style={[s.ctaText, { color: C.white }]}>{saving ? t('logSheet.saving') : t('logSheet.logBlock')}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[s.cta, { backgroundColor: ready ? C.amber : C.border }]}>
                        <Text style={[s.ctaText, { color: ready ? C.amberInk : C.faint2 }]}>
                          {saving ? t('logSheet.saving') : ready ? t('logSheet.logMissed') : t('logSheet.pickReason')}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SectionLabel({ label, helper }: { label: string; helper?: string }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{label}</Text>
      {helper ? <Text style={s.helper}>{helper}</Text> : null}
    </View>
  );
}

function SetsCard({
  card,
  counts,
  setCount,
  touched,
  topKg,
  setTopKg,
  holdSecs,
  setHoldSecs,
}: { card: SheetCard } & LogBlockSheetProps) {
  const count = counts[card.id] ?? (card.ticked > 0 ? card.ticked : card.defaultCount ?? card.plan);
  const isTouched = touched[card.id];
  const status =
    count === 0
      ? t('logSheet.notDone')
      : !isTouched && card.ticked === 0 && count === card.plan && !card.roundsStatus
        ? t('logSheet.untouched')
        : count > card.ticked && card.ticked > 0
          ? t('logSheet.tickedAdded', { ticked: card.ticked, added: count - card.ticked })
          : count === card.plan
            ? t('logSheet.allDone')
            : t('logSheet.countOf', { count, plan: card.plan });
  const kg = topKg[card.id] ?? 0;
  const secs = holdSecs[card.id] ?? 1;

  return (
    <View style={[s.card, s.setsCard]}>
      {/* Name + status on the left, count on the right: the status line lives
          up here so the card only grows a bottom row for a stepper. */}
      <View style={s.cardTop}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.exName} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={[s.cardStatus, count === 0 && { color: C.amber }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
        <Text style={s.count}>
          {count}
          <Text style={s.countPlan}> / {card.plan}</Text>
        </Text>
      </View>
      <View style={s.tiles}>
        {Array.from({ length: card.plan }, (_, k) => {
          const n = k + 1;
          const ticked = n <= card.ticked;
          const on = n <= count;
          // ✓ = done (ticked on the card, or counted here), ✕ = not done;
          // the set number moves to the small line.
          const detail = ticked
            ? t('logSheet.ticked')
            : on
              ? card.tileLabels?.[k] ?? (card.hold ? `${secs}s` : card.repsLabel ?? t('logSheet.done'))
              : card.tileLabels?.[k] ?? null;
          // Ladder tiles show just the rung's reps ("18"); sets tiles show
          // the set number with their detail ("2 · 12 reps").
          const bottom = card.tileLabels ? card.tileLabels[k] : detail ? `${n} · ${detail}` : String(n);
          return (
            <TouchableOpacity
              key={n}
              disabled={ticked}
              accessibilityRole="button"
              accessibilityLabel={`${t('logSheet.setTile', { n })} · ${on ? t('logSheet.done') : t('logSheet.notDoneShort')}`}
              accessibilityState={{ selected: on, disabled: ticked }}
              onPress={() => setCount(card.id, count === n && n > card.ticked ? n - 1 : n)}
              style={[
                s.tile,
                ticked
                  ? { backgroundColor: C.green, borderColor: C.green }
                  : on
                    ? { backgroundColor: C.greenTint, borderColor: C.greenBorder }
                    : { backgroundColor: C.control, borderColor: C.border2 },
              ]}
            >
              <Text style={[s.tileTop, { color: ticked ? C.ink : on ? C.greenText : C.faint2 }]}>{on ? '✓' : '✕'}</Text>
              <Text style={[s.tileBottom, { color: ticked ? C.ink : on ? C.greenSub : '#4A4A52' }]} numberOfLines={1}>
                {bottom}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {(card.weighted || card.hold) && (
        <View style={s.cardBottom}>
          <View style={s.stepper}>
            <Text style={s.stepperLabel}>{card.weighted ? t('logSheet.topSet') : t('logSheet.hold')}</Text>
            <TouchableOpacity
              style={s.stepBtn}
              accessibilityRole="button"
              accessibilityLabel={t('logSheet.decrease')}
              onPress={() => (card.weighted ? setTopKg(card.id, Math.max(0, kg - 2.5)) : setHoldSecs(card.id, Math.max(1, secs - 1)))}
            >
              <Text style={s.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.stepValue}>{card.weighted ? `${fmtKg(kg)} ${t('progress.kg')}` : `${secs} ${t('logSheet.sec')}`}</Text>
            <TouchableOpacity
              style={s.stepBtn}
              accessibilityRole="button"
              accessibilityLabel={t('logSheet.increase')}
              onPress={() => (card.weighted ? setTopKg(card.id, kg + 2.5) : setHoldSecs(card.id, secs + 1))}
            >
              <Text style={s.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function BigStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={[s.card, { flex: 1, alignItems: 'center', gap: 8, padding: 14 }]}>
      <Text style={[s.label, { fontSize: 12 }]}>{label}</Text>
      <Text style={s.bigNum}>{value}</Text>
      <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'stretch' }}>
        <TouchableOpacity style={s.bigBtn} onPress={() => onChange(Math.max(0, value - 1))} accessibilityLabel={t('logSheet.decrease')}>
          <Text style={s.bigBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.bigBtn} onPress={() => onChange(value + 1)} accessibilityLabel={t('logSheet.increase')}>
          <Text style={s.bigBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ForTime({ forTime, setForTime }: LogBlockSheetProps) {
  const { min, sec, cap } = forTime;
  const part = (val: number, onUp: () => void, onDown: () => void, label: string) => (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <TouchableOpacity style={s.timeBtn} onPress={onUp} accessibilityLabel={`${label} +`}>
        <Text style={s.timeArrow}>▲</Text>
      </TouchableOpacity>
      <Text style={s.timeNum}>{pad2(val)}</Text>
      <TouchableOpacity style={s.timeBtn} onPress={onDown} accessibilityLabel={`${label} −`}>
        <Text style={s.timeArrow}>▼</Text>
      </TouchableOpacity>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel label={t('logSheet.timeToFinish')} />
      <View style={[s.card, { opacity: cap ? 0.35 : 1 }]}>
        {/* Time reads left-to-right in every language. */}
        <View style={{ flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {part(min, () => setForTime({ min: min + 1, sec, cap }), () => setForTime({ min: Math.max(0, min - 1), sec, cap }), t('logSheet.minutes'))}
          <Text style={s.timeColon}>:</Text>
          {part(sec, () => setForTime({ min, sec: (sec + 1) % 60, cap }), () => setForTime({ min, sec: (sec + 59) % 60, cap }), t('logSheet.seconds'))}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setForTime({ min, sec, cap: !cap })}
        accessibilityRole="switch"
        accessibilityState={{ checked: cap }}
        style={[s.capBtn, cap && { borderColor: C.coral, backgroundColor: C.coralTint }]}
      >
        <Text style={[s.capText, cap && { color: C.coralLight }]}>{cap ? t('logSheet.capHit') : t('logSheet.capQuestion')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function FeelRpe({ feel, setFeel, rpe, setRpe }: LogBlockSheetProps) {
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel label={t('logSheet.feel')} helper={t('logSheet.optional')} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {FEELS.map((f) => {
          const on = feel === f;
          return (
            <TouchableOpacity
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFeel(on ? null : f)}
              style={[s.feel, on && { borderColor: C.coral, backgroundColor: C.coralTint }]}
            >
              <Text style={[s.feelText, on && { color: C.coral }]} numberOfLines={1} adjustsFontSizeToFit>
                {t(`logModal.feel_${f}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[s.labelRow, { marginTop: 2 }]}>
        <Text style={s.label}>{t('logSheet.rpe')}</Text>
        <Text style={[s.rpeWord, { color: rpe ? C.coralLight : C.faint }]}>
          {rpe ? `${rpe} · ${t(`logSheet.${RPE_WORDS[rpe - 1]}`)}` : t('logSheet.optional')}
        </Text>
      </View>
      {/* The effort scale reads 1 → 10 left-to-right in every language. */}
      <View style={{ flexDirection: 'row', direction: 'ltr', gap: 3 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const v = i + 1;
          const lit = rpe != null && v <= rpe;
          return (
            <TouchableOpacity
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`RPE ${v}`}
              accessibilityState={{ selected: rpe === v }}
              onPress={() => setRpe(rpe === v ? null : v)}
              style={[
                s.rpeCell,
                i === 0 && { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
                i === 9 && { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
                { backgroundColor: lit ? `rgba(255,106,77,${0.25 + v * 0.075})` : C.control },
              ]}
            >
              <Text style={[s.rpeNum, { color: lit ? C.white : C.faint }]}>{v}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Saved({ isDone, title, summary }: { isDone: boolean; title: string; summary: string }) {
  const inner = (
    <View style={s.checkMark} />
  );
  return (
    <View style={s.saved} accessibilityLiveRegion="polite">
      {isDone ? (
        <LinearGradient colors={GRADIENT} locations={GRADIENT_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.savedCircle}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[s.savedCircle, { backgroundColor: C.amber }]}>{inner}</View>
      )}
      <Text style={s.savedTitle}>{title}</Text>
      {summary ? <Text style={s.savedSub}>{summary}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    backgroundColor: C.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: C.border3,
    flexShrink: 1,
  },
  grabberRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.grabber },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 14 },
  blockName: { fontFamily: COND_800, fontSize: 28, lineHeight: 30, letterSpacing: 0.5, color: C.white },
  pill: {
    alignSelf: 'flex-start',
    height: 32,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border3,
    backgroundColor: C.control2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLabel: { fontFamily: COND_700, fontSize: 14, letterSpacing: 1.5, color: C.white },
  pillChange: { fontFamily: BODY, fontSize: 13, color: C.muted },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  closeX: { color: C.muted, fontSize: 22, lineHeight: 24 },

  body: { flexGrow: 0 },
  bodyContent: { paddingTop: 4, paddingHorizontal: 22, paddingBottom: 20, gap: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  label: { fontFamily: COND_700, fontSize: 14, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' },
  helper: { fontFamily: BODY, fontSize: 12, color: C.faint, flexShrink: 1, textAlign: 'right' },

  card: { borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 16 },
  setsCard: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  exName: { fontFamily: BODY, fontSize: 16, fontWeight: '600', color: C.white },
  count: { fontFamily: COND_800, fontSize: 22, color: C.white },
  countPlan: { fontSize: 14, color: C.faint },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, height: 42, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 0 },
  tileTop: { fontFamily: COND_800, fontSize: 16, lineHeight: 18 },
  tileBottom: { fontFamily: BODY, fontSize: 10, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  cardStatus: { fontFamily: BODY, fontSize: 12, fontWeight: '600', color: C.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.control2, borderRadius: 12, padding: 3 },
  stepperLabel: { fontFamily: BODY, fontSize: 12, color: C.muted, paddingHorizontal: 8 },
  stepBtn: { width: 36, height: 36, borderRadius: 9, backgroundColor: C.border3, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: C.white, fontSize: 18, lineHeight: 20 },
  stepValue: { fontFamily: COND_800, fontSize: 18, color: C.white, minWidth: 58, textAlign: 'center' },

  bigNum: { fontFamily: COND_800, fontSize: 52, lineHeight: 54, color: C.white },
  bigBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.control2, alignItems: 'center', justifyContent: 'center' },
  bigBtnText: { color: C.white, fontSize: 20, lineHeight: 22 },

  timeBtn: { width: 72, height: 32, borderRadius: 10, backgroundColor: C.control2, alignItems: 'center', justifyContent: 'center' },
  timeArrow: { color: C.muted, fontSize: 14 },
  timeNum: { fontFamily: COND_800, fontSize: 56, lineHeight: 58, color: C.white, fontVariant: ['tabular-nums'] },
  timeColon: { fontFamily: COND_800, fontSize: 48, color: C.faint, paddingBottom: 4 },
  capBtn: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border3, alignItems: 'center', justifyContent: 'center' },
  capText: { fontFamily: BODY, fontSize: 14, fontWeight: '600', color: C.muted },

  ladderBig: { fontFamily: COND_800, fontSize: 32, lineHeight: 36, color: C.white },
  ladderSub: { fontFamily: BODY, fontSize: 13, color: C.muted },

  feel: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.border2,
    backgroundColor: C.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  feelText: { fontFamily: COND_700, fontSize: 14, letterSpacing: 0.8, color: C.secondary },
  rpeWord: { fontFamily: BODY, fontSize: 13, fontWeight: '600' },
  rpeCell: { flex: 1, height: 38, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rpeNum: { fontFamily: COND_700, fontSize: 14 },

  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: {
    width: '48.5%',
    flexGrow: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border2,
    backgroundColor: C.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: { fontFamily: COND_700, fontSize: 17, letterSpacing: 1, color: C.secondary },

  addNote: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#33333A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addNotePlus: { fontSize: 20, lineHeight: 22, color: '#B0B0BA' },
  addNoteText: { fontFamily: BODY, fontSize: 15, color: C.muted },
  note: {
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border4,
    backgroundColor: C.input,
    color: C.white,
    fontFamily: BODY,
    fontSize: 15,
    padding: 14,
  },

  footer: { paddingTop: 14, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: C.divider, gap: 10 },
  error: { fontFamily: BODY, fontSize: 13, color: C.coralLight, textAlign: 'center' },
  cta: { height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: COND_800, fontSize: 20, letterSpacing: 2.5 },

  saved: { paddingTop: 36, paddingHorizontal: 22, paddingBottom: 56, alignItems: 'center', gap: 14 },
  savedCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  checkMark: {
    width: 30,
    height: 16,
    borderLeftWidth: 5,
    borderBottomWidth: 5,
    borderColor: C.white,
    transform: [{ rotate: '-45deg' }, { translateX: 2 }, { translateY: -3 }],
  },
  savedTitle: { fontFamily: COND_800, fontSize: 30, letterSpacing: 1, color: C.white, textAlign: 'center' },
  savedSub: { fontFamily: BODY, fontSize: 15, color: C.muted, maxWidth: 290, textAlign: 'center' },
});

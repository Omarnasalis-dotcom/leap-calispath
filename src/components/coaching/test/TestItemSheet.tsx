import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ProgramBlock } from '../../../types/warriorProgram';
import { GRADIENT, GRADIENT_STOPS, useSheetTheme, type Palette } from '../LogBlockSheet';
import { InlineVideoPlayer } from '../InlineVideoPlayer';
import {
  SKIP_REASONS,
  formatTestValue,
  holdOptions,
  isBarWeight,
  parseTestNumber,
  testErrorKey,
  testItemTitle,
  validateTestValue,
  whatsAppLink,
  type SkipReason,
  type TestCoach,
  type TestItem,
  type TestResult,
} from '../../../lib/testItems';
import { testKicker } from './TestItemCard';

// Log one Coach Test Week item. Same sheet design as LogBlockSheet (its
// palette and CTA are shared). The parent saves through TestItemService
// and reloads; this sheet only collects the result.

export interface TestSubmit {
  status: 'done' | 'skipped';
  value?: number | null;
  movementId?: string | null;
  skipReason?: SkipReason | null;
  skipDetail?: string | null;
}

const COND_800 = 'BarlowCondensed-ExtraBold';
const COND_700 = 'BarlowCondensed-Bold';
const BODY = 'Barlow-Regular';
// WhatsApp's dark teal: white bold text on it clears 4:1 (the bright
// #25D366 green is under 2:1).
const WHATSAPP_GREEN = '#128C7E';

export function TestItemSheet({
  visible,
  block,
  item,
  result,
  coach,
  weekNumber,
  onClose,
  onSubmit,
  onClear,
}: {
  visible: boolean;
  block: ProgramBlock;
  item: TestItem;
  result: TestResult | null;
  coach: TestCoach | null;
  weekNumber: number;
  onClose: () => void;
  /** Resolves when saved; throws the server error otherwise. */
  onSubmit: (p: TestSubmit) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const { C, s: base } = useSheetTheme();
  const s = useMemo(() => getStyles(C), [C]);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const options = holdOptions(item);
  const [mode, setMode] = useState<'log' | 'skip'>(result?.status === 'skipped' ? 'skip' : 'log');
  const [valueText, setValueText] = useState(result?.status === 'done' ? formatTestValue(result.value) : '');
  const [movementId, setMovementId] = useState<string | null>(
    result?.movement_id && options.some((o) => o.id === result.movement_id) ? result.movement_id : options[0]?.id ?? null,
  );
  const [reason, setReason] = useState<SkipReason | null>(result?.skip_reason ?? null);
  const [detail, setDetail] = useState(result?.skip_detail ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  // 60 s countdown (max reps) / stopwatch (max hold), from wall-clock time
  // so a slow JS thread can't stretch the minute.
  const [clockStart, setClockStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [timeUp, setTimeUp] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTick = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  };
  useEffect(() => stopTick, []);
  useEffect(() => {
    if (!visible) {
      stopTick();
      setClockStart(null);
    }
  }, [visible]);

  const elapsedMs = clockStart ? now - clockStart : 0;
  const countdownLeft = Math.max(0, 60 - Math.floor(elapsedMs / 1000));
  useEffect(() => {
    if (item.kind === 'max_reps' && clockStart && countdownLeft === 0) {
      stopTick();
      setClockStart(null);
      setTimeUp(true);
      Vibration.vibrate(500);
    }
  }, [countdownLeft, clockStart, item.kind]);

  const startClock = () => {
    setTimeUp(false);
    const start = Date.now();
    setClockStart(start);
    setNow(start);
    stopTick();
    tick.current = setInterval(() => setNow(Date.now()), 200);
  };
  const stopStopwatch = () => {
    if (!clockStart) return;
    const secs = Math.floor((Date.now() - clockStart) / 1000);
    stopTick();
    setClockStart(null);
    if (secs > 0) setValueText(String(secs));
  };

  const title = testItemTitle(block);
  const demoUrl = block.exercises.find((e) => !!e.youtube_url)?.youtube_url || '';
  const instructions = [block.notes, ...block.exercises.map((e) => e.notes)].map((n) => (n || '').trim()).filter(Boolean);
  const waLink = whatsAppLink(
    coach?.whatsapp,
    t('testWeek.whatsAppMessage', {
      coach: coach?.name || t('testWeek.whatsAppCoachFallback'),
      item: title,
      week: weekNumber,
    }),
  );

  const run = async (p: TestSubmit) => {
    setError(null);
    setSaving(true);
    try {
      await onSubmit(p);
    } catch (e) {
      setError(t(testErrorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  const submitLog = () => {
    if (item.kind === 'form_check') {
      run({ status: 'done' });
      return;
    }
    const value = parseTestNumber(valueText);
    const check = validateTestValue(item.kind, value);
    if (check !== 'ok') {
      setError(check === 'whole' ? t('testWeek.wholeReps') : t('testWeek.enterValue'));
      return;
    }
    run({ status: 'done', value, movementId: item.kind === 'max_hold' ? movementId : null });
  };

  const submitSkip = () => {
    if (!reason) return;
    run({ status: 'skipped', skipReason: reason, skipDetail: detail.trim() || null });
  };

  const confirmClear = () => {
    Alert.alert(t('testWeek.clearTitle'), t('testWeek.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('testWeek.clearConfirm'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await onClear();
          } catch (e) {
            setError(t(testErrorKey(e)));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const openWhatsApp = () => {
    if (!waLink) return;
    Linking.openURL(waLink).catch(() => setError(t('testWeek.whatsAppFailed')));
  };

  const unitLabel =
    item.kind === 'max_reps'
      ? t('testWeek.repsLabel')
      : item.kind === 'one_rm'
      ? isBarWeight(item) ? t('testWeek.kgBarLabel') : t('testWeek.kgAddedLabel')
      : t('testWeek.secondsLabel');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={base.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('testWeek.close')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={base.sheetWrap}>
          <View style={base.sheet}>
            <View style={base.grabberRow}>
              <View style={base.grabber} />
            </View>
            <View style={base.header}>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={s.kicker} numberOfLines={1}>
                  {testKicker(item, result)}
                </Text>
                <Text style={base.blockName} numberOfLines={2}>
                  {title.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity style={base.close} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('testWeek.close')}>
                <Text style={base.closeX}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={base.body} contentContainerStyle={base.bodyContent} keyboardShouldPersistTaps="handled">
              {(instructions.length > 0 || !!demoUrl) && (
                <View style={[base.card, { gap: 10 }]}>
                  {instructions.length > 0 && (
                    <>
                      <Text style={base.label}>{t('testWeek.instructions')}</Text>
                      {instructions.map((line, i) => (
                        <Text key={i} style={s.body}>
                          {line}
                        </Text>
                      ))}
                    </>
                  )}
                  {!!demoUrl && (
                    <TouchableOpacity style={s.ghostBtn} onPress={() => setShowVideo((v) => !v)} accessibilityRole="button">
                      <MaterialCommunityIcons name={showVideo ? 'close' : 'play-circle-outline'} size={18} color={C.secondary} />
                      <Text style={s.ghostBtnText}>{showVideo ? t('testWeek.hideDemo') : t('testWeek.watchDemo')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {showVideo && !!demoUrl && <InlineVideoPlayer url={demoUrl} theme={theme} onClose={() => setShowVideo(false)} />}

              {mode === 'log' && item.kind === 'max_reps' && (
                <View style={{ gap: 10 }}>
                  <Text style={s.body}>{t('testWeek.maxRepsHow')}</Text>
                  <View style={[base.card, s.clockCard]}>
                    <Text style={[base.timeNum, timeUp && { color: C.coralText }]}>
                      {timeUp ? t('testWeek.timerDone') : `0:${String(clockStart ? countdownLeft : 60).padStart(2, '0')}`}
                    </Text>
                    <TouchableOpacity
                      style={s.clockBtn}
                      onPress={() => (clockStart ? (stopTick(), setClockStart(null)) : startClock())}
                      accessibilityRole="button"
                    >
                      <Text style={s.clockBtnText}>
                        {clockStart ? t('testWeek.timerStop') : timeUp ? t('testWeek.timerReset') : t('testWeek.timerStart')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ValueInput label={unitLabel} value={valueText} onChange={setValueText} decimal={false} C={C} s={s} />
                </View>
              )}

              {mode === 'log' && item.kind === 'one_rm' && (
                <View style={{ gap: 10 }}>
                  <Text style={s.body}>{isBarWeight(item) ? t('testWeek.oneRmHowBar') : t('testWeek.oneRmHowAdded')}</Text>
                  <ValueInput label={unitLabel} value={valueText} onChange={setValueText} decimal C={C} s={s} />
                </View>
              )}

              {mode === 'log' && item.kind === 'max_hold' && (
                <View style={{ gap: 10 }}>
                  <Text style={s.body}>{t('testWeek.holdHow')}</Text>
                  <Text style={base.label}>{t('testWeek.progressionLabel')}</Text>
                  <View style={s.optionRow}>
                    {options.map((o) => {
                      const on = o.id === movementId;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          style={[s.option, on && { borderColor: C.coral, backgroundColor: C.coralTint }]}
                          onPress={() => setMovementId(o.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[s.optionText, on && { color: C.coralText }]} numberOfLines={2}>
                            {o.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={[base.card, s.clockCard]}>
                    <Text style={base.timeNum}>{clockStart ? Math.floor(elapsedMs / 1000) : formatTestValue(parseTestNumber(valueText)) || '0'}</Text>
                    <TouchableOpacity
                      style={s.clockBtn}
                      onPress={() => (clockStart ? stopStopwatch() : startClock())}
                      accessibilityRole="button"
                    >
                      <Text style={s.clockBtnText}>{clockStart ? t('testWeek.stopwatchStop') : t('testWeek.stopwatchStart')}</Text>
                    </TouchableOpacity>
                  </View>
                  <ValueInput label={unitLabel} value={valueText} onChange={setValueText} decimal C={C} s={s} />
                </View>
              )}

              {mode === 'log' && item.kind === 'form_check' && (
                <View style={{ gap: 12 }}>
                  {[t('testWeek.formStep1'), t('testWeek.formStep2'), t('testWeek.formStep3')].map((step, i) => (
                    <View key={i} style={s.step}>
                      <View style={s.stepNum}>
                        <Text style={s.stepNumText}>{i + 1}</Text>
                      </View>
                      <Text style={[s.body, { flex: 1 }]}>{step}</Text>
                    </View>
                  ))}
                  {waLink ? (
                    <TouchableOpacity style={s.waBtn} onPress={openWhatsApp} accessibilityRole="button">
                      <MaterialCommunityIcons name="whatsapp" size={22} color="#FFFFFF" />
                      <Text style={s.waText}>{t('testWeek.sendWhatsApp')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={s.hint}>{t('testWeek.noWhatsApp')}</Text>
                  )}
                </View>
              )}

              {mode === 'skip' && (
                <View style={{ gap: 10 }}>
                  <Text style={base.label}>{t('testWeek.skipTitle')}</Text>
                  <View style={base.reasonGrid}>
                    {SKIP_REASONS.map((r) => {
                      const on = reason === r;
                      return (
                        <TouchableOpacity
                          key={r}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => setReason(r)}
                          style={[base.reason, on && { borderColor: C.amber, backgroundColor: C.amberTint }]}
                        >
                          <Text style={[base.reasonText, s.reasonText, on && { color: C.amberText }]} numberOfLines={2}>
                            {t(`testWeek.reason_${r}`)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={base.note}
                    value={detail}
                    onChangeText={setDetail}
                    placeholder={t('testWeek.skipDetailPlaceholder')}
                    placeholderTextColor={C.faint}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </ScrollView>

            <View style={[base.footer, { paddingBottom: 14 + Math.max(insets.bottom, 20) }]}>
              {!!error && <Text style={base.error}>{error}</Text>}
              {mode === 'log' ? (
                <TouchableOpacity
                  onPress={submitLog}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, busy: saving }}
                >
                  <LinearGradient colors={GRADIENT} locations={GRADIENT_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={base.cta}>
                    <Text style={[base.ctaText, { color: C.onColor }]}>
                      {saving ? t('testWeek.saving') : item.kind === 'form_check' ? t('testWeek.iSentIt') : t('testWeek.saveResult')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={submitSkip}
                  disabled={!reason || saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !reason || saving, busy: saving }}
                >
                  <View style={[base.cta, { backgroundColor: reason ? C.amber : C.border }]}>
                    <Text style={[base.ctaText, { color: reason ? C.amberInk : C.faint2 }]}>
                      {saving ? t('testWeek.saving') : reason ? t('testWeek.saveSkip') : t('testWeek.pickReason')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <View style={s.footerLinks}>
                <TouchableOpacity
                  onPress={() => {
                    setError(null);
                    setMode(mode === 'log' ? 'skip' : 'log');
                  }}
                  disabled={saving}
                  style={s.linkBtn}
                  accessibilityRole="button"
                >
                  <Text style={s.linkText}>{mode === 'log' ? t('testWeek.cantDo') : t('testWeek.back')}</Text>
                </TouchableOpacity>
                {!!result && (
                  <TouchableOpacity onPress={confirmClear} disabled={saving} style={s.linkBtn} accessibilityRole="button">
                    <Text style={[s.linkText, { color: C.faint }]}>{t('testWeek.clearResult')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ValueInput({
  label,
  value,
  onChange,
  decimal,
  C,
  s,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimal: boolean;
  C: Palette;
  s: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.inputLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={(v) => onChange(v.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, ''))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        placeholderTextColor={C.faint}
        maxLength={6}
        accessibilityLabel={label}
        returnKeyType="done"
      />
    </View>
  );
}

const getStyles = (C: Palette) =>
  StyleSheet.create({
    kicker: { fontFamily: COND_700, fontSize: 13, letterSpacing: 1.6, color: C.coralText },
    body: { fontFamily: BODY, fontSize: 15, lineHeight: 21, color: C.secondary },
    hint: { fontFamily: BODY, fontSize: 14, lineHeight: 20, color: C.muted },
    ghostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border3,
    },
    ghostBtnText: { fontFamily: COND_700, fontSize: 14, letterSpacing: 1.5, color: C.secondary },
    clockCard: { alignItems: 'center', gap: 12 },
    clockBtn: {
      minWidth: 140,
      height: 44,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: C.control2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clockBtnText: { fontFamily: COND_700, fontSize: 16, letterSpacing: 1.5, color: C.white },
    inputLabel: { fontFamily: COND_700, fontSize: 14, letterSpacing: 2, color: C.muted },
    input: {
      height: 64,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border4,
      backgroundColor: C.input,
      color: C.white,
      fontFamily: COND_800,
      fontSize: 34,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    optionRow: { flexDirection: 'row', gap: 8 },
    option: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: 6,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: C.border2,
      backgroundColor: C.control,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionText: { fontFamily: COND_700, fontSize: 14, letterSpacing: 0.5, color: C.secondary, textAlign: 'center' },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    stepNum: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.coralTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { fontFamily: COND_800, fontSize: 14, color: C.coralText },
    waBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 54,
      borderRadius: 16,
      backgroundColor: WHATSAPP_GREEN,
    },
    waText: { fontFamily: COND_800, fontSize: 17, letterSpacing: 1.5, color: '#FFFFFF' },
    reasonText: { fontSize: 15, textAlign: 'center', paddingHorizontal: 6 },
    footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
    linkBtn: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    linkText: { fontFamily: COND_700, fontSize: 14, letterSpacing: 1.4, color: C.muted },
  });

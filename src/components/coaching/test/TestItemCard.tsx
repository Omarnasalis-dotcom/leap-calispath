import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t, FLIP_X } from '../../../i18n';
import type { ProgramBlock } from '../../../types/warriorProgram';
import {
  formatTestValue,
  staticMovementName,
  testItemTitle,
  testMovementName,
  worldKeyFor,
  type TestItem,
  type TestResult,
} from '../../../lib/testItems';

// One Coach Test Week item in the workout runner, in the Day Blocks card
// style (WarriorBlockCard): rail, index plate, title, scheme line. The whole
// card opens TestItemSheet, where the result is logged.

const RED = '#FC5454';

const PALETTE = {
  dark: {
    card: '#0f0f0f',
    border: '#1f1f1f',
    borderDone: 'rgba(252,84,84,.32)',
    text: '#FFFFFF',
    muted: '#a0a0a0',
    chipBg: '#1a1a1a',
    chipBorder: '#242424',
    chipText: '#e6e6e6',
    btnBg: '#1a1a1a',
    accentText: '#FF6B6B',
    ok: '#7FE08C',
    okBg: 'rgba(76,217,100,.12)',
    warn: '#E0B54A',
    warnBg: 'rgba(224,181,74,.12)',
  },
  light: {
    card: '#FCFAFA',
    border: '#E5DADA',
    borderDone: 'rgba(201,48,48,.35)',
    text: '#2A2A2A',
    muted: '#5F5F5F',
    chipBg: '#F3EDED',
    chipBorder: '#E5DADA',
    chipText: '#4A4A4A',
    btnBg: 'rgba(0,0,0,.05)',
    accentText: '#C93030',
    ok: '#1E7A2E',
    okBg: '#E6F7E9',
    warn: '#8A6410',
    warnBg: '#FFF4DA',
  },
};

export function testValueLabel(r: Pick<TestResult, 'value' | 'unit'>): string {
  const value = formatTestValue(r.value);
  if (r.unit === 'reps') return t('testWeek.valueReps', { value });
  if (r.unit === 'kg') return t('testWeek.valueKg', { value });
  if (r.unit === 'seconds') return t('testWeek.valueSeconds', { value });
  return value;
}

/** "TEST · 1RM · Back Squat" */
export function testKicker(item: TestItem, result?: TestResult | null): string {
  const kicker = t(`testWeek.kicker_${item.kind}`);
  const target =
    item.kind === 'max_hold'
      ? staticMovementName(result?.movement_id)
      : testMovementName(item);
  return target ? `${kicker} · ${target.toUpperCase()}` : kicker;
}

export function TestItemCard({
  block,
  index,
  item,
  result,
  mode,
  onOpen,
}: {
  block: ProgramBlock;
  index: number;
  item: TestItem;
  result: TestResult | null;
  mode: 'light' | 'dark';
  onOpen: () => void;
}) {
  const C = PALETTE[mode];
  const done = result?.status === 'done';
  const skipped = result?.status === 'skipped';
  const title = testItemTitle(block).toUpperCase();
  const worldKey = worldKeyFor(item.kind);

  const chips: { label: string; tone: 'ok' | 'warn' | 'plain' }[] = [];
  if (done && result) {
    if (result.world_status === 'saved' && worldKey) {
      chips.push({ label: t('testWeek.worldSaved', { world: t(`testWeek.${worldKey}`) }), tone: 'plain' });
    } else if (result.world_status === 'locked' && worldKey) {
      chips.push({ label: t('testWeek.worldLocked', { world: t(`testWeek.${worldKey}`) }), tone: 'plain' });
    } else if (result.world_status === 'no_world') {
      chips.push({ label: t('testWeek.noWorld'), tone: 'plain' });
    }
    if (result.is_new_pb) chips.push({ label: t('testWeek.newPb'), tone: 'ok' });
  }
  if (result?.coach_grade) {
    chips.push({
      label: result.coach_grade === 'pass' ? t('testWeek.gradePass') : t('testWeek.gradeNeedsWork'),
      tone: result.coach_grade === 'pass' ? 'ok' : 'warn',
    });
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${testKicker(item, result)}, ${title}`}
      style={[s.card, { backgroundColor: C.card, borderColor: done ? C.borderDone : C.border }]}
    >
      <View style={[s.rail, { backgroundColor: skipped ? C.border : RED, opacity: done ? 1 : 0.6 }]} />
      <View style={s.row}>
        <View
          style={[
            s.plate,
            {
              borderColor: done ? RED : C.border,
              backgroundColor: done ? RED : 'rgba(252,84,84,.12)',
            },
          ]}
        >
          {done ? (
            <MaterialCommunityIcons name="check" size={20} color="#000" />
          ) : skipped ? (
            <Text style={[s.plateText, { color: C.muted }]}>–</Text>
          ) : (
            <Text style={[s.plateText, { color: RED }]}>{index + 1}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[s.kicker, { color: C.accentText }]} numberOfLines={1}>
            {testKicker(item, result)}
          </Text>
          <Text style={[s.title, { color: C.text }]} numberOfLines={2}>
            {title}
          </Text>
          {done && result?.unit ? (
            <Text style={[s.value, { color: C.text }]}>{testValueLabel(result)}</Text>
          ) : done && item.kind === 'form_check' ? (
            <Text style={[s.status, { color: C.ok }]}>{t('testWeek.formSent')}</Text>
          ) : skipped && result?.skip_reason ? (
            <Text style={[s.status, { color: C.warn }]} numberOfLines={1}>
              {t('testWeek.skippedLabel', { reason: t(`testWeek.reason_${result.skip_reason}`) })}
            </Text>
          ) : (
            <Text style={[s.status, { color: C.muted }]}>{t('testWeek.notLogged')}</Text>
          )}
        </View>
        <View style={[s.cta, { backgroundColor: C.btnBg }]}>
          <Text style={[s.ctaText, { color: result ? C.muted : C.accentText }]}>
            {result ? t('testWeek.change') : item.kind === 'form_check' ? t('testWeek.openFormCheck') : t('testWeek.logResult')}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={C.muted} style={FLIP_X} />
        </View>
      </View>
      {chips.length > 0 && (
        <View style={s.chips}>
          {chips.map((c) => (
            <View
              key={c.label}
              style={[
                s.chip,
                c.tone === 'ok'
                  ? { backgroundColor: C.okBg, borderColor: C.okBg }
                  : c.tone === 'warn'
                  ? { backgroundColor: C.warnBg, borderColor: C.warnBg }
                  : { backgroundColor: C.chipBg, borderColor: C.chipBorder },
              ]}
            >
              <Text
                style={[s.chipText, { color: c.tone === 'ok' ? C.ok : c.tone === 'warn' ? C.warn : C.chipText }]}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!!result?.coach_note && (
        <Text style={[s.note, { color: C.muted }]} numberOfLines={3}>
          {t('testWeek.coachNote', { note: result.coach_note })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { position: 'relative', borderRadius: 20, borderWidth: 1, overflow: 'hidden', paddingBottom: 14 },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 16, paddingLeft: 16, paddingRight: 12 },
  plate: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  plateText: { fontSize: 18, fontFamily: 'BarlowCondensed-Bold' },
  kicker: { fontFamily: 'BarlowCondensed-Bold', fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.2, lineHeight: 21 },
  value: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  status: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexShrink: 0,
  },
  ctaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 12, paddingLeft: 16, paddingRight: 12 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  chipText: { fontFamily: 'Barlow-Regular', fontSize: 12 },
  note: { fontFamily: 'Barlow-Regular', fontSize: 13, lineHeight: 18, paddingTop: 10, paddingLeft: 16, paddingRight: 12 },
});

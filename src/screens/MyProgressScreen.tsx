import React, { useCallback, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { LeapLogo } from '../components/LeapLogo';
import { localizedErrorText } from '../lib/asyncErrorHandler';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';
import {
  CompletionProgram,
  Feel,
  Performance,
  HOLD_MOVEMENTS,
  REP_MOVEMENTS,
  defaultProgram,
  fmtNum,
  getMyPerformance,
  movementWeeks,
  signed,
  weightedView,
  worldSeries,
  allMovementsSummary,
  toggleWeekPick,
  type WeekPick,
} from '../lib/performance';
import { ProgressLineChart, ProgressChartColors } from '../components/progress/ProgressLineChart';

// "My progress" (Train tab): the athlete's own Performance charts — the app
// twin of the admin panel's Performance section (admin-web), same data via
// get_my_performance(). Order: Bodyweight, Workouts completed, Main
// movements, Weighted lifts, World points, Effort & feel. The active program is the default.

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const wk = (n: number) => t('progress.weekShort', { n });

function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

export function MyProgressScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const isLight = mode === 'light';
  const styles = useMemo(() => getStyles(c), [c]);
  const chartColors: ProgressChartColors = {
    surface: c.cardFlat,
    grid: c.dividerStrong,
    faint: c.textFaint2,
    ink: c.textPrimary,
    muted: c.textMuted,
  };
  const positive = isLight ? '#1E8A4C' : '#3DD68C';

  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setData(await getMyPerformance());
    } catch (err) {
      setError(localizedErrorText(err, t('progress.loadFailed')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const programs = (data?.completion ?? []).filter((p) => p.weeks.length > 0);
  const program = defaultProgram(programs);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('progress.back')}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('progress.title')}</Text>
          {program && (
            <Text style={styles.headerSubline} numberOfLines={1}>
              {program.name.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ width: 26 }} />
      </View>

      {loading && !data && (
        <View style={styles.centerFill}>
          <LeapLogo size={40} animated />
        </View>
      )}

      {!loading && error && !data && (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryBtnText}>{t('progress.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.coral} />}
        >
          <BodyweightCard data={data.bodyweight} c={c} styles={styles} chartColors={chartColors} />
          <BlocksCard program={program} c={c} styles={styles} />
          <MovementsCard data={data} program={program} c={c} styles={styles} />
          <MovementsCard mode="holds" data={data} program={program} c={c} styles={styles} />
          <LiftsCard data={data} c={c} styles={styles} chartColors={chartColors} positive={positive} />
          <WorldsCard data={data} c={c} styles={styles} chartColors={chartColors} />
          <EffortCard program={program} c={c} styles={styles} chartColors={chartColors} />
        </ScrollView>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof getStyles>;

function Card({
  title,
  sub,
  side,
  styles,
  children,
}: {
  title: string;
  sub: string;
  side?: React.ReactNode;
  styles: Styles;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>{sub}</Text>
        </View>
        {side}
      </View>
      {children}
    </View>
  );
}

function Empty({ title, body, styles, c }: { title: string; body: string; styles: Styles; c: TCPalette }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyRing, { backgroundColor: c.dividerStrong }]}>
        <View style={[styles.emptyDot, { backgroundColor: c.textPrimary }]} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function Figure({ value, unit, note, styles }: { value: string; unit?: string; note?: string; styles: Styles }) {
  return (
    <View style={styles.figureRow}>
      <Text style={styles.figure}>
        {value}
        {unit ? <Text style={styles.figureUnit}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={styles.figureNote}>{note}</Text> : null}
    </View>
  );
}

// ---------- Bodyweight ----------

function BodyweightCard({
  data,
  c,
  styles,
  chartColors,
}: {
  data: Performance['bodyweight'];
  c: TCPalette;
  styles: Styles;
  chartColors: ProgressChartColors;
}) {
  const n = data.length;
  const last = n ? Number(data[n - 1].weight_kg) : null;
  const first = n ? Number(data[0].weight_kg) : null;
  return (
    <Card title={t('progress.bodyweight')} sub={t('progress.bodyweightSub')} styles={styles}>
      {last !== null && (
        // Neutral colour on purpose: a bodyweight change is neither good nor bad.
        <Figure
          value={fmtNum(last)}
          unit={t('progress.kg')}
          note={
            n > 1
              ? t('progress.kgSinceDate', { delta: signed(last - first!), date: shortDate(data[0].date) })
              : t('progress.loggedOn', { date: shortDate(data[0].date) })
          }
          styles={styles}
        />
      )}
      {n > 1 ? (
        <ProgressLineChart
          accessibilityLabel={t('progress.bodyweight')}
          labels={data.map((p) => shortDate(p.date))}
          series={[{ key: 'bw', color: c.textPrimary, values: data.map((p) => Number(p.weight_kg)) }]}
          colors={chartColors}
          unit={t('progress.kg')}
          step={1}
        />
      ) : n === 1 ? (
        <Empty title={t('progress.bwOneTitle')} body={t('progress.bwOneBody')} styles={styles} c={c} />
      ) : (
        <Empty title={t('progress.bwNoneTitle')} body={t('progress.bwNoneBody')} styles={styles} c={c} />
      )}
    </Card>
  );
}

// ---------- Blocks completed ----------

function BlocksCard({ program, c, styles }: { program: CompletionProgram | undefined; c: TCPalette; styles: Styles }) {
  if (!program) {
    return (
      <Card title={t('progress.blocks')} sub={t('progress.blocksSub')} styles={styles}>
        <Empty title={t('progress.noProgramTitle')} body={t('progress.noProgramBody')} styles={styles} c={c} />
      </Card>
    );
  }
  const total = program.weeks.reduce((s, w) => s + w.total, 0);
  const done = program.weeks.reduce((s, w) => s + w.completed, 0);
  return (
    <Card title={t('progress.blocks')} sub={t('progress.blocksSub')} styles={styles}>
      <Figure
        value={`${total ? Math.round((done / total) * 100) : 0}%`}
        note={`${t('progress.blocksSummary', { done, total })} · ${t('progress.weeks', { count: program.weeks.length })}`}
        styles={styles}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weeksRow}>
        {program.weeks.map((w) => {
          const pct = w.total ? Math.round((w.completed / w.total) * 100) : 0;
          const current = w.week === program.current_week;
          const dense = w.total > 16;
          return (
            <View
              key={w.week}
              style={styles.weekCol}
              accessible
              accessibilityLabel={t('progress.blocksWeek', { week: w.week, done: w.completed, total: w.total })}
            >
              <Text style={[styles.weekPct, current && { color: c.coral }]}>{pct}%</Text>
              <View style={[styles.weekStack, current && { borderColor: hexA(c.coral, 0.45) }]}>
                {Array.from({ length: w.total }, (_, k) => (
                  <View
                    key={k}
                    style={[
                      styles.blockCell,
                      dense && styles.blockCellDense,
                      {
                        backgroundColor:
                          k < w.completed ? (current ? c.coral : hexA(c.coral, 0.5)) : c.dividerStrong,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.weekLabel, current && { color: c.textPrimary }]}>{wk(w.week)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </Card>
  );
}

// ---------- Main movements (bodyweight reps) ----------

/** Movement chip value for the every-movement view. */
const ALL_MOVEMENTS = 'all';

/** "W3", "W2–W4" or "W1, W3, W6". */
function weeksLabel(weeks: number[]): string {
  const w = [...weeks].sort((a, b) => a - b);
  if (w.length === 1) return wk(w[0]);
  const consecutive = w.every((x, i) => i === 0 || x === w[i - 1] + 1);
  return consecutive ? `${wk(w[0])}–${wk(w[w.length - 1])}` : w.map(wk).join(', ');
}

function MovementsCard({
  data,
  mode = 'reps',
  program,
  c,
  styles,
}: {
  data: Performance;
  /** reps = Main movements, holds = Skill holds (seconds). */
  mode?: 'reps' | 'holds';
  /** Same program as Workouts completed: bars are its program weeks. */
  program: CompletionProgram | undefined;
  c: TCPalette;
  styles: Styles;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [weekSel, setWeekSel] = useState<number | null>(null);
  // All view: the weeks summed (default = the latest logged week).
  const [allWeek, setAllWeek] = useState<WeekPick>(null);
  // Variation colours in fixed order (most reps first); the rest are "Other".
  const varColors = [c.coral, c.static, c.oneMinMax];
  const otherColor = c.textFaint2;

  const isHolds = mode === 'holds';
  const title = isHolds ? t('progress.holds') : t('progress.movements');
  const sub = isHolds ? t('progress.holdsSub') : t('progress.movementsSub');
  // Hold weeks take the reps weeks' shape: total seconds as "reps", the
  // longest logged hold as "best".
  const fmtV = (n: number) => (isHolds ? t('progress.secondsShort', { n }) : String(n));
  const movements = (isHolds
    ? HOLD_MOVEMENTS.map((key) => ({
        key: key as (typeof HOLD_MOVEMENTS)[number] | (typeof REP_MOVEMENTS)[number],
        weeks: (data.holds?.find((m) => m.family === key)?.weeks ?? [])
          .filter((w) => w.program_id === program?.program_id)
          .map((w) => ({
            program_id: w.program_id,
            week: w.week,
            reps: Number(w.seconds),
            assumed: Number(w.assumed),
            best: Number(w.longest),
            bestVariation: w.longest_variation,
            variations: w.variations,
            sets: Number(w.sets ?? 0),
          })),
      }))
    : REP_MOVEMENTS.map((key) => ({
        key: key as (typeof HOLD_MOVEMENTS)[number] | (typeof REP_MOVEMENTS)[number],
        weeks: (data.movements?.find((m) => m.family === key)?.weeks ?? [])
          .filter((w) => w.program_id === program?.program_id)
          .map((w) => ({ ...w, bestVariation: null as string | null })),
      }))
  ).filter((m) => m.weeks.length > 0);

  if (movements.length === 0) {
    return (
      <Card title={title} sub={sub} styles={styles}>
        <Empty
          title={isHolds ? t('progress.holdsEmptyTitle') : t('progress.movementsEmptyTitle')}
          body={isHolds ? t('progress.holdsEmptyBody') : t('progress.movementsEmptyBody')}
          styles={styles}
          c={c}
        />
      </Card>
    );
  }
  // "All" chip: every movement side by side (only worth it with 2+).
  const allChip = movements.length > 1 && (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: picked === ALL_MOVEMENTS }}
      onPress={() => {
        setPicked(ALL_MOVEMENTS);
        setWeekSel(null);
      }}
      style={[styles.chip, picked === ALL_MOVEMENTS && styles.chipOn]}
    >
      <Text style={[styles.chipText, picked === ALL_MOVEMENTS && styles.chipTextOn]}>{t('progress.mvAll')}</Text>
    </Pressable>
  );
  const movementChips = (activeKey: string | null) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {allChip}
      {movements.map((m) => {
        const on = m.key === activeKey;
        return (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              setPicked(m.key);
              setWeekSel(null);
            }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`progress.mv_${m.key}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (picked === ALL_MOVEMENTS && movements.length > 1) {
    const sum = allMovementsSummary(movements, allWeek);
    const loggedWeeks = [...new Set(movements.flatMap((m) => m.weeks.map((w) => w.week)))].sort((a, b) => a - b).slice(-8);
    const weeksText = sum.allWeeks ? t('progress.allWeeksLower') : weeksLabel(sum.weeks);
    const maxRow = Math.max(1, ...sum.rows.map((r) => r.total));
    return (
      <Card title={title} sub={isHolds ? t('progress.allHoldsSub') : t('progress.allMovementsSub')} styles={styles}>
        {movementChips(null)}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sum.allWeeks }}
            onPress={() => setAllWeek('all')}
            style={[styles.chip, styles.chipSmall, sum.allWeeks && styles.chipOn]}
          >
            <Text style={[styles.chipText, sum.allWeeks && styles.chipTextOn]}>{t('progress.allWeeks')}</Text>
          </Pressable>
          {loggedWeeks.map((wk) => {
            const on = !sum.allWeeks && sum.weeks.includes(wk);
            return (
              <Pressable
                key={wk}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t('progress.weekLong', { n: wk })}
                onPress={() => setAllWeek(toggleWeekPick(allWeek, sum.allWeeks ? [] : sum.weeks, wk))}
                style={[styles.chip, styles.chipSmall, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{t('progress.weekShort', { n: wk })}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Figure
          value={String(sum.total)}
          unit={isHolds ? t('progress.secondsUnit') : undefined}
          note={[
            isHolds ? t('progress.allHeldIn', { weeks: weeksText }) : t('progress.allRepsIn', { weeks: weeksText }),
            sum.sets > 0 ? (isHolds ? t('progress.holdsCount', { count: sum.sets }) : t('progress.setsCount', { count: sum.sets })) : null,
            sum.assumed > 0
              ? isHolds
                ? t('progress.holdsAssumed', { n: sum.assumed })
                : t('progress.movementsAssumed', { count: sum.assumed })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          styles={styles}
        />
        <View style={styles.allList}>
          {sum.rows.map((r) => {
            const name = t(`progress.mv_${r.key}`);
            return (
              <Pressable
                key={r.key}
                accessibilityRole="button"
                accessibilityLabel={t('progress.allRowA11y', { name, value: fmtV(r.total) })}
                onPress={() => {
                  setPicked(r.key);
                  setWeekSel(null);
                }}
                style={({ pressed }) => [styles.allRow, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.allRowTop}>
                  <Text style={styles.allName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.allValue}>{fmtV(r.total)}</Text>
                </View>
                <View style={styles.allTrack}>
                  <View style={[styles.allFill, { width: `${(r.total / maxRow) * 100}%` }]}>
                    <View style={{ flex: Math.max(0, r.total - r.assumed), backgroundColor: c.coral }} />
                    {r.assumed > 0 && (
                      <View style={[styles.mvAssumed, { flex: r.assumed, borderColor: c.textFaint2 }]} />
                    )}
                  </View>
                </View>
                {r.sets > 0 && (
                  <Text style={styles.allSets}>
                    {isHolds ? t('progress.holdsCount', { count: r.sets }) : t('progress.setsCount', { count: r.sets })}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        {sum.assumed > 0 && (
          <View style={styles.feelLegend}>
            <View style={styles.feelLegendItem}>
              <View style={[styles.dot8, styles.mvAssumed, { borderColor: c.textFaint2 }]} />
              <Text style={styles.feelLegendText}>{t('progress.movementsAssumedLegend')}</Text>
            </View>
          </View>
        )}
      </Card>
    );
  }

  const movement = movements.find((m) => m.key === picked) ?? movements[0];
  const byWeek = new Map(movement.weeks.map((w) => [w.week, w]));
  const weeks = movementWeeks(movement.weeks, program?.current_week ?? 1);
  const totals = new Map<string, number>();
  movement.weeks.forEach((w) =>
    Object.entries(w.variations).forEach(([v, n]) => totals.set(v, (totals.get(v) ?? 0) + Number(n))),
  );
  const named = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  const top = named.slice(0, varColors.length);
  const colorOf = (v: string) => (top.includes(v) ? varColors[top.indexOf(v)] : otherColor);
  const label = (v: string) => v || t('progress.movementOther');
  const max = Math.max(1, ...weeks.map((w) => byWeek.get(w)?.reps ?? 0));
  const latest = movement.weeks[movement.weeks.length - 1];
  const selWeek = weekSel && byWeek.get(weekSel);

  return (
    <Card title={title} sub={sub} styles={styles}>
      {movementChips(movement.key)}
      <Figure
        value={String(latest.reps)}
        unit={isHolds ? t('progress.secondsUnit') : undefined}
        note={[
          isHolds ? t('progress.holdsHeldIn', { week: latest.week }) : t('progress.movementsRepsIn', { week: latest.week }),
          latest.assumed > 0
            ? isHolds
              ? t('progress.holdsAssumed', { n: latest.assumed })
              : t('progress.movementsAssumed', { count: latest.assumed })
            : null,
          latest.best > 0
            ? isHolds
              ? latest.bestVariation
                ? t('progress.holdsLongestVar', { n: latest.best, variation: latest.bestVariation })
                : t('progress.holdsLongest', { n: latest.best })
              : t('progress.movementsBest', { best: latest.best })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        styles={styles}
      />
      <View style={styles.mvReadout}>
        {selWeek ? (
          <Text style={styles.mvReadoutText}>
            {[
              isHolds
                ? t('progress.holdsWeek', { week: weekSel, n: selWeek.reps })
                : t('progress.movementsWeekReps', { week: weekSel, reps: selWeek.reps }),
              ...Object.entries(selWeek.variations).map(([v, n]) => `${label(v)} ${fmtV(Number(n))}`),
              selWeek.assumed > 0
                ? isHolds
                  ? t('progress.holdsAssumed', { n: selWeek.assumed })
                  : t('progress.movementsAssumed', { count: selWeek.assumed })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.mvBars}>
        {weeks.map((wk) => {
          const w = byWeek.get(wk);
          const parts = w
            ? Object.entries(w.variations).sort(
                (a, b) => (top.includes(a[0]) ? top.indexOf(a[0]) : 99) - (top.includes(b[0]) ? top.indexOf(b[0]) : 99),
              )
            : [];
          const on = weekSel === wk;
          return (
            <Pressable
              key={wk}
              style={styles.mvCol}
              onPress={() => setWeekSel(on ? null : wk)}
              accessibilityRole="button"
              accessibilityLabel={
                w
                  ? isHolds
                    ? t('progress.holdsWeek', { week: wk, n: w.reps })
                    : t('progress.movementsWeekReps', { week: wk, reps: w.reps })
                  : t('progress.weekLong', { n: wk })
              }
            >
              <Text style={[styles.mvValue, (on || wk === program?.current_week) && { color: c.coral }]}>
                {w ? fmtV(w.reps) : ''}
              </Text>
              <View style={styles.mvTrack}>
                <View style={[styles.mvStack, { height: `${((w?.reps ?? 0) / max) * 100}%` }, on && styles.mvStackOn]}>
                  {parts.map(([v, n]) => (
                    <View key={v} style={{ flexGrow: n, flexBasis: 0, minHeight: 2, backgroundColor: colorOf(v) }} />
                  ))}
                  {w && w.assumed > 0 && (
                    <View style={[styles.mvAssumed, { flexGrow: w.assumed, borderColor: c.textFaint2 }]} />
                  )}
                </View>
              </View>
              <Text
                style={[styles.mvLabel, on && { color: c.textPrimary }, wk === program?.current_week && { color: c.coral }]}
                numberOfLines={1}
              >
                {t('progress.weekShort', { n: wk })}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.feelLegend}>
        {top.map((v) => (
          <View key={v} style={styles.feelLegendItem}>
            <View style={[styles.dot8, { backgroundColor: colorOf(v) }]} />
            <Text style={styles.feelLegendText}>{label(v)}</Text>
          </View>
        ))}
        {named.length > top.length && (
          <View style={styles.feelLegendItem}>
            <View style={[styles.dot8, { backgroundColor: otherColor }]} />
            <Text style={styles.feelLegendText}>{t('progress.movementOther')}</Text>
          </View>
        )}
        {movement.weeks.some((w) => w.assumed > 0) && (
          <View style={styles.feelLegendItem}>
            <View style={[styles.dot8, styles.mvAssumed, { borderColor: c.textFaint2 }]} />
            <Text style={styles.feelLegendText}>{t('progress.movementsAssumedLegend')}</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// ---------- Weighted lifts ----------

function LiftsCard({
  data,
  c,
  styles,
  chartColors,
  positive,
}: {
  data: Performance;
  c: TCPalette;
  styles: Styles;
  chartColors: ProgressChartColors;
  positive: string;
}) {
  const [exercise, setExercise] = useState<string | null>(null);
  const [pickedProgram, setPickedProgram] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const slotColors = [c.coral, c.static, c.oneMinMax];

  if (data.weighted.length === 0) {
    return (
      <Card title={t('progress.lifts')} sub={t('progress.liftsSub')} styles={styles}>
        <Empty title={t('progress.liftsEmptyTitle')} body={t('progress.liftsEmptyBody')} styles={styles} c={c} />
      </Card>
    );
  }
  const movement = data.weighted.find((m) => m.exercise === exercise) ?? data.weighted[0];
  const activeId = data.completion.find((p) => p.status === 'active')?.program_id;
  const view = weightedView(movement, activeId, pickedProgram);
  const visible = view.slots
    .map((s, i) => ({ ...s, color: slotColors[i] }))
    .filter((s) => !hidden.includes(s.key));

  return (
    <Card title={t('progress.lifts')} sub={t('progress.liftsSub')} styles={styles}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {data.weighted.map((m) => {
          const on = m.exercise === movement.exercise;
          return (
            <Pressable
              key={m.exercise}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setExercise(m.exercise);
                setPickedProgram(null);
                setHidden([]);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.exercise}</Text>
              <Text style={styles.chipCount}>{m.points.length}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {view.programs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {view.programs.map((p) => {
            const on = p.id === view.programId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setPickedProgram(p.id);
                  setHidden([]);
                }}
                style={[styles.chip, styles.chipSmall, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {view.slots.length === 0 ? (
        <Empty title={t('progress.liftsEmptyTitle')} body={t('progress.liftsEmptyBody')} styles={styles} c={c} />
      ) : (
        <>
          <View style={styles.tiles}>
            {view.slots.map((s, i) => {
              const on = !hidden.includes(s.key);
              const delta = s.first && s.last && s.first.week !== s.last.week ? s.last.value - s.first.value : null;
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityHint={t('progress.tapToHide')}
                  onPress={() => setHidden((h) => (on ? [...h, s.key] : h.filter((k) => k !== s.key)))}
                  style={[styles.tile, !on && { opacity: 0.45 }]}
                >
                  <View style={styles.tileName}>
                    <View style={[styles.dot8, { backgroundColor: slotColors[i] }]} />
                    <Text style={styles.tileNameText} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                  <Text style={styles.tileValue}>
                    {fmtNum(s.last!.value)}
                    <Text style={styles.figureUnit}> {t('progress.kg')}</Text>
                  </Text>
                  {delta !== null && (
                    <Text style={[styles.tileDelta, delta > 0 && { color: positive }]}>
                      {t('progress.kgSinceWeek', { delta: signed(delta), week: s.first!.week })}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <ProgressLineChart
            accessibilityLabel={`${t('progress.lifts')} · ${movement.exercise}`}
            // A single logged week would be a lone dot: draw it as a line up from 0.
            labels={view.weeks.length === 1 ? [t('progress.chartStart'), wk(view.weeks[0])] : view.weeks.map(wk)}
            series={visible.map((s) => {
              const details = s.values.map((v, k) =>
                v === null ? null : `${fmtNum(v)} ${t('progress.kg')}${s.reps[k] != null ? ` × ${s.reps[k]}` : ''}`,
              );
              const oneWeek = view.weeks.length === 1;
              return {
                key: s.key,
                color: s.color,
                values: oneWeek ? [s.values[0] != null ? 0 : null, ...s.values] : s.values,
                details: oneWeek ? [null, ...details] : details,
              };
            })}
            colors={chartColors}
            unit={t('progress.kg')}
            step={5}
            floor={0}
          />
          {view.extraSlots > 0 && <Text style={styles.note}>{t('progress.moreSlots', { count: view.extraSlots })}</Text>}
        </>
      )}
    </Card>
  );
}

// ---------- World points ----------

function WorldsCard({
  data,
  c,
  styles,
  chartColors,
}: {
  data: Performance;
  c: TCPalette;
  styles: Styles;
  chartColors: ProgressChartColors;
}) {
  const worlds = (
    [
      { key: 'static', name: t('progress.worldStatic'), color: c.static },
      { key: 'onemm', name: t('progress.worldOnemm'), color: c.oneMinMax },
      { key: 'power', name: t('progress.worldPower'), color: c.power },
    ] as const
  )
    .map((w) => ({ ...w, series: worldSeries(data.worlds, w.key) }))
    .filter((w) => w.series.length > 0);

  return (
    <Card title={t('progress.worlds')} sub={t('progress.worldsSub')} styles={styles}>
      {worlds.length === 0 ? (
        <Empty title={t('progress.worldsEmptyTitle')} body={t('progress.worldsEmptyBody')} styles={styles} c={c} />
      ) : (
        <View style={styles.worlds}>
          {worlds.map((w) => {
            const v = w.series.map((s) => s.value);
            const last = v[v.length - 1];
            const delta = v.length > 1 ? last - v[v.length - 2] : null;
            return (
              <View key={w.key} style={[styles.world, { backgroundColor: hexA(w.color, 0.1) }]}>
                <View style={styles.worldTop}>
                  <Text style={[styles.worldName, { color: w.color }]} numberOfLines={1}>
                    {w.name}
                  </Text>
                  {delta !== null && (
                    <Text style={[styles.worldDelta, { color: w.color }]}>
                      {t('progress.thisWeek', { delta: signed(delta) })}
                    </Text>
                  )}
                </View>
                <Text style={styles.worldValue}>
                  {fmtNum(last)}
                  <Text style={styles.figureUnit}> {t('progress.pts')}</Text>
                </Text>
                <ProgressLineChart
                  sparkline
                  height={54}
                  step={1}
                  floor={0}
                  accessibilityLabel={w.name}
                  labels={w.series.map((s) => shortDate(s.weekStart))}
                  series={[{ key: w.key, color: w.color, values: v }]}
                  colors={{ ...chartColors, surface: hexA(w.color, 0.1) }}
                />
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

// ---------- Effort & feel ----------

const FEELS: { key: Feel; opacity: number }[] = [
  { key: 'hard', opacity: 0.3 },
  { key: 'ok', opacity: 0.45 },
  { key: 'good', opacity: 0.6 },
  { key: 'strong', opacity: 0.8 },
  { key: 'beast', opacity: 1 },
];

function EffortCard({
  program,
  c,
  styles,
  chartColors,
}: {
  program: CompletionProgram | undefined;
  c: TCPalette;
  styles: Styles;
  chartColors: ProgressChartColors;
}) {
  const [stripWidth, setStripWidth] = useState(0);
  const weeks = program?.weeks ?? [];
  const rpe = weeks.map((w) => (w.avg_rpe != null ? Number(w.avg_rpe) : null));
  const rated = rpe.map((v, i) => ({ v, week: weeks[i]?.week })).filter((x) => x.v !== null);
  const anyFeel = weeks.some((w) => Object.keys(w.feel ?? {}).length > 0);

  if (!program || (rated.length === 0 && !anyFeel)) {
    return (
      <Card title={t('progress.effort')} sub={t('progress.effortSub')} styles={styles}>
        <Empty title={t('progress.effortEmptyTitle')} body={t('progress.effortEmptyBody')} styles={styles} c={c} />
      </Card>
    );
  }
  const first = rated[0];
  const last = rated[rated.length - 1];
  const n = weeks.length;
  // Same x spread as ProgressLineChart (6px left, 8px right inset).
  const colX = (i: number) => (n <= 1 ? stripWidth / 2 : 6 + (i * (stripWidth - 14)) / (n - 1));

  return (
    <Card title={t('progress.effort')} sub={t('progress.effortSub')} styles={styles}>
      {last && (
        <Figure
          value={fmtNum(last.v!)}
          note={`${t('progress.avgRpeWeek', { week: last.week })}${
            first && first !== last ? ` · ${t('progress.sinceWeek', { delta: signed(last.v! - first.v!), week: first.week })}` : ''
          }`}
          styles={styles}
        />
      )}
      <ProgressLineChart
        accessibilityLabel={t('progress.effort')}
        labels={weeks.map((w) => wk(w.week))}
        series={[
          {
            key: 'rpe',
            color: c.coral,
            values: rpe,
            details: rpe.map((v) => (v === null ? null : t('progress.rpeValue', { value: fmtNum(v) }))),
          },
        ]}
        colors={chartColors}
        domain={[0, 10]}
        height={160}
      />
      {anyFeel && (
        <>
          <View style={styles.feelStrip} onLayout={(e: LayoutChangeEvent) => setStripWidth(e.nativeEvent.layout.width)}>
            {stripWidth > 0 &&
              weeks.map((w, i) => {
                const counts = FEELS.map((f) => ({ ...f, n: w.feel?.[f.key] ?? 0 })).filter((f) => f.n > 0);
                return (
                  <View key={w.week} style={[styles.feelCol, { left: colX(i) - 8 }]}>
                    {counts.length === 0 ? (
                      <View style={[styles.feelNone, { borderColor: c.dividerStrong }]} />
                    ) : (
                      counts.map((f) => (
                        <View key={f.key} style={[styles.feelSeg, { flexGrow: f.n, backgroundColor: c.static, opacity: f.opacity }]} />
                      ))
                    )}
                  </View>
                );
              })}
          </View>
          <View style={styles.feelLegend}>
            <Text style={styles.feelLegendTitle}>{t('progress.feel')}</Text>
            {FEELS.map((f) => (
              <View key={f.key} style={styles.feelLegendItem}>
                <View style={[styles.dot8, { backgroundColor: c.static, opacity: f.opacity }]} />
                <Text style={styles.feelLegendText}>{t(`logModal.feel_${f.key}`)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const getStyles = (c: TCPalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.screenBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: TC_LAYOUT.screenPadding,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
    headerSubline: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    errorText: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
    retryBtn: { backgroundColor: c.coral, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
    retryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.4 },
    content: { padding: TC_LAYOUT.screenPadding, paddingBottom: 48, gap: 12 },

    card: {
      backgroundColor: c.cardFlat,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: TC_LAYOUT.cardRadius,
      padding: 16,
      gap: 14,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 15, letterSpacing: 1.4 },
    cardSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },

    figureRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
    figure: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, lineHeight: 34 },
    figureUnit: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
    figureNote: { color: c.textSecondary, fontSize: 12 },

    empty: {
      minHeight: 130,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.dividerStrong,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      gap: 6,
    },
    emptyRing: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    emptyDot: { width: 10, height: 10, borderRadius: 5 },
    emptyTitle: { color: c.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 6 },
    emptyBody: { color: c.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 17 },

    weeksRow: { gap: 8, alignItems: 'flex-end', paddingVertical: 2 },
    weekCol: { width: 38, alignItems: 'center', gap: 6 },
    weekPct: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 },
    weekStack: {
      width: '100%',
      flexDirection: 'column-reverse',
      gap: 3,
      padding: 3,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    blockCell: { height: 7, borderRadius: 3 },
    blockCellDense: { height: 4, borderRadius: 2 },
    weekLabel: { color: c.textFaint2, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },

    chipRow: { gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.screenBg,
    },
    chipSmall: { paddingVertical: 5, maxWidth: 200 },
    chipOn: { borderColor: c.coral, backgroundColor: c.chipActiveBg },
    chipText: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.4 },
    chipTextOn: { color: c.textPrimary },
    chipCount: { color: c.textFaint2, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 },

    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      flexGrow: 1,
      flexBasis: 140,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 2,
      backgroundColor: c.screenBg,
    },
    tileName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tileNameText: { flex: 1, color: c.textMuted, fontSize: 11 },
    tileValue: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24 },
    tileDelta: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    dot8: { width: 8, height: 8, borderRadius: 4 },
    note: { color: c.textMuted, fontSize: 11 },

    worlds: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    world: { flexGrow: 1, flexBasis: 140, borderRadius: 14, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6, gap: 4 },
    worldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
    worldName: { flexShrink: 1, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 11, letterSpacing: 1.8 },
    worldDelta: { fontSize: 11, fontWeight: '600' },
    worldValue: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 34, lineHeight: 38 },

    mvReadout: { minHeight: 16, marginTop: -6 },
    allList: { gap: 12 },
    allRow: { gap: 5 },
    allRowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    allName: { flexShrink: 1, color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 0.3 },
    allValue: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 },
    allTrack: { height: 8, borderRadius: 4, backgroundColor: c.dividerStrong, overflow: 'hidden' },
    allFill: { height: '100%', flexDirection: 'row', gap: 2, borderRadius: 4, overflow: 'hidden' },
    allSets: { color: c.textMuted, fontSize: 11 },
    mvReadoutText: { color: c.textSecondary, fontSize: 12 },
    mvBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 150 },
    mvCol: { flex: 1, maxWidth: 46, height: '100%', alignItems: 'center', gap: 4 },
    mvValue: { minHeight: 14, color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12 },
    mvTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: c.dividerStrong },
    mvStack: { width: '100%', flexDirection: 'column-reverse', gap: 2, borderTopLeftRadius: 5, borderTopRightRadius: 5, overflow: 'hidden' },
    mvStackOn: { opacity: 0.85 },
    // Reps filled from the plan, not entered: hollow so they read apart.
    mvAssumed: { flexBasis: 0, minHeight: 2, borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent' },
    mvLabel: { color: c.textFaint2, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5 },
    feelStrip: { height: 36, marginTop: -6 },
    feelCol: { position: 'absolute', top: 0, bottom: 0, width: 16, flexDirection: 'column-reverse', gap: 2 },
    feelSeg: { flexBasis: 0, minHeight: 3, borderRadius: 3 },
    feelNone: { flex: 1, borderRadius: 3, borderWidth: 1, borderStyle: 'dashed' },
    feelLegend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
    feelLegendTitle: { color: c.textPrimary, fontSize: 11, fontWeight: '700' },
    feelLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    feelLegendText: { color: c.textMuted, fontSize: 11 },
  });

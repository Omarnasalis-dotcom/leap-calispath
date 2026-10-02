import React, { useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

export interface ProgressSeries {
  key: string;
  color: string;
  /** null = not logged that week: the solid line breaks, a faint dashed
   * bridge keeps the trend readable without pretending there was data. */
  values: (number | null)[];
  /** Readout text per x, e.g. "60 kg × 5". Defaults to "value unit". */
  details?: (string | null)[];
}

export interface ProgressChartColors {
  surface: string;
  grid: string;
  faint: string;
  ink: string;
  muted: string;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** Line chart for "My progress" — the app twin of the admin panel's chart
 * (admin-web PerfLineChart): smooth lines, light area fill, dashed bridge
 * over unlogged weeks, three gridlines. Drawn at the real layout width so
 * text never scales. Tap or drag to read a week; `sparkline` drops axes
 * and interaction and draws only the latest point. */
export function ProgressLineChart({
  labels,
  series,
  colors,
  unit = '',
  step = 5,
  floor,
  domain,
  height = 180,
  sparkline = false,
  accessibilityLabel,
}: {
  labels: string[];
  series: ProgressSeries[];
  colors: ProgressChartColors;
  unit?: string;
  step?: number;
  floor?: number;
  domain?: [number, number];
  height?: number;
  sparkline?: boolean;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const n = labels.length;
  const W = width;
  const H = height;
  const pl = sparkline ? 4 : 6;
  const pr = sparkline ? 6 : 8;
  const pt = sparkline ? 6 : 18;
  const pb = sparkline ? 6 : 24;

  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo) * 0.18 || Math.max(1, hi * 0.08);
  lo = Math.max(floor ?? -Infinity, Math.floor((lo - pad) / step) * step);
  hi = Math.ceil((hi + pad) / step) * step;
  if (hi === lo) hi = lo + step;
  if (domain) [lo, hi] = domain;

  const X = (i: number) => (n <= 1 ? W / 2 : pl + (i * (W - pl - pr)) / (n - 1));
  const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);

  const segments = (values: (number | null)[]) => {
    const segs: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push({ i, v });
    });
    if (cur.length) segs.push(cur);
    return segs;
  };
  const curve = (seg: { i: number; v: number }[]) =>
    seg
      .map((p, k) => {
        if (k === 0) return `M${X(p.i)},${Y(p.v)}`;
        const a = seg[k - 1];
        const m = (X(a.i) + X(p.i)) / 2;
        return `C${m},${Y(a.v)} ${m},${Y(p.v)} ${X(p.i)},${Y(p.v)}`;
      })
      .join(' ');

  const pick = (e: GestureResponderEvent) => {
    if (sparkline || n === 0 || W === 0) return;
    const x = e.nativeEvent.locationX;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((x - pl) / ((W - pl - pr) / (n - 1)))));
    setPicked(i);
  };

  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 52))));
  const showLabel = (i: number) => picked === i || i === n - 1 || (i % every === 0 && n - 1 - i >= every);
  const ticks = [lo, (lo + hi) / 2, hi];
  const sel = picked !== null && picked < n ? picked : null;

  return (
    <View>
      {!sparkline && (
        <View style={styles.readout}>
          {sel === null ? (
            <Text style={[styles.readoutHint, { color: colors.faint }]}>{' '}</Text>
          ) : (
            <>
              <Text style={[styles.readoutWeek, { color: colors.muted }]}>{labels[sel]}</Text>
              {series.map((s) => {
                const v = s.values[sel];
                return (
                  <View key={s.key} style={styles.readoutItem}>
                    <View style={[styles.readoutDot, { backgroundColor: s.color }]} />
                    <Text style={[styles.readoutValue, { color: colors.ink }]}>
                      {v === null ? '—' : s.details?.[sel] ?? `${fmt(v)} ${unit}`.trim()}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: H }}
        onStartShouldSetResponder={() => !sparkline}
        onMoveShouldSetResponder={() => !sparkline}
        onResponderGrant={pick}
        onResponderMove={pick}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {W > 0 && all.length > 0 && (
          <Svg width={W} height={H}>
            {!sparkline &&
              ticks.map((t, k) => (
                <Line
                  key={`g${k}`}
                  x1={0}
                  x2={W}
                  y1={Y(t)}
                  y2={Y(t)}
                  stroke={colors.grid}
                  strokeWidth={1}
                  strokeDasharray={k ? '3 4' : undefined}
                />
              ))}
            {sel !== null && (
              <Line x1={X(sel)} x2={X(sel)} y1={pt - 6} y2={H - pb} stroke={colors.ink} strokeOpacity={0.18} strokeWidth={1} />
            )}
            {series.map((s) => {
              const segs = segments(s.values);
              const lastIdx = s.values.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1);
              return (
                <React.Fragment key={s.key}>
                  {segs.map((seg, k) =>
                    seg.length > 1 ? (
                      <Path
                        key={`a${k}`}
                        d={`${curve(seg)} L${X(seg[seg.length - 1].i)},${H - pb} L${X(seg[0].i)},${H - pb} Z`}
                        fill={s.color}
                        fillOpacity={sparkline ? 0.12 : 0.08}
                      />
                    ) : null,
                  )}
                  {segs.slice(1).map((seg, k) => {
                    const a = segs[k][segs[k].length - 1];
                    const b = seg[0];
                    const m = (X(a.i) + X(b.i)) / 2;
                    return (
                      <Path
                        key={`b${k}`}
                        d={`M${X(a.i)},${Y(a.v)} C${m},${Y(a.v)} ${m},${Y(b.v)} ${X(b.i)},${Y(b.v)}`}
                        fill="none"
                        stroke={s.color}
                        strokeOpacity={0.55}
                        strokeWidth={1.5}
                        strokeDasharray="4 5"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {segs.map((seg, k) =>
                    seg.length > 1 ? (
                      <Path
                        key={`p${k}`}
                        d={curve(seg)}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={sparkline ? 2 : 2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null,
                  )}
                  {s.values.map((v, i) => {
                    if (v === null) return null;
                    const last = i === lastIdx;
                    const on = sel === i;
                    const lone = !segs.some((seg) => seg.length > 1 && seg.some((p) => p.i === i));
                    if (sparkline && !last && !lone) return null;
                    return (
                      <Circle
                        key={`c${i}`}
                        cx={X(i)}
                        cy={Y(v)}
                        r={on || last ? 5 : 3}
                        fill={on || last ? s.color : colors.surface}
                        stroke={on || last ? colors.surface : s.color}
                        strokeWidth={2}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
            {!sparkline &&
              // Each gridline value is drawn twice — a surface-coloured stroke
              // under the text — so a line passing through never hides it
              // (react-native-svg has no paint-order).
              ticks.map((t, k) => (
                <React.Fragment key={`gt${k}`}>
                  <SvgText
                    x={0}
                    y={Y(t) - 6}
                    fill={colors.surface}
                    stroke={colors.surface}
                    strokeWidth={3}
                    fontSize={11}
                    fontFamily="BarlowCondensed-Bold"
                  >
                    {`${fmt(t)} ${unit}`.trim()}
                  </SvgText>
                  <SvgText x={0} y={Y(t) - 6} fill={colors.faint} fontSize={11} fontFamily="BarlowCondensed-Bold">
                    {`${fmt(t)} ${unit}`.trim()}
                  </SvgText>
                </React.Fragment>
              ))}
            {!sparkline &&
              labels.map((l, i) =>
                showLabel(i) ? (
                  <SvgText
                    key={`x${i}`}
                    x={X(i)}
                    y={H - 6}
                    fill={sel === i ? colors.ink : colors.faint}
                    fontSize={11}
                    fontFamily="BarlowCondensed-Bold"
                    textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                  >
                    {l}
                  </SvgText>
                ) : null,
              )}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  readoutHint: { fontSize: 12 },
  readoutWeek: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.6 },
  readoutItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readoutDot: { width: 7, height: 7, borderRadius: 4 },
  readoutValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
});

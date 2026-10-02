import { useRef, useState, type PointerEvent } from 'react';
import { ChartTooltip } from '@/components/dashboard/ChartTooltip';

export interface PerfSeries {
  key: string;
  label: string;
  color: string; // CSS var, e.g. 'var(--dv-static)'
  values: number[];
}

// SVG viewBox units, same approach as WarriorGrowthChart.
const W = 600;
const H = 180;
const PAD_X = 8;
const PAD_Y = 10;
const MAX_X_LABELS = 8;

/** Multi-series line chart with a crosshair tooltip. One shared y-scale —
 * callers only pass series measured in the same unit. `zeroBaseline` pins
 * the axis to 0 (scores, loads); leave it off for values that never get
 * near 0 (bodyweight), so the change stays visible. */
export function PerfLineChart({
  xLabels,
  tooltipTitles,
  series,
  unit,
  zeroBaseline = true,
  ariaLabel,
}: {
  xLabels: string[];
  tooltipTitles: string[];
  series: PerfSeries[];
  unit: string;
  zeroBaseline?: boolean;
  ariaLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const n = xLabels.length;
  if (n === 0 || series.length === 0) return null;

  const all = series.flatMap((s) => s.values);
  const rawMax = Math.max(...all);
  const rawMin = Math.min(...all);
  const pad = (rawMax - rawMin) * 0.15 || Math.max(1, rawMax * 0.1);
  const yMin = zeroBaseline ? 0 : rawMin - pad;
  const yMax = rawMax + (zeroBaseline ? rawMax * 0.1 || 1 : pad);
  const span = yMax - yMin || 1;
  const stepX = n > 1 ? (W - PAD_X * 2) / (n - 1) : 0;
  const xAt = (i: number) => (n > 1 ? PAD_X + i * stepX : W / 2);
  const yAt = (v: number) => PAD_Y + (H - PAD_Y * 2) * (1 - (v - yMin) / span);

  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`.trim();
  const labelEvery = Math.ceil(n / MAX_X_LABELS);

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  const hoverX = hoverIdx !== null ? xAt(hoverIdx) : null;
  const tooltipY =
    hoverIdx !== null ? Math.min(...series.map((s) => yAt(s.values[hoverIdx]))) : 0;

  return (
    <div>
      {series.length > 1 && (
        <div className="perf-legend">
          {series.map((s) => (
            <span key={s.key} className="perf-legend-item">
              <span className="perf-legend-swatch" style={{ background: s.color }} />
              {s.label}
              <span className="num perf-legend-last">{fmt(s.values[n - 1])}</span>
            </span>
          ))}
        </div>
      )}
      <div className="dv-chart-wrap perf-chart">
        <div className="perf-y-labels" aria-hidden>
          <span>{fmt(Math.round(yMax * 10) / 10)}</span>
          <span>{fmt(Math.round(yMin * 10) / 10)}</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={190}
          preserveAspectRatio="none"
          style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={ariaLabel}
        >
          <line x1={0} x2={W} y1={PAD_Y} y2={PAD_Y} stroke="var(--dv-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={H - PAD_Y} y2={H - PAD_Y} stroke="var(--dv-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {hoverX !== null && (
            <line x1={hoverX} x2={hoverX} y1={PAD_Y} y2={H - PAD_Y} stroke="var(--dv-crosshair)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          {series.map((s) => {
            const d = s.values
              .map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
              .join(' ');
            return (
              <path
                key={s.key}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {/* Markers in HTML so they stay round under preserveAspectRatio="none". */}
        {series.map((s) =>
          s.values.map((v, i) =>
            i === n - 1 || i === hoverIdx || n <= 12 ? (
              <span
                key={`${s.key}-${i}`}
                className="perf-dot"
                style={{
                  left: `${(xAt(i) / W) * 100}%`,
                  top: `${(yAt(v) / H) * 190}px`,
                  background: s.color,
                  width: i === hoverIdx || i === n - 1 ? 10 : 7,
                  height: i === hoverIdx || i === n - 1 ? 10 : 7,
                }}
              />
            ) : null,
          ),
        )}
        {hoverIdx !== null && hoverX !== null && (
          <ChartTooltip left={`${(hoverX / W) * 100}%`} top={`${(tooltipY / H) * 190}px`} visible>
            <div className="dv-tooltip-title">{tooltipTitles[hoverIdx]}</div>
            {series.map((s) => (
              <div key={s.key} className="dv-tooltip-value perf-tooltip-row">
                {series.length > 1 && (
                  <span className="perf-legend-swatch" style={{ background: s.color }} />
                )}
                {series.length > 1 && <span className="perf-tooltip-label">{s.label}</span>}
                {fmt(s.values[hoverIdx])}
              </div>
            ))}
          </ChartTooltip>
        )}
      </div>
      <div className="perf-x-labels">
        {xLabels.map((l, i) => (
          <span
            key={i}
            className="dv-week-label"
            style={{ left: `${(xAt(i) / W) * 100}%` }}
          >
            {/* Thin to ~8 labels; always keep the last, dropping a
                regular one that would sit right next to it. */}
            {i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) ? l : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

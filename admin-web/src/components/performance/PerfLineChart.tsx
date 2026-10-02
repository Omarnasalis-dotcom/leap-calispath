import { createContext, useContext, useState, type PointerEvent } from 'react';

export interface PerfSeries {
  key: string;
  label: string;
  color: string; // CSS var, e.g. 'var(--pf-purple)'
  /** null = nothing logged at that x; the line breaks there (never interpolated). */
  values: (number | null)[];
  /** Optional tooltip text per x (e.g. "60 kg × 5"); defaults to "value unit". */
  details?: (string | null)[];
}

const fmt = (v: number) => String(+v.toFixed(1));

/** True inside the printed report: charts are drawn at their real A4 size
 * so 11px labels stay 11px on paper instead of being scaled down. */
export const PerfPrintContext = createContext(false);

/** Line chart per design handoff (assets/design_handoff_admin_performance,
 * chart()). `axis` = full chart with gridlines, labels, points and hover;
 * without it, a sparkline (no axes, latest point only). */
export function PerfLineChart({
  labels,
  series,
  unit = '',
  step = 5,
  floor,
  domain,
  axis = true,
  width = 560,
  height = 200,
  ariaLabel,
}: {
  labels: string[];
  series: PerfSeries[];
  unit?: string;
  step?: number;
  /** Lowest the axis may go (0 for loads and scores). */
  floor?: number;
  /** Fixed axis range instead of fitting the data (e.g. RPE 0-10). */
  domain?: [number, number];
  axis?: boolean;
  width?: number;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const print = useContext(PerfPrintContext);
  // On paper a half-width cell is ~330 units and a full-width one ~680.
  const W = print ? (axis ? (width > 600 ? 680 : 330) : 150) : width;
  const H = print ? (axis ? 160 : 52) : height;
  const pl = axis ? 6 : 4;
  const pr = axis ? 6 : 4;
  const pt = axis ? 18 : 6;
  const pb = axis ? 26 : 6;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0) return <div style={{ height: axis ? 120 : 40 }} />;

  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.18 || Math.max(1, hi * 0.08);
  lo = Math.max(floor ?? -Infinity, Math.floor((lo - pad) / step) * step);
  hi = Math.ceil((hi + pad) / step) * step;
  if (hi === lo) hi = lo + step;
  if (domain) [lo, hi] = domain;

  const n = labels.length;
  const X = (i: number) => (n === 1 ? W / 2 : pl + (i * (W - pl - pr)) / (n - 1));
  const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);

  // Consecutive logged points form a segment; a null breaks the line.
  const segmentsOf = (values: (number | null)[]) => {
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
  // Smooth monotone-ish curve: horizontal tangents at each point, so the
  // line never overshoots a data point.
  const pathOf = (seg: { i: number; v: number }[]) =>
    seg
      .map((p, k) => {
        if (k === 0) return `M${X(p.i)},${Y(p.v)}`;
        const a = seg[k - 1];
        const m = (X(a.i) + X(p.i)) / 2;
        return `C${m},${Y(a.v)} ${m},${Y(p.v)} ${X(p.i)},${Y(p.v)}`;
      })
      .join(' ');

  const lastIndex = (values: (number | null)[]) =>
    values.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1);

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((x - pl) / ((W - pl - pr) / (n - 1)))));
    if (i !== hover) setHover(i);
  }

  const ticks = [lo, (lo + hi) / 2, hi];
  // Thin x labels to what fits (~56 units each); always keep the last one
  // and drop a regular label that would crowd it.
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 56))));
  const showLabel = (i: number) =>
    hover === i || i === n - 1 || (i % every === 0 && n - 1 - i >= every);

  return (
    <div className={`pf-chart${axis ? ' pf-chart-interactive' : ''}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={axis ? onMove : undefined}
        onPointerLeave={axis ? () => setHover(null) : undefined}
      >
        {axis &&
          ticks.map((t, k) => (
            <line
              key={`g${k}`}
              x1={0}
              x2={W}
              y1={Y(t)}
              y2={Y(t)}
              stroke="var(--pf-divider)"
              strokeWidth={1}
              strokeDasharray={k ? '3 4' : undefined}
            />
          ))}
        {axis &&
          labels.map((l, i) => showLabel(i) && (
            <text
              key={`x${i}`}
              x={X(i)}
              y={H - 6}
              fill={hover === i ? 'var(--pf-ink)' : 'var(--pf-faint)'}
              fontSize={11}
              fontWeight={hover === i ? 600 : 400}
              textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {l}
            </text>
          ))}
        {hover !== null && (
          <line
            x1={X(hover)}
            x2={X(hover)}
            y1={pt - 6}
            y2={H - pb}
            stroke="var(--pf-ink)"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
        )}
        {series.map((s) => {
          const segs = segmentsOf(s.values);
          const li = lastIndex(s.values);
          return (
            <g key={s.key}>
              {segs.map((seg, k) =>
                seg.length > 1 ? (
                  <path
                    key={`a${k}`}
                    d={`${pathOf(seg)} L${X(seg[seg.length - 1].i)},${H - pb} L${X(seg[0].i)},${H - pb} Z`}
                    fill={s.color}
                    fillOpacity={axis ? 0.07 : 0.12}
                  />
                ) : null,
              )}
              {/* Unlogged weeks: a dashed bridge keeps the trend readable
                  without pretending those weeks had data (no dot, no fill,
                  tooltip still shows "—"). */}
              {segs.slice(1).map((seg, k) => {
                const a = segs[k][segs[k].length - 1];
                const b = seg[0];
                const m = (X(a.i) + X(b.i)) / 2;
                return (
                  <path
                    key={`b${k}`}
                    d={`M${X(a.i)},${Y(a.v)} C${m},${Y(a.v)} ${m},${Y(b.v)} ${X(b.i)},${Y(b.v)}`}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={0.55}
                    strokeWidth={axis ? 1.5 : 1.25}
                    strokeDasharray="4 5"
                    strokeLinecap="round"
                  />
                );
              })}
              {segs.map((seg, k) =>
                seg.length > 1 ? (
                  <path
                    key={`p${k}`}
                    d={pathOf(seg)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={axis ? 2.5 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null,
              )}
              {s.values.map((v, i) => {
                if (v === null) return null;
                const last = i === li;
                const on = hover === i;
                // Sparklines draw only the latest point; a lone point of a
                // broken line is always drawn so it isn't invisible.
                const lone = !segs.some((seg) => seg.length > 1 && seg.some((p) => p.i === i));
                if (!axis && !last && !lone) return null;
                return (
                  <circle
                    key={`c${i}`}
                    cx={X(i)}
                    cy={Y(v)}
                    r={on || last ? 5 : 3}
                    fill={last || on ? s.color : 'var(--pf-surface)'}
                    stroke={last || on ? 'var(--pf-surface)' : s.color}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}
        {/* Gridline values on top of the data, with a surface-coloured
            halo so a line passing through never makes them unreadable. */}
        {axis &&
          ticks.map((t, k) => (
            <text
              key={`gt${k}`}
              x={0}
              y={Y(t) - 6}
              fill="var(--pf-faint)"
              fontSize={11}
              stroke="var(--pf-surface)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {`${fmt(t)} ${unit}`.trim()}
            </text>
          ))}
      </svg>
      {axis && hover !== null && (
        <div
          className="pf-tip"
          role="tooltip"
          style={{
            left: `${(X(hover) / W) * 100}%`,
            transform: `translateX(${n === 1 ? '-50%' : hover === 0 ? '0' : hover === n - 1 ? '-100%' : '-50%'})`,
          }}
        >
          <div className="pf-tip-title">{labels[hover]}</div>
          {series.map((s) => {
            const v = s.values[hover];
            return (
              <div key={s.key} className="pf-tip-row">
                <span className="pf-tip-dot" style={{ background: s.color }} />
                {v === null ? '—' : s.details?.[hover] ?? `${fmt(v)} ${unit}`.trim()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

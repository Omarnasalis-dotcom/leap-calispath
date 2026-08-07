import { useRef, useState, type PointerEvent } from 'react';
import { ChartTooltip } from './ChartTooltip';
import { formatDate } from '@/shared/constants';
import type { DashboardTrendWeek } from '@/shared/types';

// SVG viewBox units — matches the design handoff's own path-building math.
const W = 600;
const H = 170;
const PAD = 6;

export function WarriorGrowthChart({ weeks }: { weeks: DashboardTrendWeek[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (weeks.length === 0) return null;

  const values = weeks.map((w) => w.cumulative_warriors);
  const minG = Math.min(...values) * 0.85;
  const maxG = Math.max(...values);
  const span = maxG - minG || 1; // flat/brand-new dataset guard
  const stepX = weeks.length > 1 ? (W - PAD * 2) / (weeks.length - 1) : 0;

  const pts = values.map((v, i) => ({
    x: PAD + i * stepX,
    y: PAD + (H - PAD * 2) * (1 - (v - minG) / span),
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${H - PAD} L ${pts[0].x.toFixed(1)} ${H - PAD} Z`;
  const last = pts[pts.length - 1];
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div className="dv-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={180}
        style={{ marginTop: 12, display: 'block', overflow: 'visible', cursor: 'crosshair' }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Cumulative warrior signups, last 8 weeks"
      >
        <defs>
          <linearGradient id="dvGrowthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dv-accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--dv-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#dvGrowthGrad)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--dv-accent)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered && (
          <line
            x1={hovered.x}
            y1={PAD}
            x2={hovered.x}
            y2={H - PAD}
            stroke="var(--dv-crosshair)"
            strokeWidth={1}
          />
        )}
        <circle cx={last.x} cy={last.y} r={5.5} fill="var(--dv-accent)" stroke="var(--dv-bg)" strokeWidth={2.5} />
        {hovered && hoverIdx !== weeks.length - 1 && (
          <circle cx={hovered.x} cy={hovered.y} r={5.5} fill="var(--dv-accent)" stroke="var(--dv-bg)" strokeWidth={2.5} />
        )}
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        {weeks.map((w, i) => (
          <span key={w.week_start} className="dv-week-label">
            {i === weeks.length - 1 ? 'Now' : formatDate(w.week_start)}
          </span>
        ))}
      </div>
      {hovered && hoverIdx !== null && (
        <ChartTooltip left={`${(hovered.x / W) * 100}%`} top={`${(hovered.y / H) * 100}%`} visible>
          <div className="dv-tooltip-title">{formatDate(weeks[hoverIdx].week_start)}</div>
          <div className="dv-tooltip-value">
            {weeks[hoverIdx].cumulative_warriors.toLocaleString()} warriors
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

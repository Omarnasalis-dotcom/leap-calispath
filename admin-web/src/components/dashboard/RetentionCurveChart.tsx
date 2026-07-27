import { useRef, useState, type PointerEvent } from 'react';
import { ChartTooltip } from './ChartTooltip';
import type { RetentionCurvePoint } from '@/shared/types';

// SVG viewBox units — fixed 0-100% domain, so no data-relative scaling is
// needed (unlike WarriorGrowthChart's dynamic min/max).
const W = 600;
const H = 170;
const PAD = 6;

export function RetentionCurveChart({ points }: { points: RetentionCurvePoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="empty">
        <span className="label">Not enough signup history yet</span>
      </div>
    );
  }

  const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const pts = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (H - PAD * 2) * (1 - p.retention_pct / 100),
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
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
        aria-label="Retention: percent of warriors still active by weeks since signup"
      >
        {/* Recessive gridlines at 0/50/100% so the fixed domain reads at a glance */}
        {[0, 50, 100].map((pct) => {
          const y = PAD + (H - PAD * 2) * (1 - pct / 100);
          return (
            <line
              key={pct}
              x1={PAD}
              y1={y}
              x2={W - PAD}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          );
        })}
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
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        )}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === hoverIdx ? 5.5 : 4}
            fill="var(--dv-accent)"
            stroke="var(--dv-bg)"
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        {points.map((p, i) => (
          <span key={p.weeks_since_signup} className="dv-week-label">
            {i === 0 ? 'Signup wk' : `Wk ${p.weeks_since_signup}`}
          </span>
        ))}
      </div>
      {hovered && hoverIdx !== null && (
        <ChartTooltip left={`${(hovered.x / W) * 100}%`} top={`${(hovered.y / H) * 100}%`} visible>
          <div className="dv-tooltip-title">
            {hoverIdx === 0 ? 'Signup week' : `${points[hoverIdx].weeks_since_signup} weeks after signup`}
          </div>
          <div className="dv-tooltip-value">{points[hoverIdx].retention_pct}% active</div>
          <div className="dv-tooltip-title">
            {points[hoverIdx].active_users} of {points[hoverIdx].eligible_users} warriors
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

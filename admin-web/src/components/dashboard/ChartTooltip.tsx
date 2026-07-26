import type { ReactNode } from 'react';

/** Floating tooltip positioned via percentage coordinates within a
 * position:relative chart wrapper. Used by charts that track a continuous
 * pointer position (WarriorGrowthChart). The bar/progress charts use a
 * CSS-hover-revealed `.dv-bar-tooltip` instead — a discrete per-mark hover
 * needs no pointer-position math. */
export function ChartTooltip({
  left,
  top,
  visible,
  children,
}: {
  left: string;
  top: string;
  visible: boolean;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div className="dv-tooltip" style={{ left, top }} role="tooltip">
      {children}
    </div>
  );
}

// measureInWindow as a promise. On the New Architecture (Fabric) refs,
// measureLayout's relativeTo-node approach silently failed in this app (see
// MilestoneLaneScreen's auto-scroll), so window coordinates are the one
// reliable way to relate two views. Resolves null if the ref can't measure.

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null | undefined;

export function measureInWindow(node: unknown): Promise<WindowRect | null> {
  const n = node as Measurable;
  return new Promise((resolve) => {
    if (!n?.measureInWindow) return resolve(null);
    n.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

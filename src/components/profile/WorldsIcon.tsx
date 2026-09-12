import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { WORLD_THEMES, WorldKey } from '../../../constants/worldThemes';

interface WorldsIconProps {
  size?: number;
  // The currently active world (if any) -- its arc is highlighted and the
  // other two dim, echoing how the rest of the tab bar marks an active tab.
  activeKey?: WorldKey;
}

const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180.0);
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
};

const cx = 50;
const cy = 50;
const r = 36;

// Same 3-arcs-with-gaps geometry as the LeapLogo splash mark (see
// LeapLogo.tsx), just recolored per-arc with each world's real accent instead
// of the splash mark's fixed dot colors -- the WORLDS tab button collapses
// Power/Static/1MM into one glyph, so it should read as that same "3 worlds"
// ring rather than a generic grid icon.
const ARCS: { path: string; key: WorldKey }[] = [
  { path: describeArc(cx, cy, r, -50, 50), key: 'power' },
  { path: describeArc(cx, cy, r, 70, 170), key: 'onemm' },
  { path: describeArc(cx, cy, r, 190, 290), key: 'static' },
];

export function WorldsIcon({ size = 24, activeKey }: WorldsIconProps) {
  return (
    <Svg viewBox="0 0 100 100" width={size} height={size}>
      {ARCS.map(({ path, key }) => (
        <Path
          key={key}
          d={path}
          fill="none"
          stroke={WORLD_THEMES[key].accent}
          strokeWidth={activeKey === key ? 13 : 10}
          strokeLinecap="round"
          opacity={!activeKey || activeKey === key ? 1 : 0.32}
        />
      ))}
    </Svg>
  );
}

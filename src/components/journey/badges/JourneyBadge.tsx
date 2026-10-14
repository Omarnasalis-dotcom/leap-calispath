import React, { useMemo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { WORLD_COLORS } from '../../../lib/journeyAchievements';

/*
 * Journey achievement badges, ported from the handoff's journey-badges.js
 * (assets/design_handoff_journey_achievements), viewBox 0 0 160 160.
 * Rendered as react-native-svg elements directly (no XML parsing).
 *
 *   level 0      empty slot
 *   simple       small variant for 40 / 20 px (no ticks, rivets, rays, star,
 *                mark gaps; thicker strokes; one blade per wing)
 *   parts        draw only these layers, for the celebration reveals
 *                (CHAMPION / ELITE / LEGEND wings, gem, rays animate apart)
 *   hot          DETERMINED's forge-heated palette (reveal only)
 *
 * The centre mark follows the official LeapLogo: three arcs with gaps at its
 * 2, 6 and 10 o'clock positions (Power, Endurance, Static dots), at the
 * handoff's bolder weight so it stays readable at 20 px.
 */

export type BadgePart = 'rays' | 'wingL' | 'wingR' | 'body' | 'gem';
const ALL_PARTS: readonly BadgePart[] = ['rays', 'wingL', 'wingR', 'body', 'gem'];

export interface JourneyBadgeProps {
  level: number;
  size: number;
  simple?: boolean;
  parts?: readonly BadgePart[];
  hot?: boolean;
  /** Empty-slot outline colour (light mode uses a lighter grey). */
  slotColor?: string;
}

// ── Geometry helpers (same maths as the handoff) ───────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const P = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
};
const poly = (cx: number, cy: number, r: number, n: number, rot: number) =>
  Array.from({ length: n }, (_, k) => P(cx, cy, r, rot + (360 / n) * k).join(',')).join(' ');

const SHIELD = 'M80 26 L122 40 L122 82 C122 108 104 126 80 138 C56 126 38 108 38 82 L38 40 Z';
const CREST = 'M80 30 L94 38 L122 34 L122 84 C122 108 104 126 80 140 C56 126 38 108 38 84 L38 34 L66 38 Z';
const FEATHERS = ['M42 46 C28 34 14 30 4 32 C10 42 22 52 40 60 Z', 'M41 62 C28 54 16 52 6 56 C14 66 26 72 40 76 Z', 'M41 78 C30 72 20 72 12 78 C20 86 30 90 42 92 Z'];
const FEATHER0 = 'M44 34 C34 20 22 12 8 10 C12 24 24 36 42 46 Z';
const BLADE = 'M40 48 C24 38 8 38 0 42 C8 62 24 76 40 82 Z';
const INNER = (cy: number) => `translate(80 ${cy}) scale(.84) translate(-80 -${cy})`;

// LeapLogo gap centres in screen degrees (0 = right): its 60° / 180° / 300°
// measured from the top. Dot colour per gap.
const MARK_GAPS: readonly { deg: number; color: string }[] = [
  { deg: -30, color: WORLD_COLORS.power },
  { deg: 90, color: WORLD_COLORS.endurance },
  { deg: 210, color: WORLD_COLORS.static },
];
const MARK_HALF_GAP = 17;

function Grad({ id, stops, x2 = 0, y2 = 1 }: { id: string; stops: readonly [number, string][]; x2?: number; y2?: number }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
      {stops.map(([o, c], i) => <Stop key={i} offset={o} stopColor={c} />)}
    </LinearGradient>
  );
}

function Mark({ cx, cy, r, sw, color, simple }: { cx: number; cy: number; r: number; sw: number; color: string; simple?: boolean }) {
  if (simple) return <Circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} />;
  return (
    <>
      {MARK_GAPS.map((g, i) => {
        const next = MARK_GAPS[(i + 1) % 3].deg + (i === 2 ? 360 : 0);
        const [x1, y1] = P(cx, cy, r, g.deg + MARK_HALF_GAP);
        const [x2, y2] = P(cx, cy, r, next - MARK_HALF_GAP);
        return <Path key={`a${i}`} d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />;
      })}
      {MARK_GAPS.map((g, i) => {
        const [x, y] = P(cx, cy, r, g.deg);
        return <Circle key={`d${i}`} cx={x} cy={y} r={r2(r * 0.17)} fill={g.color} />;
      })}
    </>
  );
}

function Wings({ side, fill, stroke, simple, scale = 1, legend }: {
  side: 'L' | 'R'; fill: string; stroke: string; simple: boolean; scale?: number; legend?: boolean;
}) {
  const list = simple ? [BLADE] : legend ? [FEATHER0, ...FEATHERS] : FEATHERS;
  const sc = scale !== 1 ? `translate(40 64) scale(${scale}) translate(-40 -64)` : '';
  const mir = side === 'R' ? 'translate(160 0) scale(-1 1) ' : '';
  const transform = `${mir}${sc}`.trim();
  return (
    <G transform={transform || undefined}>
      {list.map((d, i) => <Path key={i} d={d} fill={fill} stroke={stroke} strokeWidth={simple ? 4 : 1.2} strokeLinejoin="round" />)}
    </G>
  );
}

let uidCounter = 0;

export const JourneyBadge = React.memo(function JourneyBadge({ level, size, simple = false, parts = ALL_PARTS, hot = false, slotColor = '#5a5a5a' }: JourneyBadgeProps) {
  // Gradient ids are unique per instance (several badges can share a screen).
  const u = useMemo(() => `jb${++uidCounter}`, []);
  const has = (p: BadgePart) => parts.includes(p);
  const sw = simple ? 9 : 3;

  let defs: React.ReactNode = null;
  let rays: React.ReactNode = null;
  let wl: React.ReactNode = null;
  let wr: React.ReactNode = null;
  let body: React.ReactNode = null;
  let gem: React.ReactNode = null;

  if (level <= 0) {
    body = (
      <Circle
        cx={80} cy={80} r={simple ? 62 : 58} fill="none" stroke={slotColor} strokeWidth={simple ? 9 : 3}
        strokeDasharray={simple ? '16 14' : '7 7'} strokeLinecap="round"
      />
    );
  } else if (level === 1) {
    defs = <Grad id={`${u}f`} stops={[[0, '#737a83'], [1, '#383d44']]} />;
    body = simple ? (
      <>
        <Circle cx={80} cy={80} r={64} fill={`url(#${u}f)`} stroke="#a3aab2" strokeWidth={10} />
        <Mark cx={80} cy={80} r={26} sw={10} color="#eef1f4" simple />
      </>
    ) : (
      <>
        <Circle cx={80} cy={80} r={54} fill={`url(#${u}f)`} stroke="#a3aab2" strokeWidth={3} />
        <Circle cx={80} cy={80} r={47} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
        <Mark cx={80} cy={80} r={22} sw={sw} color="#eef1f4" />
      </>
    );
  } else if (level === 2) {
    defs = <Grad id={`${u}f`} stops={[[0, '#4f7587'], [1, '#1c303b']]} />;
    body = simple ? (
      <>
        <Circle cx={80} cy={80} r={72} fill="none" stroke="#9cc6d8" strokeWidth={6} />
        <Circle cx={80} cy={80} r={56} fill={`url(#${u}f)`} stroke="#9cc6d8" strokeWidth={9} />
        <Mark cx={80} cy={80} r={22} sw={9} color="#e8f6fb" simple />
      </>
    ) : (
      <>
        {Array.from({ length: 12 }, (_, k) => (
          <Rect key={k} x={78} y={10} width={4} height={9} rx={2} fill="#9cc6d8" transform={`rotate(${k * 30} 80 80)`} />
        ))}
        <Circle cx={80} cy={80} r={55} fill={`url(#${u}f)`} stroke="#9cc6d8" strokeWidth={3} />
        <Circle cx={80} cy={80} r={47} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        <Mark cx={80} cy={80} r={22} sw={sw} color="#e8f6fb" />
      </>
    );
  } else if (level === 3) {
    defs = (
      <>
        <Grad id={`${u}f`} stops={[[0, '#f0b886'], [0.5, '#c27f4b'], [1, '#7a4524']]} />
        <Grad id={`${u}i`} stops={[[0, '#2e1c11'], [1, '#120a05']]} />
      </>
    );
    body = simple ? (
      <>
        <Polygon points={poly(80, 80, 74, 8, 22.5)} fill={`url(#${u}f)`} />
        <Circle cx={80} cy={80} r={44} fill={`url(#${u}i)`} />
        <Mark cx={80} cy={80} r={22} sw={9} color="#f6d2ae" simple />
      </>
    ) : (
      <>
        <Polygon points={poly(80, 80, 66, 8, 22.5)} fill={`url(#${u}f)`} stroke="#f6cfa6" strokeWidth={1.5} strokeLinejoin="round" />
        <Polygon points={poly(80, 80, 58, 8, 22.5)} fill="none" stroke="rgba(60,30,10,0.45)" strokeWidth={1.5} />
        <Circle cx={80} cy={80} r={45} fill={`url(#${u}i)`} stroke="#f1c49a" strokeWidth={2} />
        <Mark cx={80} cy={80} r={22} sw={sw} color="#f6d2ae" />
      </>
    );
  } else if (level === 4) {
    defs = hot ? (
      <>
        <Grad id={`${u}f`} stops={[[0, '#ffe8a0'], [0.45, '#ff7a2c'], [1, '#9e1c0c']]} />
        <Grad id={`${u}i`} stops={[[0, '#6a1a08'], [1, '#2a0804']]} />
      </>
    ) : (
      <>
        <Grad id={`${u}f`} stops={[[0, '#f2f5f8'], [0.5, '#aab3bd'], [1, '#69727c']]} />
        <Grad id={`${u}i`} stops={[[0, '#313840'], [1, '#15191d']]} />
      </>
    );
    body = simple ? (
      <>
        <Polygon points={poly(80, 80, 76, 6, -90)} fill={`url(#${u}f)`} />
        <Polygon points={poly(80, 80, 54, 6, -90)} fill={`url(#${u}i)`} stroke="#FF6B2C" strokeWidth={6} />
        <Mark cx={80} cy={80} r={22} sw={9} color="#ffffff" simple />
      </>
    ) : (
      <>
        <Polygon points={poly(80, 80, 68, 6, -90)} fill={`url(#${u}f)`} stroke={hot ? '#ffd27a' : '#f7f9fb'} strokeWidth={1.5} strokeLinejoin="round" />
        {Array.from({ length: 6 }, (_, k) => {
          const [x, y] = P(80, 80, 61, -90 + 60 * k);
          return <Circle key={k} cx={x} cy={y} r={3.2} fill={hot ? '#ffd27a' : '#d7dde3'} stroke={hot ? '#a3300f' : '#59616a'} strokeWidth={1} />;
        })}
        <Polygon points={poly(80, 80, 52, 6, -90)} fill={`url(#${u}i)`} />
        <Polygon points={poly(80, 80, 47, 6, -90)} fill="none" stroke="#FF6B2C" strokeWidth={2} opacity={0.9} />
        <Mark cx={80} cy={80} r={22} sw={sw} color="#ffffff" />
      </>
    );
  } else if (level === 5) {
    defs = (
      <>
        <Grad id={`${u}f`} stops={[[0, '#f4584f'], [1, '#741410']]} />
        <Grad id={`${u}r`} stops={[[0, '#ffffff'], [0.5, '#c3c9cf'], [1, '#7f878f']]} x2={1} y2={1} />
      </>
    );
    body = simple ? (
      <>
        <Path d={SHIELD} fill={`url(#${u}f)`} stroke={`url(#${u}r)`} strokeWidth={10} strokeLinejoin="round" />
        <Mark cx={80} cy={78} r={22} sw={9} color="#ffffff" simple />
      </>
    ) : (
      <>
        <Path d={SHIELD} fill={`url(#${u}f)`} stroke={`url(#${u}r)`} strokeWidth={5} strokeLinejoin="round" />
        <Path d={SHIELD} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} transform={INNER(82)} />
        <Path d="M62 110 L80 120 L98 110" fill="none" stroke={`url(#${u}r)`} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Mark cx={80} cy={76} r={20} sw={sw} color="#ffffff" />
      </>
    );
  } else if (level === 6) {
    defs = (
      <>
        <Grad id={`${u}f`} stops={[[0, '#4567ff'], [1, '#121c66']]} />
        <Grad id={`${u}g`} stops={[[0, '#fff0b8'], [0.5, '#f2c14e'], [1, '#b47a1c']]} x2={1} y2={1} />
      </>
    );
    wl = <Wings side="L" fill={`url(#${u}g)`} stroke="#8a5a12" simple={simple} />;
    wr = <Wings side="R" fill={`url(#${u}g)`} stroke="#8a5a12" simple={simple} />;
    body = simple ? (
      <>
        <Path d={SHIELD} fill={`url(#${u}f)`} stroke={`url(#${u}g)`} strokeWidth={10} strokeLinejoin="round" />
        <Mark cx={80} cy={78} r={22} sw={9} color="#ffffff" simple />
      </>
    ) : (
      <>
        <Path d={SHIELD} fill={`url(#${u}f)`} stroke={`url(#${u}g)`} strokeWidth={5} strokeLinejoin="round" />
        <Path d={SHIELD} fill="none" stroke="rgba(255,240,184,0.3)" strokeWidth={1} transform={INNER(82)} />
        <Polygon
          points={Array.from({ length: 10 }, (_, k) => P(80, 112, k % 2 ? 3.4 : 8, -90 + 36 * k).join(',')).join(' ')}
          fill={`url(#${u}g)`}
        />
        <Mark cx={80} cy={76} r={20} sw={sw} color="#ffffff" />
      </>
    );
  } else if (level === 7) {
    defs = (
      <>
        <Grad id={`${u}f`} stops={[[0, '#a585ff'], [1, '#2f1680']]} />
        <Grad id={`${u}p`} stops={[[0, '#ffffff'], [0.6, '#d6d1f2'], [1, '#9890c4']]} x2={1} y2={1} />
        <Grad id={`${u}gm`} stops={[[0, '#f2fdff'], [0.5, '#8fdcff'], [1, '#5d6dff']]} />
      </>
    );
    wl = <Wings side="L" fill={`url(#${u}p)`} stroke="#6c64a0" simple={simple} scale={simple ? 0.9 : 0.86} />;
    wr = <Wings side="R" fill={`url(#${u}p)`} stroke="#6c64a0" simple={simple} scale={simple ? 0.9 : 0.86} />;
    body = simple ? (
      <>
        <Path d={CREST} fill={`url(#${u}f)`} stroke={`url(#${u}p)`} strokeWidth={10} strokeLinejoin="round" />
        <Mark cx={80} cy={84} r={22} sw={9} color="#ffffff" simple />
      </>
    ) : (
      <>
        <Path d={CREST} fill={`url(#${u}f)`} stroke={`url(#${u}p)`} strokeWidth={5} strokeLinejoin="round" />
        <Path d={CREST} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1} transform={INNER(86)} />
        <Mark cx={80} cy={84} r={20} sw={sw} color="#ffffff" />
      </>
    );
    gem = simple ? (
      <Path d="M80 2 L96 20 L80 40 L64 20 Z" fill={`url(#${u}gm)`} stroke="#ffffff" strokeWidth={4} strokeLinejoin="round" />
    ) : (
      <>
        <Path d="M80 6 L93 20 L80 38 L67 20 Z" fill={`url(#${u}gm)`} stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" />
        <Path d="M67 20 L93 20 M80 6 L74 20 L80 38 M80 6 L86 20 L80 38" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
      </>
    );
  } else {
    // 8 — LEGEND
    defs = (
      <>
        <Grad id={`${u}f`} stops={[[0, '#24143f'], [1, '#09060f']]} />
        <Grad id={`${u}pr`} stops={[[0, WORLD_COLORS.static], [0.45, WORLD_COLORS.power], [0.75, WORLD_COLORS.endurance], [1, '#FFD36B']]} x2={1} y2={1} />
        <Grad id={`${u}w`} stops={[[0, '#d9c9ff'], [0.35, WORLD_COLORS.static], [0.7, WORLD_COLORS.power], [1, WORLD_COLORS.endurance]]} x2={1} y2={1} />
        <Grad id={`${u}g`} stops={[[0, '#fff0b8'], [0.5, '#f2c14e'], [1, '#b47a1c']]} x2={1} y2={1} />
        <RadialGradient id={`${u}ry`} cx="80" cy="80" r="80" gradientUnits="userSpaceOnUse">
          <Stop offset={0.3} stopColor="#fff3c4" stopOpacity={0.9} />
          <Stop offset={1} stopColor="#FFD36B" stopOpacity={0} />
        </RadialGradient>
      </>
    );
    rays = simple ? (
      <Circle cx={80} cy={84} r={74} fill="none" stroke={`url(#${u}pr)`} strokeWidth={6} />
    ) : (
      <>
        {Array.from({ length: 12 }, (_, k) => {
          const a = k * 30 + 15;
          const L = k % 2 ? 66 : 80;
          return <Polygon key={k} points={`${P(80, 84, 30, a - 6).join(',')} ${P(80, 84, L, a).join(',')} ${P(80, 84, 30, a + 6).join(',')}`} fill={`url(#${u}ry)`} />;
        })}
        <Circle cx={80} cy={84} r={74} fill="none" stroke={`url(#${u}pr)`} strokeWidth={2} opacity={0.8} />
      </>
    );
    wl = <Wings side="L" fill={`url(#${u}w)`} stroke="#3a1d5c" simple={simple} legend />;
    wr = <Wings side="R" fill={`url(#${u}w)`} stroke="#3a1d5c" simple={simple} legend />;
    body = simple ? (
      <>
        <Path d={CREST} fill={`url(#${u}f)`} stroke={`url(#${u}pr)`} strokeWidth={10} strokeLinejoin="round" />
        <Mark cx={80} cy={86} r={22} sw={9} color="#ffffff" simple />
      </>
    ) : (
      <>
        <Path d={CREST} fill={`url(#${u}f)`} stroke={`url(#${u}pr)`} strokeWidth={5} strokeLinejoin="round" />
        <Path d={CREST} fill="none" stroke={`url(#${u}pr)`} strokeWidth={1} opacity={0.55} transform={INNER(86)} />
        <Mark cx={80} cy={86} r={20} sw={sw} color="#ffffff" />
      </>
    );
    gem = simple ? (
      <Path d="M54 40 L58 12 L70 26 L80 4 L90 26 L102 12 L106 40 Z" fill={`url(#${u}g)`} />
    ) : (
      <>
        <Path d="M56 38 L60 16 L70 28 L80 8 L90 28 L100 16 L104 38 Z" fill={`url(#${u}g)`} stroke="#8a5a12" strokeWidth={1} strokeLinejoin="round" />
        <Circle cx={60} cy={16} r={4} fill={WORLD_COLORS.static} stroke="#ffffff" strokeWidth={1} />
        <Circle cx={80} cy={9} r={5} fill={WORLD_COLORS.power} stroke="#ffffff" strokeWidth={1} />
        <Circle cx={100} cy={16} r={4} fill={WORLD_COLORS.endurance} stroke="#ffffff" strokeWidth={1} />
      </>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 160 160" style={{ overflow: 'visible' }}>
      {defs && <Defs>{defs}</Defs>}
      {has('rays') && rays}
      {has('wingL') && wl}
      {has('wingR') && wr}
      {has('body') && body}
      {has('gem') && gem}
    </Svg>
  );
});

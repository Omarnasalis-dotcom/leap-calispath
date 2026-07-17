import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Hand-drawn linear exercise glyphs (design handoff: stroke-based, 2px
 * stroke, round caps/joins, one distinct icon per exercise so a row scans
 * visually before reading labels). 24×24 viewBox, rendered at 18–22px.
 */

export type ExerciseIconName =
  // Power movements
  | 'pull_up'
  | 'dip'
  | 'squat'
  | 'muscle_up'
  // 1MM movement patterns
  | 'push'
  | 'pull'
  | 'deadlift'
  | 'hspu'
  | 'fl_press'
  | 'fl_pull'
  | 'planche'
  // Static holds
  | 'handstand_wall'
  | 'handstand'
  | 'handstand_one_arm'
  | 'front_lever_tuck'
  | 'front_lever_straddle'
  | 'front_lever'
  | 'back_lever_tuck'
  | 'back_lever_straddle'
  | 'back_lever'
  | 'planche_tuck'
  | 'planche_straddle'
  | 'planche_full';

interface Glyph {
  paths: string[];
  /** cx, cy, r for the head circle where the glyph depicts a figure. */
  head?: [number, number, number];
}

const GLYPHS: Record<ExerciseIconName, Glyph> = {
  // --- Power -------------------------------------------------------------
  // Bar overhead, figure hanging with arms up.
  pull_up: {
    paths: ['M3 4h18', 'M8 4v4.5', 'M16 4v4.5', 'M8 8.5c0 2.2 1.7 3.5 4 3.5s4-1.3 4-3.5', 'M12 14v4', 'M12 18l-2.5 3', 'M12 18l2.5 3'],
    head: [12, 10, 0],
  },
  // Two parallel bars, figure in support between them, legs bent back.
  dip: {
    paths: ['M3 9h5', 'M16 9h5', 'M8 9l3-1.5', 'M16 9l-3-1.5', 'M12 8v6', 'M12 14l-2.5 3.5', 'M12 14l2 4'],
    head: [12, 5, 2],
  },
  // Squat chevrons (handoff-specified glyph).
  squat: {
    paths: ['M7 8l5 5 5-5', 'M7 13.5l5 5 5-5'],
  },
  // Figure in support above the bar.
  muscle_up: {
    paths: ['M4 15h16', 'M12 7v5', 'M12 8l-3.5 7', 'M12 8l3.5 7', 'M12 12l-2 6.5', 'M12 12l2 6.5'],
    head: [12, 5, 2],
  },

  // --- 1MM patterns ------------------------------------------------------
  // Push-up plank: body diagonal over the ground line.
  push: {
    paths: ['M3 21h18', 'M4 17l13-4.5', 'M9 15.2v5.8', 'M13 13.8v3'],
    head: [19.5, 11.5, 2],
  },
  // Inverted row: bar overhead, straight body diagonal hanging beneath.
  pull: {
    paths: ['M3 5h18', 'M14 5v4.5', 'M5 20L14 9.5', 'M8 16.5l1.8 1.8'],
    head: [16, 11.5, 2],
  },
  // Barbell with plates.
  deadlift: {
    paths: ['M3 12h18', 'M6 8.5v7', 'M9 10v4', 'M15 10v4', 'M18 8.5v7'],
  },
  // Handstand push-up: inverted figure, hands down, bent arms.
  hspu: {
    paths: ['M6 21h12', 'M12 5v8', 'M12 5l-3.5-2', 'M12 5l3.5-2', 'M12 13l-3 3.5', 'M12 13l3 3.5', 'M9 16.5v4.5', 'M15 16.5v4.5'],
  },
  // Front-lever press: bar, arms down, body horizontal pressing away.
  fl_press: {
    paths: ['M3 4h18', 'M15 4l-2 6', 'M13 10L5 13', 'M5 13l-1.5 3'],
    head: [17.5, 9, 2],
  },
  // Front-lever pull: bar, bent arms, body horizontal under the bar.
  fl_pull: {
    paths: ['M3 4h18', 'M15 4l-1 3l-1 3', 'M13 10H5'],
    head: [17.5, 10, 2],
  },
  // Planche push-up: hands on floor, horizontal body above.
  planche: {
    paths: ['M4 21h16', 'M9 21v-6', 'M9 15h10'],
    head: [6, 14, 2],
  },

  // --- Static holds ------------------------------------------------------
  // Wall handstand: inverted figure + wall line behind the heels.
  handstand_wall: {
    paths: ['M20 3v18', 'M6 21h9', 'M11 21v-4', 'M11 17l1.5-9', 'M12.5 8l2-4', 'M12.5 8l4.5-2.5'],
    head: [9, 19, 0],
  },
  // Freestanding handstand: straight inverted line, balanced.
  handstand: {
    paths: ['M7 21h10', 'M10 21v-3.5', 'M14 21v-3.5', 'M12 17.5V9', 'M12 9l-2.5-5', 'M12 9l2.5-5'],
  },
  // One-arm handstand: single support arm, legs split for balance.
  handstand_one_arm: {
    paths: ['M8 21h8', 'M12 21v-4', 'M12 17V9', 'M12 9l-3.5-4', 'M12 9l3-5.5', 'M12 13l-3 1.5'],
  },
  // Levers: bar + hanging arm + body (tuck = drawn-in knees, straddle =
  // split legs, full = one straight horizontal line).
  front_lever_tuck: {
    paths: ['M3 4h18', 'M14 4l-1.5 6', 'M12.5 10l-4 .5', 'M8.5 10.5l1.5 3.5l3-1'],
    head: [16.5, 10.5, 2],
  },
  front_lever_straddle: {
    paths: ['M3 4h18', 'M14 4l-1.5 6', 'M12.5 10l-4 .8', 'M8.5 10.8L4 8.5', 'M8.5 10.8L4.5 14'],
    head: [16.5, 10.5, 2],
  },
  front_lever: {
    paths: ['M3 4h18', 'M14 4l-1.5 6', 'M12.5 10L3.5 11'],
    head: [16.5, 10.5, 2],
  },
  back_lever_tuck: {
    paths: ['M3 4h18', 'M10 4l1.5 6', 'M11.5 10l4 .5', 'M15.5 10.5l-1.5 3.5l-3-1'],
    head: [7.5, 10.5, 2],
  },
  back_lever_straddle: {
    paths: ['M3 4h18', 'M10 4l1.5 6', 'M11.5 10l4 .8', 'M15.5 10.8L20 8.5', 'M15.5 10.8l4 3.2'],
    head: [7.5, 10.5, 2],
  },
  back_lever: {
    paths: ['M3 4h18', 'M10 4l1.5 6', 'M11.5 10l9 1'],
    head: [7.5, 10.5, 2],
  },
  // Planche family: floor + support arm + body attitude.
  planche_tuck: {
    paths: ['M4 21h16', 'M10 21v-6', 'M10 15h4.5', 'M14.5 15l1.5 3.5l-3 1'],
    head: [7, 14, 2],
  },
  planche_straddle: {
    paths: ['M4 21h16', 'M10 21v-6', 'M10 15h4.5', 'M14.5 15l4.5-2.5', 'M14.5 15l4.5 2.5'],
    head: [7, 14, 2],
  },
  planche_full: {
    paths: ['M4 21h16', 'M10 21v-6', 'M10 15h9.5'],
    head: [7, 14, 2],
  },
};

/** Static movement id → glyph (each of a category's 3 levels reads distinctly). */
export const STATIC_MOVEMENT_ICONS: Record<string, ExerciseIconName> = {
  wall_handstand: 'handstand_wall',
  freestanding_handstand: 'handstand',
  one_arm_handstand: 'handstand_one_arm',
  tuck_front_lever: 'front_lever_tuck',
  straddle_front_lever: 'front_lever_straddle',
  full_front_lever: 'front_lever',
  tuck_back_lever: 'back_lever_tuck',
  straddle_back_lever: 'back_lever_straddle',
  full_back_lever: 'back_lever',
  tuck_planche: 'planche_tuck',
  straddle_planche: 'planche_straddle',
  full_planche: 'planche_full',
};

interface ExerciseIconProps {
  name: ExerciseIconName | string;
  size?: number;
  color: string;
}

export function ExerciseIcon({ name, size = 18, color }: ExerciseIconProps) {
  const glyph = GLYPHS[name as ExerciseIconName] ?? GLYPHS.squat;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyph.head && glyph.head[2] > 0 && (
        <Circle
          cx={glyph.head[0]}
          cy={glyph.head[1]}
          r={glyph.head[2]}
          stroke={color}
          strokeWidth={2}
          fill="none"
        />
      )}
      {glyph.paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

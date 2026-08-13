// Leap — Rank Up milestone screen. Matches the real app's component
// language: coral brand accent, pure black, ring+number tier badge,
// bold condensed sans throughout. No shake/jitter, no invented hues.

const CORAL = '#FC5454';
const CORAL_DIM = '#4A2020';
const INK = '#000000';
const MUTED = '#808080';

const FONT = "'Oswald', 'Arial Narrow', sans-serif";

// ── three motion helpers — nothing else in this file eases or transforms ──
const MOTION = {
  enter: (start, end, dist = 18) => (T) => {
    const p = animate({ from: 0, to: 1, start, end, ease: Easing.easeOutCubic })(T);
    return { opacity: p, y: (1 - p) * dist };
  },
  pop: (start, end) => (T) => {
    const p = animate({ from: 0, to: 1, start, end, ease: Easing.easeOutBack })(T);
    const fade = animate({ from: 0, to: 1, start, end: start + (end - start) * 0.5, ease: Easing.easeOutCubic })(T);
    return { scale: p, opacity: fade };
  },
  ring: (start, dur, maxScale = 2.6) => (T) => {
    const p = animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic })(T);
    const scale = 0.3 + p * (maxScale - 0.3);
    const opacity = T < start ? 0 : (1 - p) * 0.5;
    return { scale, opacity };
  },
};

function GlowRing({ cx, cy, start, dur, maxScale, T }) {
  const { scale, opacity } = MOTION.ring(start, dur, maxScale)(T);
  const size = 220;
  return React.createElement('div', {
    style: {
      position: 'absolute', left: cx, top: cy, width: size, height: size,
      marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%',
      border: `1px solid ${CORAL}`, opacity, transform: `scale(${scale})`,
      pointerEvents: 'none',
    },
  });
}

function Sparkle({ angle, start, dur, dist, T }) {
  const p = animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic })(T);
  const fade = animate({ from: 1, to: 0, start: start + dur * 0.5, end: start + dur, ease: Easing.linear })(T);
  const r = p * dist;
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * r, y = Math.sin(rad) * r;
  const s = 3.5 - p * 2;
  return React.createElement('div', {
    style: {
      position: 'absolute', left: 201, top: 296, width: Math.max(s, 1), height: Math.max(s, 1),
      marginLeft: -s / 2, marginTop: -s / 2, borderRadius: '50%',
      background: CORAL, opacity: T < start ? 0 : Math.max(fade, 0) * 0.85,
      transform: `translate(${x}px, ${y}px)`, pointerEvents: 'none',
    },
  });
}

// stacked tier rings — mirrors the Profile screen's ring stack: one
// concentric ring per tier reached. Each ring is thrown into place in
// sequence (flung in with overshoot + rotation, not drawn/loaded).
function ThrownRing({ radius, delay, throwFrom, throwDur, current, T }) {
  const start = throwFrom + delay;
  const p = animate({ from: 0, to: 1, start, end: start + throwDur, ease: Easing.easeOutBack })(T);
  const scale = 0.3 + p * 0.7;
  const rot = (1 - p) * -140;
  const opacity = T < start ? 0 : Math.min(p * 1.6, 1);
  return React.createElement('circle', {
    cx: 0, cy: 0, r: radius, fill: 'none',
    stroke: current ? CORAL : CORAL_DIM, strokeWidth: current ? 3 : 2,
    opacity, transform: `rotate(${rot}) scale(${scale})`,
    style: { transformOrigin: '0 0' },
  });
}

function Badge({ number, tierCount, throwFrom, throwDur, popFrom, popTo, T, style }) {
  const numberM = MOTION.pop(popFrom, popTo)(T);
  const rings = [];
  for (let i = 0; i < tierCount; i++) {
    rings.push(React.createElement(ThrownRing, {
      key: i, radius: 40 + i * 14, delay: i * 0.16, throwFrom, throwDur,
      current: i === tierCount - 1, T,
    }));
  }
  return React.createElement('div', { style: { position: 'absolute', ...style } },
    React.createElement('svg', { width: 200, height: 200, viewBox: '-100 -100 200 200' },
      rings,
      React.createElement('text', {
        x: 0, y: 14, textAnchor: 'middle', fontFamily: FONT, fontWeight: 700,
        fontSize: 60, fill: CORAL, opacity: numberM.opacity,
        transform: `scale(${numberM.scale})`,
      }, number)
    )
  );
}

function ShimmerText({ children, T, start, end, style }) {
  const sweep = animate({ from: -30, to: 130, start, end, ease: Easing.easeInOutCubic })(T);
  return React.createElement('div', {
    style: {
      ...style,
      backgroundImage: `linear-gradient(100deg, #fff 0%, #fff ${sweep - 22}%, ${CORAL} ${sweep}%, #fff ${sweep + 22}%, #fff 100%)`,
      backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text',
      color: 'transparent', WebkitTextFillColor: 'transparent',
    },
  }, children);
}

function ConfettiBit({ x, y, delay, start, dur, drift, rot, T }) {
  const s = start + delay;
  const p = animate({ from: 0, to: 1, start: s, end: s + dur, ease: Easing.easeOutCubic })(T);
  const fade = animate({ from: 1, to: 0, start: s + dur * 0.5, end: s + dur, ease: Easing.linear })(T);
  return React.createElement('div', {
    style: {
      position: 'absolute', left: x, top: y, width: 6, height: 10, borderRadius: 2,
      background: p > 0.5 ? CORAL : CORAL_DIM,
      opacity: T < s ? 0 : Math.max(fade, 0) * 0.9,
      transform: `translateY(${-p * drift}px) rotate(${p * rot}deg)`,
      pointerEvents: 'none',
    },
  });
}

function ProgressBar({ start, dur, T }) {
  const p = animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic })(T);
  const pulse = animate({ from: 0, to: 1, start: start + dur, end: start + dur + 0.5, ease: Easing.easeOutCubic })(T);
  const burstOpacity = T < start + dur ? 0 : Math.max(1 - pulse, 0);
  const confetti = [
    [10, 30, 0.55, 220], [40, 44, 0.15, 260], [80, 26, 0.7, 240], [130, 40, 0.3, 280],
    [180, 28, 0.5, 230], [220, 46, 0.65, 250], [260, 24, 0.1, 270], [282, 42, 0.4, 240],
  ];
  return React.createElement('div', { style: { position: 'absolute', left: 60, right: 60, top: 560 } },
    confetti.map(([x, y, delay, drift], i) => React.createElement(ConfettiBit, {
      key: i, x, y: -y, delay, start, dur: 0.8, drift, rot: 140 + i * 30, T,
    })),
    React.createElement('div', {
      style: { height: 8, borderRadius: 4, background: CORAL_DIM, overflow: 'hidden', position: 'relative' },
    },
      React.createElement('div', {
        style: {
          position: 'absolute', inset: 0, width: `${p * 100}%`, borderRadius: 4,
          background: CORAL, boxShadow: `0 0 ${6 + pulse * 10}px ${CORAL}`,
        },
      })
    ),
    React.createElement('div', {
      style: {
        position: 'absolute', right: 0, top: -6, width: 20, height: 20, borderRadius: '50%',
        background: CORAL, opacity: burstOpacity, transform: `scale(${1 + pulse * 2.2})`,
        boxShadow: `0 0 20px ${CORAL}`,
      },
    }),
    React.createElement('div', {
      style: { marginTop: 8, textAlign: 'center', color: MUTED, fontSize: 12, letterSpacing: 1 },
    }, 'TIER PROGRESS · MAXED')
  );
}

function LevelUpPiece() {
  const { T, CUES } = useComposition();

  const flash = animate({ from: 0.4, to: 0, start: 0, end: CUES.Rings + 0.15, ease: Easing.easeOutCubic })(T);
  const glow = animate({ from: 0, to: 1, start: 0, end: CUES.Forge, ease: Easing.easeOutCubic })(T);

  const labelM = MOTION.enter(0.15, 0.45)(T);
  const rankM = MOTION.enter(CUES.Reveal, CUES.Reveal + 0.45)(T);
  const subM = MOTION.enter(CUES.Reveal + 0.15, CUES.Reveal + 0.55)(T);
  const timeM = MOTION.enter(CUES.Stats, CUES.Stats + 0.4)(T);
  const ctaM = MOTION.pop(CUES.Hold, CUES.Hold + 0.4)(T);

  const sparkAngles = [10, 70, 130, 190, 250, 310];

  return React.createElement('div', {
    style: {
      position: 'absolute', inset: 0, background: INK,
      overflow: 'hidden', fontFamily: FONT,
    },
  },
    React.createElement('div', {
      style: { position: 'absolute', inset: 0, background: '#fff', opacity: flash, pointerEvents: 'none' },
    }),
    React.createElement('div', {
      style: {
        position: 'absolute', left: 201, top: 296, width: 340, height: 340, marginLeft: -170, marginTop: -170,
        borderRadius: '50%', background: `radial-gradient(circle, ${CORAL}22 0%, transparent 70%)`,
        opacity: glow, pointerEvents: 'none',
      },
    }),
    React.createElement(GlowRing, { cx: 201, cy: 296, start: CUES.Rings, dur: 0.9, maxScale: 2.8, T }),
    React.createElement(GlowRing, { cx: 201, cy: 296, start: CUES.Rings + 0.15, dur: 0.8, maxScale: 2.1, T }),
    sparkAngles.map((a, i) => React.createElement(Sparkle, { key: i, angle: a, start: CUES.Rings + i * 0.05, dur: 0.9, dist: 120 + (i % 3) * 16, T })),

    React.createElement('div', {
      style: {
        position: 'absolute', top: 68, left: 0, right: 0, textAlign: 'center',
        opacity: labelM.opacity, transform: `translateY(${labelM.y}px)`,
        color: CORAL, fontSize: 13, letterSpacing: 5, fontWeight: 500,
      },
    }, 'RANK UP'),

    React.createElement(Badge, {
      number: '5', tierCount: 5, throwFrom: CUES.Forge, throwDur: 0.4,
      popFrom: CUES.Forge + 0.7, popTo: CUES.Forge + 1.0, T,
      style: { left: 101, top: 150 },
    }),

    React.createElement('div', {
      style: {
        position: 'absolute', left: 0, right: 0, top: 388, textAlign: 'center',
        opacity: rankM.opacity, transform: `translateY(${rankM.y}px)`,
      },
    },
      React.createElement(ShimmerText, {
        T, start: CUES.Reveal + 0.1, end: CUES.Reveal + 0.9,
        style: { fontFamily: FONT, fontWeight: 700, fontSize: 38, letterSpacing: 2 },
      }, 'LOCHAGOS')
    ),

    React.createElement('div', {
      style: {
        position: 'absolute', left: 0, right: 0, top: 440, textAlign: 'center',
        opacity: subM.opacity, transform: `translateY(${subM.y}px)`,
        color: CORAL, fontSize: 15, letterSpacing: 2, fontWeight: 500,
      },
    }, 'TIER 5 OF 9'),

    React.createElement('div', {
      style: {
        position: 'absolute', left: 0, right: 0, top: 484, textAlign: 'center',
        opacity: timeM.opacity, transform: `translateY(${timeM.y}px)`,
        color: MUTED, fontSize: 16, letterSpacing: 1, fontWeight: 300,
      },
    }, 'Time: 6:34'),

    React.createElement(ProgressBar, { start: CUES.Stats + 0.2, dur: 0.6, T }),

    React.createElement('div', {
      style: {
        position: 'absolute', left: 40, right: 40, bottom: 90, height: 58, borderRadius: 16,
        opacity: ctaM.opacity, transform: `scale(${ctaM.scale})`,
        background: CORAL,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 10px 24px ${CORAL}44`,
      },
    },
      React.createElement('span', {
        style: { color: '#fff', fontFamily: FONT, fontWeight: 600, fontSize: 15, letterSpacing: 3 },
      }, 'CONTINUE')
    )
  );
}

function LevelUpApp() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return React.createElement(React.Fragment, null,
    React.createElement(IOSDevice, { dark: true, width: 402, height: 874 },
      React.createElement(CompositionStage, {
        width: 402, height: 874, bg: INK,
        scenes: window.OM_SCENES, playback: window.OM_PLAYBACK,
      }, React.createElement(LevelUpPiece))
    ),
    React.createElement(TweaksPanel, null,
      React.createElement(TweakSection, { label: 'Playback' }),
      React.createElement(TweakToggle, {
        label: 'Motion editor', value: t.motionEditor,
        onChange: (v) => setTweak('motionEditor', v),
      })
    )
  );
}

Object.assign(window, { LevelUpApp });

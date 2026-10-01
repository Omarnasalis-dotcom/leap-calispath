// Leap — Onboarding welcome, v2. Three directions sharing one script:
// A Rise  — words rise out of a mask, story-style progress bars up top
// B Leap  — a coral dot leaps along a track; each landing delivers a line
// C Fill  — an outlined LEAP wordmark fills like a level bar, line by line
const CORAL = '#FC5454';
const FONT = "'Oswald', 'Arial Narrow', sans-serif";
const h = React.createElement;
const tw = (s, e, ease = Easing.easeOutCubic) => (T) => animate({ from: 0, to: 1, start: s, end: e, ease })(T);

function lines(name) {
  return [
    [['Hi, ', 0], [name, 1]],
    [['Welcome to ', 0], ['Leap Arena', 1]],
    [['3 steps', 1], [' to your first workout', 0]],
  ];
}
function windows(C) {
  const s = [0, C.Welcome, C.Minutes];
  return s.map((st, i) => ({ start: st, end: i < s.length - 1 ? s[i + 1] : Infinity }));
}
const spans = (parts) => parts.map((p, k) => h('span', { key: k, style: { color: p[1] ? CORAL : '#fff' } }, p[0]));
function Kicker({ T, top }) {
  const p = tw(0.05, 0.45)(T);
  return h('div', { style: { position: 'absolute', top, left: 0, right: 0, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 8}px)`, color: CORAL, fontSize: 12, fontWeight: 600, letterSpacing: 4 } }, 'LEAP ARENA');
}

/* ---------- A · RISE ---------- */
function RiseA({ T, W, L }) {
  const idx = W.findIndex((w) => T >= w.start && T < w.end);
  return h(React.Fragment, null,
    h('div', { style: { position: 'absolute', top: 64, left: 24, right: 24, display: 'flex', gap: 5 } },
      W.map((w, i) => {
        const end = w.end === Infinity ? w.start + 1.6 : w.end;
        const f = animate({ from: 0, to: 1, start: w.start, end, ease: Easing.linear })(T);
        return h('div', { key: i, style: { flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.14)', overflow: 'hidden' } },
          h('div', { style: { width: `${f * 100}%`, height: '100%', background: CORAL } }));
      })),
    h('div', { style: { position: 'absolute', top: 96, left: 32, color: CORAL, fontSize: 12, fontWeight: 600, letterSpacing: 4, opacity: tw(0.05, 0.4)(T) } }, 'LEAP ARENA'),
    h('div', { style: { position: 'absolute', top: 316, left: 32, height: 4, borderRadius: 2, background: CORAL, width: idx < 0 ? 0 : 12 + 36 * tw(W[idx].start, W[idx].start + 0.5, Easing.easeOutExpo)(T) } }),
    h('div', { style: { position: 'absolute', top: 340, left: 32, right: 28, height: 170, overflow: 'hidden' } },
      W.map((w, i) => {
        if (T < w.start || T >= w.end) return null;
        const out = w.end === Infinity ? 0 : tw(w.end - 0.32, w.end, Easing.easeInCubic)(T);
        const words = [];
        L[i].forEach(([txt, acc]) => txt.split(/(\s+)/).forEach((t) => t && words.push([t, acc])));
        let k = 0;
        return h('div', { key: i, style: { position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${-out * 110}%)`, opacity: 1 - out * 0.6, fontSize: 50, fontWeight: 700, lineHeight: 1.04, textTransform: 'uppercase', letterSpacing: .4 } },
          words.map(([t, acc], j) => {
            if (/^\s+$/.test(t)) return h('span', { key: j }, ' ');
            const d = w.start + 0.04 + (k++) * 0.07;
            const p = tw(d, d + 0.6, Easing.easeOutExpo)(T);
            return h('span', { key: j, style: { display: 'inline-block', transform: `translateY(${(1 - p) * 120}%)`, color: acc ? CORAL : '#fff' } }, t);
          }));
      }))
  );
}

/* ---------- B · LEAP ---------- */
function LeapB({ T, W, L }) {
  const xs = [72, 158, 244, 330], G = 600, H = 120, JUMP = 0.55;
  let i = 0; W.forEach((w, j) => { if (T >= w.start) i = j; });
  const s = W[i].start, p = Easing.easeInOutSine(Math.min(1, Math.max(0, (T - s) / JUMP)));
  let x, y;
  if (i === 0) { x = xs[0]; y = G - 340 * (1 - Easing.easeInQuad(Math.min(1, Math.max(0, T / JUMP)))); }
  else { x = xs[i - 1] + (xs[i] - xs[i - 1]) * p; y = G - 4 * H * p * (1 - p); }
  const land = s + JUMP, sq = tw(land, land + 0.28, Easing.linear)(T), a = T >= land ? Math.sin(sq * Math.PI) * 0.35 : 0;
  const rp = tw(land, land + 0.7, Easing.easeOutCubic)(T);
  const dotOp = i === 0 ? tw(0, 0.12)(T) : 1;
  return h(React.Fragment, null,
    h(Kicker, { T, top: 110 }),
    h('div', { style: { position: 'absolute', top: G, left: 40, right: 40, height: 2, marginTop: -1, background: '#1f1f1f' } }),
    h('div', { style: { position: 'absolute', top: G, left: 40, height: 2, marginTop: -1, width: Math.max(0, (T >= land || i > 0 ? x : 40) - 40), background: CORAL } }),
    xs.map((mx, j) => h('div', { key: j, style: { position: 'absolute', top: G - 3, left: mx - 3, width: 6, height: 6, borderRadius: 3, background: j < i || (j === i && T >= land) ? CORAL : '#2a2a2a' } })),
    T >= land && rp < 1 ? h('div', { style: { position: 'absolute', left: x, top: G, width: 64, height: 64, marginLeft: -32, marginTop: -32, borderRadius: '50%', border: `1.5px solid ${CORAL}`, opacity: (1 - rp) * 0.6, transform: `scale(${0.25 + rp * 0.9})` } }) : null,
    h('div', { style: { position: 'absolute', left: x - 9, top: y - 18, width: 18, height: 18, borderRadius: '50%', background: CORAL, opacity: dotOp, transformOrigin: '50% 100%', transform: `scale(${1 + a}, ${1 - a})`, boxShadow: '0 0 18px rgba(252,84,84,.55)' } }),
    W.map((w, j) => {
      const inS = w.start + JUMP - 0.12;
      if (T < inS || T >= w.end) return null;
      const pi = tw(inS, inS + 0.45)(T), po = w.end === Infinity ? 0 : tw(w.end - 0.28, w.end, Easing.easeInCubic)(T);
      return h('div', { key: j, style: { position: 'absolute', top: 330, left: 36, right: 36, textAlign: 'center', fontSize: 40, fontWeight: 700, lineHeight: 1.12, textTransform: 'uppercase', letterSpacing: .4, textWrap: 'balance', opacity: pi * (1 - po), transform: `translateY(${(1 - pi) * 18 - po * 10}px) scale(${0.96 + pi * 0.04})` } }, spans(L[j]));
    })
  );
}

/* ---------- C · FILL ---------- */
function FillC({ T, W, L }) {
  const fEnd = W[W.length - 1].start + 1.1;
  const f = 100 * tw(0.25, fEnd, (x) => x)(T);
  const appear = tw(0, 0.5)(T), glow = tw(fEnd, fEnd + 0.5)(T);
  const word = { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', fontSize: 176, fontWeight: 700, lineHeight: 1, letterSpacing: 6 };
  return h(React.Fragment, null,
    h('div', { style: { position: 'absolute', top: 200, left: 0, right: 0, height: 180, opacity: appear, transform: `scale(${0.94 + appear * 0.06})`, filter: `drop-shadow(0 0 ${glow * 28}px rgba(252,84,84,${glow * 0.5}))` } },
      h('div', { style: { ...word, color: 'transparent', WebkitTextStroke: '1.5px rgba(252,84,84,.5)' } }, 'LEAP'),
      h('div', { style: { ...word, color: CORAL, clipPath: `inset(${100 - f}% 0 0 0)` } }, 'LEAP')),
    h('div', { style: { position: 'absolute', top: 392, left: 0, right: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, letterSpacing: 10, color: '#8a8a8a', opacity: tw(0.2, 0.7)(T), paddingLeft: 10 } }, 'ARENA'),
    W.map((w, j) => {
      if (T < w.start || T >= w.end) return null;
      const pi = tw(w.start + 0.15, w.start + 0.6)(T), po = w.end === Infinity ? 0 : tw(w.end - 0.28, w.end, Easing.easeInCubic)(T);
      return h('div', { key: j, style: { position: 'absolute', top: 500, left: 36, right: 36, textAlign: 'center', fontSize: 32, fontWeight: 600, lineHeight: 1.18, textTransform: 'uppercase', letterSpacing: .4, textWrap: 'balance', opacity: pi * (1 - po), transform: `translateY(${(1 - pi) * 14 - po * 8}px)` } }, spans(L[j]));
    }),
    h('div', { style: { position: 'absolute', bottom: 110, left: 0, right: 0, textAlign: 'center', fontSize: 12, fontWeight: 600, letterSpacing: 2.4, color: '#6a6a6a' } }, `${Math.round(f)}%`)
  );
}

function VideoBG({ T, src, dim, look, blur, speed }) {
  const sp = speed || 0.75;
  const ref = React.useRef(null);
  React.useEffect(() => {
    const v = ref.current; if (!v || !v.duration) return;
    if (v.playbackRate !== sp) v.playbackRate = sp;
    const want = (T * sp) % v.duration;
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
  }, [Math.floor(T * 4)]);
  const d = dim == null ? 0.6 : dim;
  const LOOKS = {
    clean: { f: 'saturate(.85) contrast(1.05) brightness(.95)', tint: null, clean: true },
    dark: { f: 'grayscale(.35) contrast(1.05)', tint: null },
    mono: { f: 'grayscale(1) contrast(1.2) brightness(.9)', tint: null },
    coral: { f: 'grayscale(1) contrast(1.15)', tint: 'rgba(252,84,84,.45)', blend: 'multiply' },
    blur: { f: 'blur(6px) saturate(.8)', tint: null },
    cinema: { f: 'saturate(.7) contrast(1.2) sepia(.15)', tint: 'rgba(20,10,40,.35)', blend: 'color' },
  };
  const L = LOOKS[look] || LOOKS.clean;
  return h('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden', backgroundImage: 'url(./assets/day-cover.png)', backgroundSize: 'cover', backgroundPosition: 'center' } },
    h('video', { ref, src, poster: './assets/day-cover.png', autoPlay: true, muted: true, loop: true, playsInline: true,
      onError: (e) => { e.currentTarget.style.display = 'none'; },
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: `${L.f} blur(${blur || 0}px)`, transform: `scale(${1.04 + (blur || 0) * 0.01 + T * 0.004})` } }),
    L.tint ? h('div', { style: { position: 'absolute', inset: 0, background: L.tint, mixBlendMode: L.blend } }) : null,
    L.clean
      ? h('div', { style: { position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,${0.35 + d * 0.3}) 0%, rgba(0,0,0,${d * 0.5}) 35%, rgba(0,0,0,${d * 0.5}) 62%, rgba(0,0,0,${0.55 + d * 0.35}) 100%)` } })
      : h(React.Fragment, null,
        h('div', { style: { position: 'absolute', inset: 0, background: `rgba(0,0,0,${d})` } }),
        h('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 30%, rgba(0,0,0,.25) 60%, rgba(0,0,0,.85) 100%)' } }),
        h('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,.5) 100%)' } })));
}

/* ---------- D · SLIDE ---------- */
function SlideD({ T, W, L }) {
  let cur = 0; W.forEach((w, j) => { if (T >= w.start) cur = j; });
  return h(React.Fragment, null,
    h(Kicker, { T, top: 110 }),
    W.map((w, j) => {
      if (T < w.start || T >= w.end) return null;
      const pi = tw(w.start + 0.02, w.start + 0.6, Easing.easeOutExpo)(T), po = w.end === Infinity ? 0 : tw(w.end - 0.3, w.end, Easing.easeInCubic)(T);
      return h('div', { key: j, style: { position: 'absolute', top: 350, left: 32, right: 32, opacity: Math.min(1, pi * 1.4) * (1 - po), transform: `translateX(${(1 - pi) * 240 - po * 240}px)` } },
        h('div', { style: { fontSize: 46, fontWeight: 700, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: .4, textWrap: 'balance' } }, spans(L[j])),
        h('div', { style: { marginTop: 18, height: 3, borderRadius: 2, background: CORAL, width: 56 * tw(w.start + 0.25, w.start + 0.8, Easing.easeOutExpo)(T) } }));
    }),
    h('div', { style: { position: 'absolute', bottom: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 } },
      W.map((w, j) => {
        const on = tw(w.start, w.start + 0.4, Easing.easeOutCubic)(T), off = j < cur ? tw(W[j + 1].start, W[j + 1].start + 0.4)(T) : 0;
        const a = on * (1 - off);
        return h('div', { key: j, style: { width: 6 + a * 18, height: 6, borderRadius: 3, background: a > 0.01 ? CORAL : j < cur ? 'rgba(252,84,84,.55)' : 'rgba(255,255,255,.28)' } });
      }))
  );
}

/* ---------- E · TYPE ---------- */
function TypeE({ T, W, L }) {
  const cut = (parts, n) => { const o = []; parts.forEach(([s, a]) => { const k = Math.max(0, Math.min(n, s.length)); if (k) o.push([s.slice(0, k), a]); n -= s.length; }); return o; };
  return h(React.Fragment, null,
    h(Kicker, { T, top: 110 }),
    W.map((w, j) => {
      if (T < w.start || T >= w.end) return null;
      const len = L[j].reduce((s, p) => s + p[0].length, 0);
      const rate = w.end === Infinity ? 0.034 : Math.min(0.034, (w.end - w.start - 0.5) / len);
      const typed = Math.floor(Math.max(0, T - w.start - 0.12) / rate);
      const del = w.end === Infinity ? 0 : Math.floor(Math.max(0, T - (w.end - 0.3)) / 0.3 * len);
      const n = Math.max(0, Math.min(len, typed) - del);
      const typing = typed < len || del > 0;
      const blink = typing || Math.floor(T * 2.6) % 2 === 0;
      return h('div', { key: j, style: { position: 'absolute', top: 350, left: 32, right: 32, fontSize: 44, fontWeight: 700, lineHeight: 1.08, textTransform: 'uppercase', letterSpacing: .4 } },
        spans(cut(L[j], n)),
        h('span', { style: { display: 'inline-block', width: 4, height: 40, marginLeft: 4, verticalAlign: '-4px', background: CORAL, opacity: blink ? 1 : 0 } }));
    })
  );
}

/* ---------- F · FOCUS ---------- */
function FocusF({ T, W, L }) {
  return h(React.Fragment, null,
    h(Kicker, { T, top: 110 }),
    W.map((w, j) => {
      if (T < w.start || T >= w.end) return null;
      const pi = tw(w.start + 0.05, w.start + 0.85, Easing.easeOutCubic)(T), po = w.end === Infinity ? 0 : tw(w.end - 0.32, w.end, Easing.easeInCubic)(T);
      return h('div', { key: j, style: { position: 'absolute', top: 360, left: 28, right: 28, textAlign: 'center', fontSize: 40, fontWeight: 700, lineHeight: 1.12, textTransform: 'uppercase', textWrap: 'balance', letterSpacing: 0.4 + (1 - pi) * 12, opacity: pi * (1 - po), filter: `blur(${(1 - pi) * 12 + po * 10}px)`, transform: `scale(${1.08 - pi * 0.08 + po * 0.04})` } }, spans(L[j]));
    })
  );
}

function OnboardingWelcomeV2({ name, variant, video, dim, look, blur, speed }) {
  const { T, CUES } = useComposition();
  const n = name && name.trim() ? name.trim() : 'Jordan';
  const P = { T, W: windows(CUES), L: lines(n) };
  const V = { B: LeapB, C: FillC, D: SlideD, E: TypeE, F: FocusF }[variant] || RiseA;
  return h('div', { style: { position: 'absolute', inset: 0, background: '#000', overflow: 'hidden', fontFamily: FONT, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.35)' } }, h(VideoBG, { T, src: video, dim, look, blur, speed }), h(V, P), h(SkipBtn, null));
}

function SkipBtn() {
  const { time, duration, setTime, setPlaying } = useTimeline();
  const done = time >= duration - 0.05;
  return h('button', {
    onClick: () => { setPlaying(false); setTime(duration); },
    style: { position: 'absolute', top: 58, right: 20, zIndex: 5, height: 44, padding: '0 18px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 22, background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer', opacity: done ? 0 : 1, pointerEvents: done ? 'none' : 'auto', transition: 'opacity .25s', textShadow: 'none' }
  }, 'Skip');
}

function OnboardingWelcomeV2App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return h(React.Fragment, null,
    h(IOSDevice, { dark: true, width: 402, height: 874 },
      h(CompositionStage, { width: 402, height: 874, bg: '#000', scenes: window.OM_SCENES, playback: window.OM_PLAYBACK },
        h(OnboardingWelcomeV2, { name: t.userName, variant: t.variant, video: t.videoSrc, dim: t.dim, look: t.look, blur: t.blur, speed: t.videoSpeed }))),
    h(TweaksPanel, null,
      h(TweakSection, { label: 'Direction' }),
      h(TweakSelect, { label: 'Option', value: t.variant, options: [{ value: 'A', label: 'A — Rise' }, { value: 'B', label: 'B — Leap' }, { value: 'C', label: 'C — Fill' }, { value: 'D', label: 'D — Slide' }, { value: 'E', label: 'E — Type' }, { value: 'F', label: 'F — Focus' }], onChange: (v) => setTweak('variant', v) }),
      h(TweakSection, { label: 'Background video' }),
      h(TweakText, { label: 'Video file', value: t.videoSrc, onChange: (v) => setTweak('videoSrc', v) }),
      h(TweakSelect, { label: 'Filter', value: t.look || 'clean', options: [{ value: 'clean', label: 'Clean' }, { value: 'dark', label: 'Dark' }, { value: 'mono', label: 'Black & white' }, { value: 'coral', label: 'Coral tint' }, { value: 'blur', label: 'Soft blur' }, { value: 'cinema', label: 'Cinematic' }], onChange: (v) => setTweak('look', v) }),
      h(TweakSlider, { label: 'Video speed', value: t.videoSpeed || 0.75, min: 0.25, max: 1, step: 0.05, unit: '×', onChange: (v) => setTweak('videoSpeed', v) }),
      h(TweakSlider, { label: 'Blur', value: t.blur || 0, min: 0, max: 20, step: 1, unit: 'px', onChange: (v) => setTweak('blur', v) }),
      h(TweakSlider, { label: 'Darken', value: t.dim, min: 0.2, max: 0.85, step: 0.05, onChange: (v) => setTweak('dim', v) }),
      h(TweakSection, { label: 'Content' }),
      h(TweakText, { label: 'First name', value: t.userName, onChange: (v) => setTweak('userName', v) }))
  );
}
Object.assign(window, { OnboardingWelcomeV2App });

// Leap Journey badges · static SVG generator (viewBox 0 0 160 160).
// LeapBadge.svg(level 0–8, { size, parts:['rays','wingL','wingR','body','gem'], simple, hot, uid })
// level 0 = empty slot. simple = small-size variant (≤40px). hot = forge-heated palette (Determined reveal).
(function () {
  const WC = ['#8E6BFF', '#FF4A3D', '#FF6B2C'];
  const NAMES = [
    null,
    { en: 'RISING', ar: 'الصاعد', pts: 100, tone: '#A3AAB2', mat: 'Stone' },
    { en: 'CONSISTENT', ar: 'المواظب', pts: 300, tone: '#7FC0D8', mat: 'Tempered slate' },
    { en: 'COMMITTED', ar: 'الملتزم', pts: 750, tone: '#E3A774', mat: 'Bronze' },
    { en: 'DETERMINED', ar: 'المثابر', pts: 1500, tone: '#FF8A4C', mat: 'Forged steel' },
    { en: 'WARRIOR', ar: 'المحارب', pts: 3000, tone: '#F0524A', mat: 'Crimson enamel + silver' },
    { en: 'CHAMPION', ar: 'البطل', pts: 5000, tone: '#FFD36B', mat: 'Royal enamel + gold wings' },
    { en: 'ELITE', ar: 'النخبة', pts: 8000, tone: '#A98BFF', mat: 'Amethyst + platinum + gem' },
    { en: 'LEGEND', ar: 'الأسطورة', pts: 12000, tone: '#FF7BB0', mat: 'Prismatic' },
  ];
  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (cx, cy, r, deg) => { const a = (deg * Math.PI) / 180; return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))]; };
  const poly = (cx, cy, r, n, rot) => Array.from({ length: n }, (_, k) => P(cx, cy, r, rot + (360 / n) * k).join(',')).join(' ');
  const lg = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const SHIELD = 'M80 26 L122 40 L122 82 C122 108 104 126 80 138 C56 126 38 108 38 82 L38 40 Z';
  const CREST = 'M80 30 L94 38 L122 34 L122 84 C122 108 104 126 80 140 C56 126 38 108 38 84 L38 34 L66 38 Z';
  const FEATHERS = ['M42 46 C28 34 14 30 4 32 C10 42 22 52 40 60 Z', 'M41 62 C28 54 16 52 6 56 C14 66 26 72 40 76 Z', 'M41 78 C30 72 20 72 12 78 C20 86 30 90 42 92 Z'];
  const FEATHER0 = 'M44 34 C34 20 22 12 8 10 C12 24 24 36 42 46 Z';
  const BLADE = 'M40 48 C24 38 8 38 0 42 C8 62 24 76 40 82 Z';

  function mark(cx, cy, r, sw, col, simple) {
    if (simple) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"/>`;
    const gaps = [-90, 30, 150], g = 17;
    let s = '';
    for (let i = 0; i < 3; i++) {
      const a1 = gaps[i] + g, a2 = gaps[(i + 1) % 3] - g + (i === 2 ? 360 : 0);
      const [x1, y1] = P(cx, cy, r, a1), [x2, y2] = P(cx, cy, r, a2);
      s += `<path d="M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    gaps.forEach((a, i) => { const [x, y] = P(cx, cy, r, a); s += `<circle cx="${x}" cy="${y}" r="${r2(r * 0.17)}" fill="${WC[i]}"/>`; });
    return s;
  }

  function wings(side, fill, stroke, opts) {
    const { simple, scale = 1, legend } = opts;
    const list = simple ? [BLADE] : legend ? [FEATHER0, ...FEATHERS] : FEATHERS;
    const inner = list.map((d) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${simple ? 4 : 1.2}" stroke-linejoin="round"/>`).join('');
    const sc = scale !== 1 ? `translate(40 64) scale(${scale}) translate(-40 -64)` : '';
    const mir = side === 'R' ? 'translate(160 0) scale(-1 1) ' : '';
    return `<g transform="${mir}${sc}">${inner}</g>`;
  }

  function build(level, o) {
    const u = o.uid || 'b' + Math.random().toString(36).slice(2, 8);
    const simple = !!o.simple, hot = !!o.hot;
    const parts = o.parts || ['rays', 'wingL', 'wingR', 'body', 'gem'];
    const has = (p) => parts.includes(p);
    let defs = '', rays = '', wl = '', wr = '', body = '', gem = '';
    const sw = simple ? 9 : 3;
    if (level === 0) {
      body = `<circle cx="80" cy="80" r="${simple ? 62 : 58}" fill="none" stroke="${o.slot || '#5a5a5a'}" stroke-width="${simple ? 9 : 3}" stroke-dasharray="${simple ? '16 14' : '7 7'}" stroke-linecap="round"/>`;
    }
    if (level === 1) {
      defs += lg(u + 'f', [[0, '#737a83'], [1, '#383d44']]);
      body = simple
        ? `<circle cx="80" cy="80" r="64" fill="url(#${u}f)" stroke="#a3aab2" stroke-width="10"/>${mark(80, 80, 26, 10, '#eef1f4', 1)}`
        : `<circle cx="80" cy="80" r="54" fill="url(#${u}f)" stroke="#a3aab2" stroke-width="3"/><circle cx="80" cy="80" r="47" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1"/>${mark(80, 80, 22, sw, '#eef1f4')}`;
    }
    if (level === 2) {
      defs += lg(u + 'f', [[0, '#4f7587'], [1, '#1c303b']]);
      const ticks = simple ? '' : Array.from({ length: 12 }, (_, k) => `<rect x="78" y="10" width="4" height="9" rx="2" fill="#9cc6d8" transform="rotate(${k * 30} 80 80)"/>`).join('');
      body = simple
        ? `<circle cx="80" cy="80" r="72" fill="none" stroke="#9cc6d8" stroke-width="6"/><circle cx="80" cy="80" r="56" fill="url(#${u}f)" stroke="#9cc6d8" stroke-width="9"/>${mark(80, 80, 22, 9, '#e8f6fb', 1)}`
        : `${ticks}<circle cx="80" cy="80" r="55" fill="url(#${u}f)" stroke="#9cc6d8" stroke-width="3"/><circle cx="80" cy="80" r="47" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>${mark(80, 80, 22, sw, '#e8f6fb')}`;
    }
    if (level === 3) {
      defs += lg(u + 'f', [[0, '#f0b886'], [0.5, '#c27f4b'], [1, '#7a4524']]) + lg(u + 'i', [[0, '#2e1c11'], [1, '#120a05']]);
      body = simple
        ? `<polygon points="${poly(80, 80, 74, 8, 22.5)}" fill="url(#${u}f)"/><circle cx="80" cy="80" r="44" fill="url(#${u}i)"/>${mark(80, 80, 22, 9, '#f6d2ae', 1)}`
        : `<polygon points="${poly(80, 80, 66, 8, 22.5)}" fill="url(#${u}f)" stroke="#f6cfa6" stroke-width="1.5" stroke-linejoin="round"/><polygon points="${poly(80, 80, 58, 8, 22.5)}" fill="none" stroke="rgba(60,30,10,.45)" stroke-width="1.5"/><circle cx="80" cy="80" r="45" fill="url(#${u}i)" stroke="#f1c49a" stroke-width="2"/>${mark(80, 80, 22, sw, '#f6d2ae')}`;
    }
    if (level === 4) {
      defs += hot
        ? lg(u + 'f', [[0, '#ffe8a0'], [0.45, '#ff7a2c'], [1, '#9e1c0c']]) + lg(u + 'i', [[0, '#6a1a08'], [1, '#2a0804']])
        : lg(u + 'f', [[0, '#f2f5f8'], [0.5, '#aab3bd'], [1, '#69727c']]) + lg(u + 'i', [[0, '#313840'], [1, '#15191d']]);
      const rivets = simple ? '' : Array.from({ length: 6 }, (_, k) => { const [x, y] = P(80, 80, 61, -90 + 60 * k); return `<circle cx="${x}" cy="${y}" r="3.2" fill="${hot ? '#ffd27a' : '#d7dde3'}" stroke="${hot ? '#a3300f' : '#59616a'}" stroke-width="1"/>`; }).join('');
      body = simple
        ? `<polygon points="${poly(80, 80, 76, 6, -90)}" fill="url(#${u}f)"/><polygon points="${poly(80, 80, 54, 6, -90)}" fill="url(#${u}i)" stroke="#FF6B2C" stroke-width="6"/>${mark(80, 80, 22, 9, '#fff', 1)}`
        : `<polygon points="${poly(80, 80, 68, 6, -90)}" fill="url(#${u}f)" stroke="${hot ? '#ffd27a' : '#f7f9fb'}" stroke-width="1.5" stroke-linejoin="round"/>${rivets}<polygon points="${poly(80, 80, 52, 6, -90)}" fill="url(#${u}i)"/><polygon points="${poly(80, 80, 47, 6, -90)}" fill="none" stroke="#FF6B2C" stroke-width="2" opacity=".9"/>${mark(80, 80, 22, sw, '#ffffff')}`;
    }
    if (level === 5) {
      defs += lg(u + 'f', [[0, '#f4584f'], [1, '#741410']]) + lg(u + 'r', [[0, '#ffffff'], [0.5, '#c3c9cf'], [1, '#7f878f']], 1, 1);
      body = simple
        ? `<path d="${SHIELD}" fill="url(#${u}f)" stroke="url(#${u}r)" stroke-width="10" stroke-linejoin="round"/>${mark(80, 78, 22, 9, '#fff', 1)}`
        : `<path d="${SHIELD}" fill="url(#${u}f)" stroke="url(#${u}r)" stroke-width="5" stroke-linejoin="round"/><path d="${SHIELD}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1" transform="translate(80 82) scale(.84) translate(-80 -82)"/><path d="M62 110 L80 120 L98 110" fill="none" stroke="url(#${u}r)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${mark(80, 76, 20, sw, '#ffffff')}`;
    }
    if (level === 6) {
      defs += lg(u + 'f', [[0, '#4567ff'], [1, '#121c66']]) + lg(u + 'g', [[0, '#fff0b8'], [0.5, '#f2c14e'], [1, '#b47a1c']], 1, 1);
      const star = simple ? '' : `<polygon points="${Array.from({ length: 10 }, (_, k) => P(80, 112, k % 2 ? 3.4 : 8, -90 + 36 * k).join(',')).join(' ')}" fill="url(#${u}g)"/>`;
      wl = wings('L', `url(#${u}g)`, '#8a5a12', { simple });
      wr = wings('R', `url(#${u}g)`, '#8a5a12', { simple });
      body = simple
        ? `<path d="${SHIELD}" fill="url(#${u}f)" stroke="url(#${u}g)" stroke-width="10" stroke-linejoin="round"/>${mark(80, 78, 22, 9, '#fff', 1)}`
        : `<path d="${SHIELD}" fill="url(#${u}f)" stroke="url(#${u}g)" stroke-width="5" stroke-linejoin="round"/><path d="${SHIELD}" fill="none" stroke="rgba(255,240,184,.3)" stroke-width="1" transform="translate(80 82) scale(.84) translate(-80 -82)"/>${star}${mark(80, 76, 20, sw, '#ffffff')}`;
    }
    if (level === 7) {
      defs += lg(u + 'f', [[0, '#a585ff'], [1, '#2f1680']]) + lg(u + 'p', [[0, '#ffffff'], [0.6, '#d6d1f2'], [1, '#9890c4']], 1, 1) + lg(u + 'gm', [[0, '#f2fdff'], [0.5, '#8fdcff'], [1, '#5d6dff']]);
      wl = wings('L', `url(#${u}p)`, '#6c64a0', { simple, scale: simple ? 0.9 : 0.86 });
      wr = wings('R', `url(#${u}p)`, '#6c64a0', { simple, scale: simple ? 0.9 : 0.86 });
      body = simple
        ? `<path d="${CREST}" fill="url(#${u}f)" stroke="url(#${u}p)" stroke-width="10" stroke-linejoin="round"/>${mark(80, 84, 22, 9, '#fff', 1)}`
        : `<path d="${CREST}" fill="url(#${u}f)" stroke="url(#${u}p)" stroke-width="5" stroke-linejoin="round"/><path d="${CREST}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1" transform="translate(80 86) scale(.84) translate(-80 -86)"/>${mark(80, 84, 20, sw, '#ffffff')}`;
      gem = simple
        ? `<path d="M80 2 L96 20 L80 40 L64 20 Z" fill="url(#${u}gm)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
        : `<path d="M80 6 L93 20 L80 38 L67 20 Z" fill="url(#${u}gm)" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/><path d="M67 20 L93 20 M80 6 L74 20 L80 38 M80 6 L86 20 L80 38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>`;
    }
    if (level === 8) {
      defs += lg(u + 'f', [[0, '#24143f'], [1, '#09060f']])
        + lg(u + 'pr', [[0, '#8E6BFF'], [0.45, '#FF4A3D'], [0.75, '#FF6B2C'], [1, '#FFD36B']], 1, 1)
        + lg(u + 'w', [[0, '#d9c9ff'], [0.35, '#8E6BFF'], [0.7, '#FF4A3D'], [1, '#FF6B2C']], 1, 1)
        + lg(u + 'g', [[0, '#fff0b8'], [0.5, '#f2c14e'], [1, '#b47a1c']], 1, 1)
        + `<radialGradient id="${u}ry" cx="80" cy="80" r="80" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#FFD36B" stop-opacity="0"/></radialGradient>`;
      rays = simple
        ? `<circle cx="80" cy="84" r="74" fill="none" stroke="url(#${u}pr)" stroke-width="6"/>`
        : Array.from({ length: 12 }, (_, k) => { const a = k * 30 + 15, L = k % 2 ? 66 : 80; return `<polygon points="${P(80, 84, 30, a - 6).join(',')} ${P(80, 84, L, a).join(',')} ${P(80, 84, 30, a + 6).join(',')}" fill="url(#${u}ry)"/>`; }).join('') + `<circle cx="80" cy="84" r="74" fill="none" stroke="url(#${u}pr)" stroke-width="2" opacity=".8"/>`;
      wl = wings('L', `url(#${u}w)`, '#3a1d5c', { simple, legend: true });
      wr = wings('R', `url(#${u}w)`, '#3a1d5c', { simple, legend: true });
      body = simple
        ? `<path d="${CREST}" fill="url(#${u}f)" stroke="url(#${u}pr)" stroke-width="10" stroke-linejoin="round"/>${mark(80, 86, 22, 9, '#fff', 1)}`
        : `<path d="${CREST}" fill="url(#${u}f)" stroke="url(#${u}pr)" stroke-width="5" stroke-linejoin="round"/><path d="${CREST}" fill="none" stroke="url(#${u}pr)" stroke-width="1" opacity=".55" transform="translate(80 86) scale(.84) translate(-80 -86)"/>${mark(80, 86, 20, sw, '#ffffff')}`;
      gem = simple
        ? `<path d="M54 40 L58 12 L70 26 L80 4 L90 26 L102 12 L106 40 Z" fill="url(#${u}g)"/>`
        : `<path d="M56 38 L60 16 L70 28 L80 8 L90 28 L100 16 L104 38 Z" fill="url(#${u}g)" stroke="#8a5a12" stroke-width="1" stroke-linejoin="round"/><circle cx="60" cy="16" r="4" fill="${WC[0]}" stroke="#fff" stroke-width="1"/><circle cx="80" cy="9" r="5" fill="${WC[1]}" stroke="#fff" stroke-width="1"/><circle cx="100" cy="16" r="4" fill="${WC[2]}" stroke="#fff" stroke-width="1"/>`;
    }
    let s = `<defs>${defs}</defs>`;
    if (has('rays')) s += rays;
    if (has('wingL')) s += wl;
    if (has('wingR')) s += wr;
    if (has('body')) s += body;
    if (has('gem')) s += gem;
    const sz = o.size || 160;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 160 160" style="display:block;overflow:visible">${s}</svg>`;
  }
  const api = { svg: build, NAMES, WC };
  if (typeof window !== 'undefined') window.LeapBadge = api;
  if (typeof module !== 'undefined') module.exports = api;
})();

// Tap-on-board dart input: renders an SVG dartboard, converts taps to
// {num, ring} darts. Ring widths are slightly exaggerated vs. a real board
// so triples/doubles are comfortably tappable on a phone.
import { dartLabel } from './games/base.js';

// sector order clockwise starting at top (20)
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// radii in viewBox units (playing area radius = 100, viewBox -120..120)
const R = { bull: 6, bull25: 14, t1: 55, t2: 66, d1: 89, d2: 100, numbers: 110 };

const COL = {
  black: '#1f2430', cream: '#f4eddb',
  red: '#dc2626', green: '#15803d',
  wire: '#8a8f98',
};

// Pure: SVG coords (center 0,0) -> dart. Outside the double ring = miss.
export function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= R.bull) return { num: 25, ring: 2 };   // bullseye (50)
  if (r <= R.bull25) return { num: 25, ring: 1 }; // outer bull (25)
  if (r > R.d2) return { num: 0, ring: 1 };       // miss
  let deg = Math.atan2(x, -y) * 180 / Math.PI;    // 0° at top, clockwise
  if (deg < 0) deg += 360;
  const num = SECTORS[Math.round(deg / 18) % 20];
  if (r >= R.t1 && r <= R.t2) return { num, ring: 3 };
  if (r >= R.d1) return { num, ring: 2 };
  return { num, ring: 1 };
}

// annular sector path from r1..r2 between angles a1..a2 (degrees from top, cw)
function wedge(r1, r2, a1, a2) {
  const p = (r, a) => {
    const t = a * Math.PI / 180;
    return `${(r * Math.sin(t)).toFixed(2)} ${(-r * Math.cos(t)).toFixed(2)}`;
  };
  return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 0 1 ${p(r2, a2)} ` +
         `L ${p(r1, a2)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
}

function boardSVG(markers) {
  let s = '';
  for (let i = 0; i < 20; i++) {
    const a1 = i * 18 - 9, a2 = i * 18 + 9;
    const dark = i % 2 === 0;
    const single = dark ? COL.black : COL.cream;
    const accent = dark ? COL.red : COL.green;
    s += `<path d="${wedge(R.bull25, R.t1, a1, a2)}" fill="${single}"/>`;
    s += `<path d="${wedge(R.t1, R.t2, a1, a2)}" fill="${accent}"/>`;
    s += `<path d="${wedge(R.t2, R.d1, a1, a2)}" fill="${single}"/>`;
    s += `<path d="${wedge(R.d1, R.d2, a1, a2)}" fill="${accent}"/>`;
    // number label
    const t = i * 18 * Math.PI / 180;
    const nx = R.numbers * Math.sin(t), ny = -R.numbers * Math.cos(t);
    s += `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="middle" dominant-baseline="central"
           font-size="13" font-weight="800" fill="currentColor">${SECTORS[i]}</text>`;
  }
  s += `<circle r="${R.bull25}" fill="${COL.green}"/>`;
  s += `<circle r="${R.bull}" fill="${COL.red}"/>`;
  s += `<circle r="${R.d2}" fill="none" stroke="${COL.wire}" stroke-width="1"/>`;
  // tap markers for the current turn
  for (const m of markers) {
    s += `<circle cx="${m.x}" cy="${m.y}" r="4.5" fill="#fbbf24" stroke="#78350f" stroke-width="1.5"/>`;
    s += `<text x="${m.x}" y="${m.y - 9}" text-anchor="middle" font-size="12" font-weight="900"
           fill="#fbbf24" stroke="#1f2430" stroke-width="2.5" paint-order="stroke">${m.label}</text>`;
  }
  return `<svg viewBox="-120 -120 240 240" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

// markers survive re-renders within a turn, clear when a new turn starts
let markers = [];

export function createBoardInput({ turnLen, onDart, onMiss, onUndo, onNext, onToggle }) {
  if (turnLen === 0) markers = [];
  const el = document.createElement('div');
  el.className = 'boardpad';
  el.innerHTML = `
    <div class="board-wrap">${boardSVG(markers)}</div>
    <div class="bp-row">
      <button class="toggle" title="Talnaborð">⌨️</button>
      <button class="miss">0</button>
      <button class="undo">⟲ Aftur</button>
      <button class="next">Klára ✓</button>
    </div>
    <div class="kp-hint">Pikkaðu á spjaldið þar sem pílan lenti</div>`;

  const svg = el.querySelector('svg');
  svg.addEventListener('click', (e) => {
    const rect = svg.getBoundingClientRect();
    const scale = 240 / rect.width;
    const x = (e.clientX - rect.left - rect.width / 2) * scale;
    const y = (e.clientY - rect.top - rect.height / 2) * scale;
    if (Math.hypot(x, y) > 118) return; // ignore far-corner taps
    const d = scoreAt(x, y);
    markers.push({ x, y, label: d.num === 0 ? '0' : dartLabel(d) });
    if (d.num === 0) onMiss(); else onDart(d);
  });

  el.querySelector('.miss').onclick = () => { markers.push({ x: -112, y: 112, label: '0' }); onMiss(); };
  el.querySelector('.undo').onclick = () => { markers.pop(); onUndo(); };
  el.querySelector('.next').onclick = () => onNext();
  el.querySelector('.toggle').onclick = () => onToggle();
  return el;
}

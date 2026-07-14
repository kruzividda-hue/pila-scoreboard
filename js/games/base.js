// Shared helpers for game modules.
import { colorFor } from '../store.js';

export function dartPoints(d) {
  if (!d || d.num === 0) return 0;
  return d.num * d.ring;
}
export function dartLabel(d) {
  if (!d) return '';
  if (d.num === 0) return '–';
  if (d.num === 25) return d.ring === 2 ? 'Bull' : '25'; // 50 = Bull, 25 = outer
  const pre = d.ring === 2 ? 'D' : d.ring === 3 ? 'T' : '';
  return pre + d.num;
}

// Base gives snapshot-based undo. Subclasses keep all mutable data in this.s.
export class GameBase {
  constructor(players, opts) {
    this.players = players.map((p, i) => ({ ...p, color: colorFor(i) }));
    this.opts = opts;
    this.snaps = [];
    this.finished = false;
    this.winnerId = null;
  }
  snapshot() {
    this.snaps.push(JSON.stringify({ s: this.s, finished: this.finished, winnerId: this.winnerId }));
    if (this.snaps.length > 200) this.snaps.shift();
  }
  undo() {
    const prev = this.snaps.pop();
    if (!prev) return;
    const obj = JSON.parse(prev);
    this.s = obj.s;
    this.finished = obj.finished;
    this.winnerId = obj.winnerId;
  }
  playerById(id) { return this.players.find(p => p.id === id); }
  winnerName() {
    const p = this.playerById(this.winnerId);
    return p ? p.name : null;
  }
}

// Renders a standard player card. `cfg` fields:
//  big (main number), name, meta (array of strings), right (html),
//  foot (html, full-width line at the bottom), active(bool), out(bool)
export function playerCard(cfg) {
  const el = document.createElement('div');
  el.className = 'pcard' + (cfg.active ? ' active' : '') + (cfg.out ? ' out' : '');
  el.style.borderLeftColor = cfg.color;
  el.innerHTML = `
    <div class="big" style="color:${cfg.color}">${cfg.big ?? ''}</div>
    <div class="mid">
      <div class="nm">${cfg.name}</div>
      <div class="meta">${(cfg.meta || []).map(m => `<span>${m}</span>`).join('')}</div>
    </div>
    <div class="rt">${cfg.right || ''}</div>
    ${cfg.foot ? `<div class="pfoot">${cfg.foot}</div>` : ''}`;
  return el;
}

// Small row of up to 3 dart chips for the current turn.
export function turnDarts(darts) {
  const wrap = document.createElement('div');
  wrap.className = 'turn-darts';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('div');
    const dl = darts[i];
    d.className = 'd' + (dl === undefined ? ' empty' : '');
    d.textContent = dl === undefined ? '·' : dartLabel(dl);
    wrap.appendChild(d);
  }
  return wrap;
}

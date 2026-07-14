import { GameBase, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'golf',
  name: 'Golf',
  emoji: '⛳',
  tagline: 'Hola 1–9 — lægsta skorið vinnur',
  minPlayers: 1, maxPlayers: 8,
  options: [
    { key: 'holes', label: 'Holur', type: 'cycle', values: [9, 18], def: 9 },
  ],
};

// strokes by best ring hit on the hole number: triple=1, double=2, single=3, none=5
function strokesFor(bestRing) {
  if (bestRing === 3) return 1;
  if (bestRing === 2) return 2;
  if (bestRing === 1) return 3;
  return 5;
}

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0, hole: 1, turn: [], bestRing: 0,
      p: {},
    };
    for (const p of this.players) this.s.p[p.id] = { total: 0, holes: {} };
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Golf ⛳'; }
  subtitle() { return `${this.opts.holes} holur · lægsta skorið vinnur`; }
  status() {
    const p = this.playerById(this.cur);
    return { text: `Hola <b>${this.s.hole}</b> — <b>${p.name}</b> kastar á <b>${this.s.hole}</b>`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    if (d.num === this.s.hole && d.num !== 0) {
      this.s.bestRing = Math.max(this.s.bestRing, d.ring);
    }
    if (this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }

  _endTurn() {
    const st = this.s.p[this.cur];
    const strk = strokesFor(this.s.bestRing);
    st.holes[this.s.hole] = strk;
    st.total += strk;
    this.s.turn = []; this.s.bestRing = 0;
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
    if (this.s.turnIndex === 0) {
      this.s.hole++;
      if (this.s.hole > this.opts.holes) this._finish();
    }
  }
  _finish() {
    let best = null, bestScore = Infinity;
    for (const id of this.s.order) {
      if (this.s.p[id].total < bestScore) { bestScore = this.s.p[id].total; best = id; }
    }
    this.finished = true; this.winnerId = best;
  }

  render(root) {
    const board = document.createElement('div');
    board.className = 'scoreboard';
    for (const id of this.s.order) {
      const p = this.playerById(id);
      const st = this.s.p[id];
      const active = id === this.cur && !this.finished;
      const played = Object.keys(st.holes).length;
      const card = playerCard({
        color: p.color, active,
        big: st.total,
        name: p.name,
        meta: [`${played} holur spilaðar`],
        right: active ? `kastar á ${this.s.hole}` : '',
      });
      if (active) card.appendChild(turnDarts(this.s.turn));
      board.appendChild(card);
    }
    root.appendChild(board);
  }
  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: `${st.total} skor`, win: id === this.winnerId };
    });
    return { game: 'Golf', desc: this.subtitle(), results };
  }
}

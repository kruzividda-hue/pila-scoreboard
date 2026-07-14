import { GameBase, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'shanghai',
  name: 'Shanghai',
  emoji: '🀄',
  tagline: 'Umferð fyrir hverja tölu — S+D+T = sjálfvirkur sigur',
  minPlayers: 1, maxPlayers: 8,
  options: [
    { key: 'rounds', label: 'Umferðir', type: 'stepper', min: 5, max: 20, def: 7 },
  ],
};

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0, round: 1, turn: [], hitRings: [],
      p: {},
    };
    for (const p of this.players) this.s.p[p.id] = { score: 0 };
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Shanghai 🀄'; }
  subtitle() { return `${this.opts.rounds} umferðir · Shanghai (S+D+T) vinnur strax`; }
  status() {
    const p = this.playerById(this.cur);
    return { text: `Umferð <b>${this.s.round}</b> — <b>${p.name}</b> skýtur á <b>${this.s.round}</b>`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    const target = this.s.round;
    if (d.num === target && d.num !== 0) {
      this.s.p[this.cur].score += d.num * d.ring;
      if (!this.s.hitRings.includes(d.ring)) this.s.hitRings.push(d.ring);
      // Shanghai: single, double and triple of the target in one turn
      if (this.s.hitRings.includes(1) && this.s.hitRings.includes(2) && this.s.hitRings.includes(3)) {
        this.finished = true; this.winnerId = this.cur; return;
      }
    }
    if (this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }

  _endTurn() {
    this.s.turn = []; this.s.hitRings = [];
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
    if (this.s.turnIndex === 0) {
      this.s.round++;
      if (this.s.round > this.opts.rounds) this._finishByScore();
    }
  }
  _finishByScore() {
    let best = null, bestScore = -1;
    for (const id of this.s.order) {
      if (this.s.p[id].score > bestScore) { bestScore = this.s.p[id].score; best = id; }
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
      const card = playerCard({
        color: p.color, active,
        big: st.score,
        name: p.name,
        meta: active ? [`skýtur á ${this.s.round}`] : [],
        right: '',
      });
      if (active) card.appendChild(turnDarts(this.s.turn));
      board.appendChild(card);
    }
    root.appendChild(board);
  }
  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: `${st.score} stig`, win: id === this.winnerId };
    });
    return { game: 'Shanghai', desc: this.subtitle(), results };
  }
}

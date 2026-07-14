import { GameBase, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'halveit',
  name: 'Halve It',
  emoji: '➗',
  tagline: 'Hittu markið — annars helmingast stigin þín!',
  minPlayers: 1, maxPlayers: 8,
  options: [],
};

// Each round has a target. Number = that number (any ring). 'D'=any double,
// 'T'=any triple, 'B'=bull(25).
const TARGETS = [15, 16, 17, 'D', 18, 19, 20, 'T', 'B'];

function targetLabel(t) {
  if (t === 'D') return 'Tvöfalt';
  if (t === 'T') return 'Þrefalt';
  if (t === 'B') return 'Bull';
  return String(t);
}
function hitScore(t, d) {
  if (d.num === 0) return 0;
  if (t === 'D') return d.ring === 2 ? d.num * 2 : 0;
  if (t === 'T') return d.ring === 3 ? d.num * 3 : 0;
  if (t === 'B') return d.num === 25 ? d.num * d.ring : 0;
  return d.num === t ? d.num * d.ring : 0;
}

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0, round: 0, turn: [], turnScore: 0,
      p: {},
    };
    for (const p of this.players) this.s.p[p.id] = { score: 0 };
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  get target() { return TARGETS[this.s.round]; }
  title() { return 'Halve It ➗'; }
  subtitle() { return `${TARGETS.length} umferðir · ef þú klikkar helmingast stigin`; }
  status() {
    const p = this.playerById(this.cur);
    return { text: `Mark: <b>${targetLabel(this.target)}</b> — <b>${p.name}</b>`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    this.s.turnScore += hitScore(this.target, d);
    if (this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }

  _endTurn() {
    const st = this.s.p[this.cur];
    if (this.s.turnScore > 0) st.score += this.s.turnScore;
    else st.score = Math.floor(st.score / 2);
    this.s.turn = []; this.s.turnScore = 0;
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
    if (this.s.turnIndex === 0) {
      this.s.round++;
      if (this.s.round >= TARGETS.length) this._finish();
    }
  }
  _finish() {
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
        meta: active ? [`mark: ${targetLabel(this.target)}`] : [],
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
    return { game: 'Halve It', desc: this.subtitle(), results };
  }
}

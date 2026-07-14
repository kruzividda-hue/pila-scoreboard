import { GameBase, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'clock',
  name: 'Around the Clock',
  emoji: '🕐',
  tagline: 'Hittu 1, 2, 3 … 20 og bull í röð',
  minPlayers: 1, maxPlayers: 8,
  options: [
    { key: 'fast', label: 'D/T flýtir', type: 'cycle', values: ['Af', 'Á'], def: 'Af' },
  ],
};

const seq = [...Array.from({ length: 20 }, (_, i) => i + 1), 25]; // 1..20 then bull

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = { order: this.players.map(p => p.id), turnIndex: 0, turn: [], p: {} };
    for (const p of this.players) this.s.p[p.id] = { idx: 0, dartsThrown: 0 };
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Around the Clock 🕐'; }
  subtitle() { return this.opts.fast === 'Á' ? 'Tvöfalt = +2 skref, þrefalt = +3' : 'Eitt skref í einu'; }
  status() {
    const p = this.playerById(this.cur);
    const st = this.s.p[this.cur];
    const target = seq[st.idx];
    return { text: `<b>${p.name}</b> — næst: <b>${target === 25 ? 'Bull' : target}</b>`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    const st = this.s.p[this.cur];
    st.dartsThrown++;
    const target = seq[st.idx];
    if (d.num === target && d.num !== 0) {
      let step = 1;
      if (this.opts.fast === 'Á') step = d.ring;
      st.idx = Math.min(seq.length, st.idx + step);
      if (st.idx >= seq.length) { this.finished = true; this.winnerId = this.cur; return; }
    }
    if (this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }
  _endTurn() { this.s.turn = []; this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length; }

  render(root) {
    const board = document.createElement('div');
    board.className = 'scoreboard';
    for (const id of this.s.order) {
      const p = this.playerById(id);
      const st = this.s.p[id];
      const active = id === this.cur && !this.finished;
      const target = st.idx >= seq.length ? '🏁' : (seq[st.idx] === 25 ? 'Bull' : seq[st.idx]);
      const card = playerCard({
        color: p.color, active,
        big: target,
        name: p.name,
        meta: [`${st.idx}/${seq.length} kláruð`],
        right: `🎯 ${st.dartsThrown}`,
      });
      if (active) card.appendChild(turnDarts(this.s.turn));
      board.appendChild(card);
    }
    root.appendChild(board);
  }
  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: `${st.idx}/${seq.length}`, win: id === this.winnerId };
    });
    return { game: 'Around the Clock', desc: this.subtitle(), results };
  }
}

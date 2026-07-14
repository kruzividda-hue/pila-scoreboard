import { GameBase, playerCard, turnDarts, dartLabel } from './base.js';

export const meta = {
  id: 'killer',
  name: 'Killer',
  emoji: '💀',
  tagline: 'Verðu killer og sláðu andstæðinga út',
  minPlayers: 2, maxPlayers: 8,
  options: [
    { key: 'lives', label: 'Líf', type: 'stepper', min: 1, max: 9, def: 3 },
  ],
};

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    // assign unique random numbers 1..20
    const pool = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.s = { order: this.players.map(p => p.id), turnIndex: 0, turn: [], p: {} };
    this.players.forEach((p, i) => {
      this.s.p[p.id] = { number: pool[i], lives: opts.lives, killer: false, out: false };
    });
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Killer 💀'; }
  subtitle() { return `Byrjunarlíf: ${this.opts.lives} · hittu TVÖFALT í þína tölu til að verða killer`; }
  status() {
    const p = this.playerById(this.cur);
    const st = this.s.p[this.cur];
    const hint = st.killer ? 'þú ert KILLER — hittu tvöfalt á tölur andstæðinga' : `hittu TVÖFALT ${st.number} til að verða killer`;
    return { text: `<b>${p.name}</b> — ${hint}`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    const me = this.s.p[this.cur];
    const isDouble = d.ring === 2;

    if (isDouble && d.num !== 0) {
      if (d.num === me.number) {
        if (!me.killer) me.killer = true;
      } else if (me.killer) {
        // hit an opponent whose number matches
        for (const id of this.s.order) {
          if (id === this.cur) continue;
          const op = this.s.p[id];
          if (!op.out && op.number === d.num && op.lives > 0) {
            op.lives--;
            if (op.lives <= 0) op.out = true;
          }
        }
      }
    }
    this._checkWin();
    if (!this.finished && this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }

  _endTurn() {
    this.s.turn = [];
    do {
      this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
    } while (this.s.p[this.cur].out);
  }
  _checkWin() {
    const alive = this.s.order.filter(id => !this.s.p[id].out);
    if (alive.length === 1) { this.finished = true; this.winnerId = alive[0]; }
  }

  render(root) {
    const board = document.createElement('div');
    board.className = 'scoreboard';
    for (const id of this.s.order) {
      const p = this.playerById(id);
      const st = this.s.p[id];
      const active = id === this.cur && !this.finished;
      const hearts = st.out ? '☠️ úti' : '❤️'.repeat(st.lives);
      const card = playerCard({
        color: p.color, active, out: st.out,
        big: st.number,
        name: p.name + (st.killer ? ' 🔪' : ''),
        meta: [st.killer ? 'KILLER' : 'ekki killer'],
        right: hearts,
      });
      if (active) card.appendChild(turnDarts(this.s.turn));
      board.appendChild(card);
    }
    root.appendChild(board);
  }
  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: st.out ? 'úti' : `${st.lives} líf`, win: id === this.winnerId };
    });
    return { game: 'Killer', desc: this.subtitle(), results };
  }
}

import { GameBase, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'golf',
  name: 'Golf',
  emoji: '⛳',
  tagline: 'Hola 1–9 — lægsta skorið vinnur',
  rules: `Spilaðar eru 9 eða 18 holur. Hola 1 er talan 1 á spjaldinu, hola 2 talan 2, og svo framvegis. Á hverri holu kastar þú allt að 3 pílum á tölu holunnar og SÍÐASTA pílan þín gildir sem höggin þín:

• Þrefalt = 1 högg (hola í höggi! ⛳) · Tvöfalt = 2 högg · Einfalt = 3 högg · Klikk = 5 högg

Spennan: ertu með einfalt (3 högg) eftir fyrstu pílu? Pikkaðu á Klára ✓ til að GEYMA það — eða kastaðu aftur og reyndu við tvöfalt/þrefalt. En passaðu þig: þá gildir nýja pílan, líka ef hún klikkar!

Lægsta samanlagða skorið eftir allar holurnar vinnur, eins og í alvöru golfi.`,
  minPlayers: 1, maxPlayers: 8,
  options: [
    { key: 'holes', label: 'Holur', type: 'cycle', values: [9, 18], def: 9 },
  ],
};

// strokes by the ring of the LAST dart thrown at the hole number:
// triple=1, double=2, single=3, miss/none=5
function strokesFor(ring) {
  if (ring === 3) return 1;
  if (ring === 2) return 2;
  if (ring === 1) return 3;
  return 5;
}

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0, hole: 1, turn: [], lastRing: 0,
      p: {},
    };
    for (const p of this.players) this.s.p[p.id] = { total: 0, holes: {} };
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Golf ⛳'; }
  subtitle() { return `${this.opts.holes} holur · lægsta skorið vinnur`; }
  status() {
    const p = this.playerById(this.cur);
    let extra = '';
    if (this.s.turn.length > 0) {
      const strk = strokesFor(this.s.lastRing);
      extra = ` · Klára ✓ geymir <b>${strk} högg</b>`;
    }
    return { text: `Hola <b>${this.s.hole}</b> — <b>${p.name}</b> kastar á <b>${this.s.hole}</b>${extra}`, color: p.color };
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    this.s.turn.push(d);
    // the LAST dart thrown counts: a hit records its ring, a miss resets to 0
    this.s.lastRing = (d.num === this.s.hole && d.num !== 0) ? d.ring : 0;
    if (this.s.turn.length >= 3) this._endTurn();
  }
  miss() { this.dart({ num: 0, ring: 1 }); }

  // "Klára ✓" banks the current last dart instead of filling misses
  next() {
    if (this.finished) return;
    this.snapshot();
    this._endTurn();
  }

  _endTurn() {
    const st = this.s.p[this.cur];
    const strk = strokesFor(this.s.lastRing);
    st.holes[this.s.hole] = strk;
    st.total += strk;
    this.s.turn = []; this.s.lastRing = 0;
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

import { GameBase, dartLabel, turnDarts } from './base.js';

const NUMS = [20, 19, 18, 17, 16, 15, 25]; // 25 = bull

export const meta = {
  id: 'cricket',
  name: 'Cricket',
  emoji: '🦗',
  tagline: 'Lokaðu 15–20 og Bull',
  rules: `Markmiðið er að LOKA tölunum 15–20 og Bull. Það þarf þrjú högg til að loka tölu: einfalt = 1 högg, tvöfalt = 2, þrefalt = 3. Taflan sýnir / (1 högg), X (2) og ⊗ (lokað).

• Með stigum: þegar ÞÚ hefur lokað tölu gefa auka högg á hana þér stig — þar til allir hafa lokað henni.
• Sigur: loka öllum tölum og vera með flest stig.
• Cut Throat: öfugt — auka höggin setja stig á andstæðingana og sá stigaLÆGSTI vinnur. Refsileikur!`,
  minPlayers: 1, maxPlayers: 6,
  options: [
    { key: 'points', label: 'Stig', type: 'cycle', values: ['Á', 'Af'], def: 'Á' },
    { key: 'mode', label: 'Tegund', type: 'cycle', values: ['Venjulegt', 'Cut Throat'], def: 'Venjulegt' },
  ],
};

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0,
      startPlayer: 0,
      turn: [],
      p: {},
    };
    for (const p of this.players) {
      const marks = {}; NUMS.forEach(n => marks[n] = 0);
      this.s.p[p.id] = { marks, points: 0, dartsThrown: 0 };
    }
  }
  get cur() { return this.s.order[this.s.turnIndex]; }
  title() { return 'Cricket'; }
  subtitle() {
    return `${this.opts.mode}${this.opts.points === 'Á' ? ' · með stigum' : ' · engin stig'}`;
  }
  status() {
    const p = this.playerById(this.cur);
    return { text: `Röðin er komin að <b>${p.name}</b>`, color: p.color };
  }

  _isClosedByAll(num) {
    return this.s.order.every(id => this.s.p[id].marks[num] >= 3);
  }

  dart(d) {
    if (this.finished || this.s.turn.length >= 3) return;
    this.snapshot();
    const st = this.s.p[this.cur];
    st.dartsThrown++;
    this.s.turn.push(d);

    const num = d.num;
    if (NUMS.includes(num) && d.num !== 0) {
      const hits = d.num === 25 ? d.ring : d.ring; // bull: single=1, double=2 (mapped by ring)
      let remainingHits = hits;
      // fill up marks first
      const open = 3 - st.marks[num];
      const toClose = Math.min(open, remainingHits);
      st.marks[num] += toClose;
      remainingHits -= toClose;
      // extra marks score points if enabled and not closed by everyone
      if (remainingHits > 0 && this.opts.points === 'Á' && !this._isClosedByAll(num)) {
        const val = num; // 25 for bull
        if (this.opts.mode === 'Cut Throat') {
          // add points to every opponent who has NOT closed this number
          for (const id of this.s.order) {
            if (id === this.cur) continue;
            if (this.s.p[id].marks[num] < 3) this.s.p[id].points += val * remainingHits;
          }
        } else {
          st.points += val * remainingHits;
        }
      }
    }

    this._checkWin();
    if (!this.finished && this.s.turn.length >= 3) this._endTurn();
  }

  miss() { this.dart({ num: 0, ring: 1 }); }

  _endTurn() {
    this.s.turn = [];
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
  }

  _checkWin() {
    for (const id of this.s.order) {
      const st = this.s.p[id];
      const allClosed = NUMS.every(n => st.marks[n] >= 3);
      if (!allClosed) continue;
      const pts = st.points;
      let wins;
      if (this.opts.mode === 'Cut Throat') {
        wins = this.s.order.every(o => o === id || this.s.p[o].points >= pts);
      } else {
        wins = this.s.order.every(o => o === id || this.s.p[o].points <= pts);
      }
      if (wins) { this.finished = true; this.winnerId = id; return; }
    }
  }

  render(root) {
    const board = document.createElement('div');
    board.className = 'scoreboard';
    const card = document.createElement('div');
    card.className = 'pcard';
    card.style.borderLeftColor = 'transparent';
    card.style.display = 'block';

    const marks = document.createElement('div');
    marks.className = 'marks';
    marks.style.setProperty('--pcount', this.s.order.length);

    // header row
    marks.innerHTML = `<div class="h">#</div>` +
      this.s.order.map(id => {
        const p = this.playerById(id);
        const active = id === this.cur && !this.finished;
        return `<div class="h" style="color:${active ? p.color : ''}">${p.name.slice(0, 5)}</div>`;
      }).join('');

    const symbol = (m) => ['', '/', 'X', '⊗'][m] || '';
    for (const n of NUMS) {
      const label = n === 25 ? 'Bull' : n;
      marks.innerHTML += `<div class="num">${label}</div>` +
        this.s.order.map(id => {
          const m = this.s.p[id].marks[n];
          return `<div class="m ${m >= 3 ? 'closed' : ''}">${symbol(m)}</div>`;
        }).join('');
    }
    card.appendChild(marks);

    if (this.opts.points === 'Á') {
      const pts = document.createElement('div');
      pts.className = 'marks-pts';
      pts.innerHTML = this.s.order.map(id => {
        const p = this.playerById(id);
        return `<span style="color:${p.color}">${this.s.p[id].points}</span>`;
      }).join('');
      card.appendChild(pts);
    }
    card.appendChild(turnDarts(this.s.turn));
    board.appendChild(card);
    root.appendChild(board);
  }

  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: `${st.points} stig`, win: id === this.winnerId };
    });
    return { game: 'Cricket', desc: this.subtitle(), results };
  }
}

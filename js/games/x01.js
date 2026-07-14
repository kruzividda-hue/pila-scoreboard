import { GameBase, dartPoints, dartLabel, playerCard, turnDarts } from './base.js';

export const meta = {
  id: 'x01',
  name: 'X01',
  emoji: '🎯',
  tagline: '301 / 501 / 701 — klassíkin',
  minPlayers: 1, maxPlayers: 8,
  options: [
    { key: 'start', label: 'Byrjun', type: 'cycle', values: [301, 501, 701], def: 501 },
    { key: 'inMode', label: 'Inn', type: 'cycle', values: ['Beint', 'Tvöfalt'], def: 'Beint' },
    { key: 'outMode', label: 'Út', type: 'cycle', values: ['Tvöfalt', 'Beint'], def: 'Tvöfalt' },
    { key: 'sets', label: 'Sett', type: 'stepper', min: 1, max: 9, def: 1 },
    { key: 'legs', label: 'Legg', type: 'stepper', min: 1, max: 9, def: 3 },
  ],
};

export class Game extends GameBase {
  constructor(players, opts) {
    super(players, opts);
    this.s = {
      order: this.players.map(p => p.id),
      turnIndex: 0,          // whose turn within order
      startLeg: 0,           // index in order that starts current leg
      turn: [],              // darts thrown this turn
      p: {},                 // per-player leg/match state
    };
    for (const p of this.players) {
      this.s.p[p.id] = {
        rem: opts.start, opened: opts.inMode === 'Beint',
        legs: 0, sets: 0, dartsThrown: 0, pointsScored: 0,
        legStartRem: opts.start,
      };
    }
  }

  get cur() { return this.s.order[this.s.turnIndex]; }

  title() { return 'X01'; }
  subtitle() {
    const o = this.opts;
    const leggir = o.legs === 1 ? 'legg' : 'leggi';
    return `${o.start} · ${o.outMode === 'Tvöfalt' ? 'Double Out' : 'Straight Out'} · Fyrstur í ${o.sets} sett, ${o.legs} ${leggir}`;
  }
  status() {
    const p = this.playerById(this.cur);
    const st = this.s.p[this.cur];
    const need = this._checkoutHint(st.rem);
    return {
      text: `Röðin er komin að <b>${p.name}</b>${need ? ' — ' + need : ''}`,
      color: p.color,
    };
  }

  _checkoutHint(rem) {
    if (this.opts.outMode !== 'Tvöfalt') return '';
    if (rem > 170 || rem === 169 || rem === 168 || rem === 166 || rem === 165 ||
        rem === 163 || rem === 162 || rem === 159) return '';
    if (rem <= 40 && rem % 2 === 0) return `út á D${rem / 2}`;
    if (rem === 50) return 'út á Bull';
    return 'hægt að klára';
  }

  dart(d) {
    if (this.finished) return;
    if (this.s.turn.length >= 3) return;
    this.snapshot();
    const st = this.s.p[this.cur];
    st.dartsThrown++;
    let pts = dartPoints(d);

    // double-in requirement
    if (!st.opened) {
      const isDouble = d.ring === 2 || (d.num === 25 && d.ring === 2);
      if (isDouble && pts > 0) { st.opened = true; }
      else { this.s.turn.push({ ...d, scored: 0 }); this._maybeEndTurn(); return; }
    }

    const before = st.rem;
    const after = before - pts;
    const isDoubleDart = d.ring === 2 || (d.num === 25 && d.ring === 2);

    let bust = false;
    if (after < 0) bust = true;
    else if (after === 0) {
      if (this.opts.outMode === 'Tvöfalt' && !isDoubleDart) bust = true;
    } else if (after === 1 && this.opts.outMode === 'Tvöfalt') {
      bust = true;
    }

    if (bust) {
      this.s.turn.push({ ...d, scored: 0, bust: true });
      st.rem = st.legStartRem;          // revert whole turn
      st.pointsScored -= this._turnScoredSoFar();
      this._endTurn(true);
      return;
    }

    st.rem = after;
    st.pointsScored += pts;
    this.s.turn.push({ ...d, scored: pts });

    if (after === 0) { this._winLeg(this.cur); return; }
    this._maybeEndTurn();
  }

  miss() { this.dart({ num: 0, ring: 1 }); }

  _turnScoredSoFar() {
    return this.s.turn.reduce((a, t) => a + (t.scored || 0), 0);
  }

  _maybeEndTurn() {
    if (this.s.turn.length >= 3) this._endTurn(false);
  }

  _endTurn(wasBust) {
    // move to next player
    this.s.turn = [];
    const st = this.s.p[this.cur];
    st.legStartRem = st.rem;
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
  }

  _winLeg(pid) {
    const st = this.s.p[pid];
    st.legs++;
    this.s.turn = [];
    if (st.legs >= this.opts.legs) {
      // set won
      st.sets++;
      for (const id of this.s.order) this.s.p[id].legs = 0;
      if (st.sets >= this.opts.sets) { this.finished = true; this.winnerId = pid; return; }
    }
    // reset scores for new leg, rotate starter
    for (const id of this.s.order) {
      const s = this.s.p[id];
      s.rem = this.opts.start;
      s.legStartRem = this.opts.start;
      s.opened = this.opts.inMode === 'Beint';
    }
    this.s.startLeg = (this.s.startLeg + 1) % this.s.order.length;
    this.s.turnIndex = this.s.startLeg;
  }

  render(root) {
    const board = document.createElement('div');
    board.className = 'scoreboard';
    for (const id of this.s.order) {
      const p = this.playerById(id);
      const st = this.s.p[id];
      const active = id === this.cur && !this.finished;
      const avg = st.dartsThrown ? (st.pointsScored / st.dartsThrown * 3).toFixed(1) : '0.0';
      const card = playerCard({
        color: p.color, active,
        big: st.rem,
        name: p.name,
        meta: [],
        right: `Sett: <b>${st.sets}</b> · Legg: <b>${st.legs}</b><br>🎯 ${st.dartsThrown} · Ø ${avg}`,
      });
      if (active) card.appendChild(turnDarts(this.s.turn));
      board.appendChild(card);
    }
    root.appendChild(board);
  }

  historyEntry() {
    const results = this.s.order.map(id => {
      const p = this.playerById(id); const st = this.s.p[id];
      return { name: p.name, detail: `${st.sets} sett / ${st.legs} legg`, win: id === this.winnerId };
    });
    return { game: 'X01', desc: this.subtitle(), results };
  }
}

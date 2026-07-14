import { GameBase, dartPoints, dartLabel, playerCard, turnDarts } from './base.js';

// ---- checkout route suggestion ----
// Candidate setup darts, in preference order (high triples first, then
// bull/25, singles, doubles, low triples).
const SETUPS = [];
for (let n = 20; n >= 13; n--) SETUPS.push({ pts: n * 3, label: 'T' + n });
SETUPS.push({ pts: 50, label: 'Bull' }, { pts: 25, label: '25' });
for (let n = 20; n >= 1; n--) SETUPS.push({ pts: n, label: String(n) });
for (let n = 20; n >= 1; n--) SETUPS.push({ pts: n * 2, label: 'D' + n });
for (let n = 12; n >= 1; n--) SETUPS.push({ pts: n * 3, label: 'T' + n });

// A single dart that finishes `rem`, or null.
function finisher(rem, doubleOut) {
  if (doubleOut) {
    if (rem === 50) return 'Bull';
    if (rem >= 2 && rem <= 40 && rem % 2 === 0) return 'D' + rem / 2;
    return null;
  }
  if (rem >= 1 && rem <= 20) return String(rem);
  if (rem === 25 || rem === 50) return rem === 25 ? '25' : 'Bull';
  if (rem <= 40 && rem % 2 === 0) return 'D' + rem / 2;
  if (rem <= 60 && rem % 3 === 0) return 'T' + rem / 3;
  return null;
}

// Shortest route (as dart labels) to finish `rem` with `dartsLeft` darts.
export function routeFor(rem, dartsLeft, doubleOut) {
  if (dartsLeft <= 0 || rem <= 0) return null;
  const f = finisher(rem, doubleOut);
  if (f) return [f];
  if (dartsLeft === 1) return null;
  const min = doubleOut ? 2 : 1; // never leave less than this
  for (const t of SETUPS) {
    if (rem - t.pts < min) continue;
    const rest = routeFor(rem - t.pts, dartsLeft - 1, doubleOut);
    if (rest) return [t.label, ...rest];
  }
  return null;
}

export const meta = {
  id: 'x01',
  name: 'X01',
  emoji: '🎯',
  tagline: '301 / 501 / 701 — klassíkin',
  rules: `Allir byrja með 301, 501 eða 701 stig og það sem þú hittir dregst frá. Markmiðið er að enda NÁKVÆMLEGA í 0 — fyrstur þangað vinnur legginn.

• Tvöfalt út: síðasta pílan þarf að lenda í tvöfalda hringnum (t.d. D16 þegar 32 eru eftir).
• Búst: ferðu niður fyrir 0 (eða skilurðu eftir 1 í tvöfalt út) ógildist öll umferðin og staðan verður eins og hún var.
• Appið stingur upp á útgönguleið efst á skjánum þegar hægt er að klára.`,
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
        lastTurn: null, // { darts:[labels], sum, bust }
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
    const st = this.s.p[this.cur];
    if (!st.opened) return '';
    const dartsLeft = 3 - this.s.turn.length;
    const route = routeFor(rem, dartsLeft, this.opts.outMode === 'Tvöfalt');
    return route ? `út: <b>${route.join(' → ')}</b>` : '';
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
    const st = this.s.p[this.cur];
    st.lastTurn = {
      darts: this.s.turn.map(t => dartLabel(t)),
      sum: wasBust ? 0 : this._turnScoredSoFar(),
      bust: wasBust,
    };
    // move to next player
    this.s.turn = [];
    st.legStartRem = st.rem;
    this.s.turnIndex = (this.s.turnIndex + 1) % this.s.order.length;
  }

  _winLeg(pid) {
    const st = this.s.p[pid];
    st.lastTurn = {
      darts: this.s.turn.map(t => dartLabel(t)),
      sum: this._turnScoredSoFar(),
      bust: false,
    };
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
      s.lastTurn = null; // don't show last leg's turn in the new one
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
      const lt = st.lastTurn;
      const foot = lt
        ? (lt.bust
          ? `Síðast: <span style="color:var(--red);font-weight:800">búst</span> (${lt.darts.join(' ')})`
          : `Síðast: <b style="color:var(--ink)">${lt.sum}</b> (${lt.darts.join(' ')})`)
        : '';
      const card = playerCard({
        color: p.color, active,
        big: st.rem,
        name: p.name,
        meta: [],
        foot,
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

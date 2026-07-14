import * as store from './store.js';
import { createKeypad } from './keypad.js';
import { createBoardInput } from './board.js';
import * as x01 from './games/x01.js';
import * as cricket from './games/cricket.js';
import * as killer from './games/killer.js';
import * as clock from './games/clock.js';
import * as shanghai from './games/shanghai.js';
import * as golf from './games/golf.js';
import * as halveit from './games/halveit.js';

const GAMES = [x01, cricket, killer, clock, shanghai, golf, halveit];
const app = document.getElementById('app');

// ---- persistent UI state ----
let tab = 'home';
let selectedGameId = 'x01';
let randomOrder = true;
let showRules = false;   // rules box open on home screen
let inputMode = localStorage.getItem('pila.input') || 'keypad'; // 'keypad' | 'board'
const optState = {};        // { gameId: { key: value } }
for (const g of GAMES) {
  optState[g.meta.id] = {};
  for (const o of g.meta.options) optState[g.meta.id][o.key] = o.def;
}
let match = null;           // active game instance

// ---------------------------------------------------------------- helpers
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('<div class="toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1400);
}
function fmtDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- render
function render() {
  if (match) { renderPlay(); return; }
  app.innerHTML = '';
  if (tab === 'home') renderHome();
  else if (tab === 'history') renderHistory();
  else if (tab === 'players') renderPlayersTab();
  app.appendChild(renderTabbar());
}

function renderTabbar() {
  const bar = el('<div class="tabbar"></div>');
  const tabs = [
    ['home', '🎯', 'Heim'],
    ['players', '👥', 'Leikmenn'],
    ['history', '🕑', 'Saga'],
  ];
  for (const [id, ic, label] of tabs) {
    const b = el(`<button class="${tab === id ? 'active' : ''}"><span class="ic">${ic}</span>${label}</button>`);
    b.onclick = () => { tab = id; render(); };
    bar.appendChild(b);
  }
  return bar;
}

// ---------------- HOME (setup) ----------------
function renderHome() {
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div class="hdr"><h1>Píla 🎯</h1></div>`));
  const content = el('<div class="content"></div>');

  // game picker: compact 2-column grid
  const cards = el('<div class="game-cards"></div>');
  for (const g of GAMES) {
    const c = el(`<div class="gc ${g.meta.id === selectedGameId ? 'sel' : ''}">
        <div class="emoji">${g.meta.emoji}</div>
        <div class="gc-t">${g.meta.name}</div>
      </div>`);
    c.onclick = () => { selectedGameId = g.meta.id; showRules = false; render(); };
    cards.appendChild(c);
  }
  content.appendChild(cards);

  // tagline + rules of the selected game
  const g = GAMES.find(x => x.meta.id === selectedGameId);
  content.appendChild(el(`<div class="blurb">${g.meta.emoji} ${g.meta.tagline}</div>`));
  if (g.meta.rules) {
    const tgl = el(`<button class="rules-toggle">${showRules ? '▲ Fela leikreglur' : 'ℹ️ Leikreglur — hvernig spilast leikurinn?'}</button>`);
    tgl.onclick = () => { showRules = !showRules; render(); };
    content.appendChild(tgl);
    if (showRules) content.appendChild(el(`<div class="rules-box">${g.meta.rules}</div>`));
  }

  // options for selected game
  if (g.meta.options.length) {
    const grid = el('<div class="opt-grid"></div>');
    for (const o of g.meta.options) grid.appendChild(renderOption(g.meta.id, o));
    content.appendChild(el('<div style="height:8px"></div>'));
    content.appendChild(grid);
  }

  // players used
  const players = store.getPlayers();
  const startBtn = el(`<button class="btn btn-primary" style="margin-top:20px">BYRJA ▶</button>`);
  startBtn.onclick = () => startMatch();
  if (players.length < g.meta.minPlayers) {
    startBtn.disabled = true; startBtn.style.opacity = .5;
    startBtn.textContent = `Þarf a.m.k. ${g.meta.minPlayers} leikmenn`;
  }
  content.appendChild(startBtn);

  const rnd = el(`<label class="chk"><span class="box ${randomOrder ? 'on' : ''}">${randomOrder ? '✓' : ''}</span> Slembin röð</label>`);
  rnd.onclick = () => { randomOrder = !randomOrder; render(); };
  content.appendChild(rnd);

  // player list (quick view + manage)
  content.appendChild(el(`<div class="players-head"><span class="lbl">Leikmenn (${players.length})</span></div>`));
  content.appendChild(renderQuickPlayers(players));

  wrap.appendChild(content);
  app.appendChild(wrap);
}

function renderOption(gid, o) {
  const box = el(`<div class="opt"><label>${o.label}</label></div>`);
  const cur = optState[gid][o.key];
  if (o.type === 'cycle') {
    const isRed = cur === 'Cut Throat' || cur === 'Tvöfalt';
    const btn = el(`<button class="val ${cur === 'Af' ? 'off' : ''} ${isRed ? 'red' : ''}">${cur}</button>`);
    btn.onclick = () => {
      const i = o.values.indexOf(cur);
      optState[gid][o.key] = o.values[(i + 1) % o.values.length];
      render();
    };
    box.appendChild(btn);
  } else if (o.type === 'stepper') {
    const st = el(`<div class="stepper">
        <button data-d="-1">−</button><span class="num">${cur}</span><button data-d="1">+</button></div>`);
    st.querySelectorAll('button').forEach(b => b.onclick = () => {
      let v = cur + Number(b.dataset.d);
      v = Math.max(o.min, Math.min(o.max, v));
      optState[gid][o.key] = v; render();
    });
    box.appendChild(st);
  }
  return box;
}

function renderQuickPlayers(players) {
  const list = el('<div></div>');
  players.forEach((p, i) => {
    const row = el(`<div class="player-row">
        <span class="dot" style="background:${store.colorFor(i)}"></span>
        <span class="pname">${p.name}</span>
        <button class="icon-btn" title="Eyða">🗑</button></div>`);
    row.querySelector('.icon-btn').onclick = () => { store.removePlayer(p.id); render(); };
    list.appendChild(row);
  });
  const add = el(`<div class="add-row" style="margin-top:12px">
      <input placeholder="Nafn leikmanns" maxlength="16"/>
      <button class="mini-btn">Bæta við</button></div>`);
  const input = add.querySelector('input');
  const doAdd = () => { const v = input.value.trim(); if (v) { store.addPlayer(v); render(); } };
  add.querySelector('button').onclick = doAdd;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  list.appendChild(add);
  return list;
}

// ---------------- PLAYERS TAB ----------------
function renderPlayersTab() {
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div class="hdr"><h1>Leikmenn 👥</h1></div>`));
  const content = el('<div class="content"></div>');
  content.appendChild(renderQuickPlayers(store.getPlayers()));
  wrap.appendChild(content);
  app.appendChild(wrap);
}

// ---------------- HISTORY ----------------
function renderHistory() {
  const wrap = el('<div></div>');
  const hdr = el(`<div class="hdr"><h1>Leikjasaga 🕑</h1><button class="hdr-btn" title="Hreinsa">🗑</button></div>`);
  hdr.querySelector('button').onclick = () => {
    if (confirm('Eyða allri leikjasögu?')) { store.clearHistory(); render(); }
  };
  wrap.appendChild(hdr);
  const content = el('<div class="content"></div>');
  const hist = store.getHistory();
  if (!hist.length) {
    content.appendChild(el('<div class="empty">Engir leikir enn.<br>Spilaðu leik og hann birtist hér 🎯</div>'));
  } else {
    for (const h of hist) {
      const item = el(`<div class="game-item">
          <div class="top"><span class="dt">${fmtDate(h.date)}</span><span class="tag">LOKIÐ</span></div>
          <div class="desc">${h.game} — ${h.desc}</div></div>`);
      for (const r of h.results) {
        item.appendChild(el(`<div class="res ${r.win ? 'win' : ''}">
            <span>${r.win ? '🏆 ' : ''}${r.name}</span><span>${r.detail}</span></div>`));
      }
      content.appendChild(item);
    }
  }
  wrap.appendChild(content);
  app.appendChild(wrap);
}

// ---------------- START MATCH ----------------
function startMatch() {
  const g = GAMES.find(x => x.meta.id === selectedGameId);
  let players = store.getPlayers();
  if (players.length < g.meta.minPlayers) { toast('Ekki nógu margir leikmenn'); return; }
  if (players.length > g.meta.maxPlayers) players = players.slice(0, g.meta.maxPlayers);
  if (randomOrder) players = players.map(p => p).sort(() => Math.random() - 0.5);
  match = new g.Game(players, optState[g.meta.id]);
  match.meta = g.meta;
  render();
}

function quitMatch() {
  if (confirm('Hætta í leik? Framvinda tapast.')) { match = null; render(); }
}

function showRulesOverlay() {
  const m = match.meta;
  const overlay = el(`<div class="overlay">
      <div class="win-card" style="text-align:left;max-height:80vh;overflow-y:auto">
        <h2 style="text-align:center">${m.emoji} ${m.name}</h2>
        <div class="rules-box" style="box-shadow:none;padding:0;margin:12px 0 18px">${m.rules}</div>
        <button class="btn btn-green">Loka</button>
      </div></div>`);
  overlay.querySelector('.btn').onclick = () => document.body.removeChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
  document.body.appendChild(overlay);
}

// ---------------- PLAY ----------------
function renderPlay() {
  app.innerHTML = '';
  const wrap = el('<div style="display:flex;flex-direction:column;min-height:100vh"></div>');

  const hdr = el(`<div class="hdr">
      <button class="hdr-btn" data-act="back">‹</button>
      <div style="flex:1"><h1 style="font-size:22px">${match.title()}</h1>
      <div class="sub">${match.subtitle()}</div></div>
      ${match.meta?.rules ? '<button class="hdr-btn" data-act="rules">?</button>' : ''}</div>`);
  hdr.querySelector('[data-act="back"]').onclick = quitMatch;
  const rulesBtn = hdr.querySelector('[data-act="rules"]');
  if (rulesBtn) rulesBtn.onclick = showRulesOverlay;
  wrap.appendChild(hdr);

  const st = match.status();
  const status = el(`<div class="game-status" style="border-bottom:3px solid ${st.color}">${st.text}</div>`);
  wrap.appendChild(status);

  const boardHost = el('<div class="content" style="padding-top:6px"></div>');
  match.render(boardHost);
  wrap.appendChild(boardHost);

  const handlers = {
    onDart: d => step(() => match.dart(d)),
    onMiss: () => step(() => match.miss()),
    onUndo: () => step(() => match.undo()),
    onNext: () => step(() => {
      if (match.finished) return;
      // games may define their own end-of-turn action (e.g. Golf banks the last dart)
      if (typeof match.next === 'function') { match.next(); return; }
      let guard = 0;
      while (match.s.turn.length > 0 && match.s.turn.length < 3 && !match.finished && guard++ < 3) match.miss();
      if (match.s.turn.length === 0 && !match.finished) { while (match.s.turn.length < 3 && !match.finished) match.miss(); }
    }),
    onToggle: () => {
      inputMode = inputMode === 'board' ? 'keypad' : 'board';
      localStorage.setItem('pila.input', inputMode);
      renderPlay();
    },
  };
  const input = inputMode === 'board'
    ? createBoardInput({ turnLen: match.s.turn.length, ...handlers })
    : createKeypad(handlers);
  wrap.appendChild(input);

  app.appendChild(wrap);
}

function step(fn) {
  fn();
  if (match.finished) { finishMatch(); return; }
  renderPlay();
}

function finishMatch() {
  const name = match.winnerName();
  try { store.saveMatch(match.historyEntry()); } catch (e) { /* ignore */ }
  renderPlay(); // keep final board behind overlay
  const overlay = el(`<div class="overlay">
      <div class="win-card">
        <div class="trophy">🏆</div>
        <h2>${name} vann!</h2>
        <p>Til hamingju 🎉</p>
        <button class="btn btn-green" id="again">Nýr leikur</button>
        <button class="btn btn-ghost" id="home" style="margin-top:10px">Á forsíðu</button>
      </div></div>`);
  overlay.querySelector('#again').onclick = () => { document.body.removeChild(overlay); startMatch(); };
  overlay.querySelector('#home').onclick = () => { document.body.removeChild(overlay); match = null; tab = 'home'; render(); };
  document.body.appendChild(overlay);
}

// ---------------- boot ----------------
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

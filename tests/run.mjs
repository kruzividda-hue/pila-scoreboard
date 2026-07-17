// Headless tests: node tests/run.mjs
// Covers game logic, board tap geometry and camera calibration/scoring.
globalThis.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; },
};

const here = new URL('.', import.meta.url);
const load = p => import(new URL(p, here));

let pass = 0, fail = 0, section = '';
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
function head(t) { section = t; console.log(`\n${t}`); }

const D = (num, ring = 1) => ({ num, ring });
const players = [{ id: 'A', name: 'Alice' }, { id: 'B', name: 'Bob' }];

// ---------------------------------------------------------------- games
{
  head('X01');
  const { Game } = await load('../js/games/x01.js');
  let g = new Game(players, { start: 40, inMode: 'Beint', outMode: 'Tvöfalt', sets: 1, legs: 1 });
  g.dart(D(20, 2));
  ok('D20 klárar 40 (double out)', g.finished && g.winnerId === 'A');

  g = new Game(players, { start: 50, inMode: 'Beint', outMode: 'Tvöfalt', sets: 1, legs: 1 });
  g.dart(D(20, 1)); g.dart(D(20, 1)); g.dart(D(9, 1)); // leaves 1 -> bust
  ok('búst (1 eftir) núllar umferð', g.s.p.A.rem === 50 && g.cur === 'B');

  g = new Game(players, { start: 101, inMode: 'Tvöfalt', outMode: 'Beint', sets: 1, legs: 1 });
  g.dart(D(20, 1));
  ok('double-in: einfalt opnar ekki', g.s.p.A.rem === 101 && !g.s.p.A.opened);
  g.dart(D(10, 2));
  ok('double-in: D10 opnar og telur', g.s.p.A.opened && g.s.p.A.rem === 81);

  g = new Game(players, { start: 501, inMode: 'Beint', outMode: 'Tvöfalt', sets: 1, legs: 1 });
  g.dart(D(20, 3)); const before = g.s.p.A.rem; g.dart(D(19, 3)); g.undo();
  ok('undo endurheimtir stöðu', g.s.p.A.rem === before);
  g.dart(D(19, 3)); g.dart(D(5, 1));
  ok('lastTurn skráist', JSON.stringify(g.s.p.A.lastTurn.darts) === '["T20","T19","5"]'
    && g.s.p.A.lastTurn.sum === 122, JSON.stringify(g.s.p.A.lastTurn));

  const { routeFor } = await load('../js/games/x01.js');
  ok('checkout 170 = T20 T20 Bull', routeFor(170, 3, true).join(' ') === 'T20 T20 Bull');
  ok('checkout 169 ómögulegt', routeFor(169, 3, true) === null);
  const val = l => l === 'Bull' ? 50 : l === '25' ? 25
    : l[0] === 'D' ? 2 * +l.slice(1) : l[0] === 'T' ? 3 * +l.slice(1) : +l;
  let badRoutes = 0;
  for (let rem = 2; rem <= 170; rem++) {
    const r = routeFor(rem, 3, true);
    if (!r) continue;
    const sum = r.reduce((a, l) => a + val(l), 0);
    const last = r[r.length - 1];
    if (sum !== rem || !(last === 'Bull' || last[0] === 'D')) badRoutes++;
  }
  ok('allar útgönguleiðir 2..170 löglegar', badRoutes === 0, `${badRoutes} villur`);
}

{
  head('Cricket');
  const { Game } = await load('../js/games/cricket.js');
  const g = new Game(players, { points: 'Af', mode: 'Venjulegt' });
  const seq = [D(20, 3), D(19, 3), D(18, 3), D(17, 3), D(16, 3), D(15, 3), D(25, 2), D(25, 1)];
  let i = 0, steps = 0;
  while (!g.finished && steps++ < 100) {
    if (g.cur === 'A') { if (i < seq.length) g.dart(seq[i++]); else g.miss(); }
    else g.miss();
  }
  ok('lokun allra talna vinnur', g.finished && g.winnerId === 'A');
}

{
  head('Killer');
  const { Game } = await load('../js/games/killer.js');
  const g = new Game(players, { lives: 2 });
  const bNum = g.s.p.B.number;
  const seq = [D(g.s.p.A.number, 2), D(bNum, 2), D(bNum, 2)];
  let i = 0, steps = 0;
  while (!g.finished && steps++ < 50) {
    if (g.cur === 'A') { if (i < seq.length) g.dart(seq[i++]); else g.miss(); }
    else g.miss();
  }
  ok('killer slær B út', g.finished && g.winnerId === 'A');
}

{
  head('Around the Clock');
  const { Game } = await load('../js/games/clock.js');
  const g = new Game(players, { fast: 'Af' });
  let n = 1, steps = 0;
  while (!g.finished && steps++ < 200) {
    if (g.cur === 'A') g.dart(D(n <= 20 ? n++ : 25)); else g.miss();
  }
  ok('1..20+Bull í röð vinnur', g.finished && g.winnerId === 'A');
}

{
  head('Shanghai');
  const { Game } = await load('../js/games/shanghai.js');
  let g = new Game(players, { rounds: 7 });
  g.dart(D(1, 1)); g.dart(D(1, 2)); g.dart(D(1, 3));
  ok('S+D+T = skyndisigur', g.finished && g.winnerId === 'A');
  g = new Game(players, { rounds: 5 });
  let steps = 0;
  while (!g.finished && steps++ < 100) {
    if (g.cur === 'A') g.dart(D(g.s.round, 1)); else g.miss();
  }
  ok('stigahæsti vinnur eftir umferðir', g.finished && g.winnerId === 'A');
}

{
  head('Golf (síðasta pílan gildir + geymsla)');
  const { Game } = await load('../js/games/golf.js');
  let g = new Game(players, { holes: 9 });
  g.dart(D(1, 1)); g.next();
  ok('geyma einfalt = 3 högg', g.s.p.A.holes[1] === 3);
  g = new Game(players, { holes: 9 });
  g.dart(D(1, 1)); g.dart(D(0, 1)); g.dart(D(0, 1));
  ok('einfalt svo 2 klikk = 5 högg', g.s.p.A.holes[1] === 5);
  g = new Game(players, { holes: 9 });
  g.dart(D(0, 1)); g.dart(D(0, 1)); g.dart(D(1, 3));
  ok('þrefalt í síðustu pílu = 1 högg', g.s.p.A.holes[1] === 1);
  g = new Game(players, { holes: 9 });
  g.dart(D(1, 3)); g.next(); g.undo();
  ok('undo á geymslu', g.cur === 'A' && g.s.turn.length === 1);
}

{
  head('Halve It');
  const { Game } = await load('../js/games/halveit.js');
  const g = new Game(players, {});
  let steps = 0;
  while (!g.finished && steps++ < 100) {
    if (g.cur === 'A') {
      const t = g.target;
      g.dart(t === 'D' ? D(20, 2) : t === 'T' ? D(20, 3) : t === 'B' ? D(25, 1) : D(t, 1));
    } else g.miss();
  }
  ok('hittir öll mörk og vinnur', g.finished && g.winnerId === 'A');
}

// ---------------------------------------------------------------- board taps
{
  head('Spjald-pikk (breikkaðir fingrahringir)');
  const { scoreAt } = await load('../js/board.js');
  const rad = d => d * Math.PI / 180;
  const at = (deg, r) => scoreAt(r * Math.sin(rad(deg)), -r * Math.cos(rad(deg)));
  const J = JSON.stringify;
  ok('miðja = 50', J(scoreAt(0, 0)) === J({ num: 25, ring: 2 }));
  ok('T20 / D20 / úti', J(at(0, 60)) === J({ num: 20, ring: 3 })
    && J(at(0, 95)) === J({ num: 20, ring: 2 }) && at(0, 105).num === 0);
  const SECT = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  ok('allir 20 geirar réttir', SECT.every((n, i) => at(i * 18, 40).num === n));
}

// ---------------------------------------------------------------- camera
{
  head('Myndavél: homography + alvöru hlutföll (manual)');
  const cam = await load('../js/camera.js');
  const { homographyFrom4, projectPoint, calibratedScore } = cam;

  const src = [[100, 50], [200, 150], [100, 250], [0, 150]];
  const h = homographyFrom4(src);
  const exact = src.every((p, i) => {
    const [u, v] = projectPoint(h, ...p);
    const t = cam.MANUAL_TARGETS[i];
    return Math.hypot(u - t[0], v - t[1]) < 1e-6;
  });
  ok('4 punktar varpast nákvæmlega', exact);

  // Simulated head-on photo: board radius 400px, calibration taps at the
  // middle of the double BEDS (165mm of 170mm).
  const W = 1000, cx = 500, cy = 500, Rpx = 400;
  const calR = (165 / 170) * Rpx;
  const calibration = [[cx, cy - calR], [cx + calR, cy], [cx, cy + calR], [cx - calR, cy]]
    .map(([x, y]) => ({ x: x / W, y: y / W }));
  const fmt = d => d.num === 0 ? 'MISS' : d.num === 25 ? (d.ring === 2 ? '50' : '25')
    : (d.ring === 3 ? 'T' : d.ring === 2 ? 'D' : 'S') + d.num;
  const cases = [
    [0, '50'], [8, '25'], [12, '25'], [20, 'S20'], [55, 'S20'],
    [97, 'S20'], [103, 'T20'], [110, 'S20'], [115, 'S20'], [150, 'S20'],
    [159, 'S20'], [166, 'D20'], [173, 'MISS'], [178, 'MISS'],
  ];
  let wrong = 0;
  for (const [mm, expect] of cases) {
    const r = (mm / 170) * Rpx;
    const { dart } = calibratedScore(calibration, W, W, cx, cy - r);
    if (fmt(dart) !== expect) { wrong++; console.log(`    ${mm}mm: fékk ${fmt(dart)}, vildi ${expect}`); }
  }
  ok(`öll ${cases.length} fjarlægðartilfelli rétt`, wrong === 0, `${wrong} röng`);

  head('Myndavél: AI vír-punktar (fixture úr deep-darts d2_pred.JPG)');
  // Real detections from the converted model on the reference image; the green
  // overlay drawn by deep-darts itself labels the darts 4, 18 and DB (bull),
  // so these expectations match the reference implementation exactly.
  const aiCal = [
    { x: 0.430, y: 0.135 },  // cal1: 5/20 wire, top
    { x: 0.867, y: 0.417 },  // cal4: 13/6 wire, right
    { x: 0.567, y: 0.874 },  // cal2: 17/3 wire, bottom
    { x: 0.146, y: 0.581 },  // cal3: 8/11 wire, left
  ];
  const darts = [
    [{ x: 0.616, y: 0.377 }, 'S4'],
    [{ x: 0.558, y: 0.419 }, 'S18'],
    [{ x: 0.502, y: 0.504 }, '50'],
  ];
  for (const [d, expect] of darts) {
    const { dart } = calibratedScore(aiCal, 1, 1, d.x, d.y, cam.AI_TARGETS);
    ok(`píla (${d.x}, ${d.y}) = ${expect}`, fmt(dart) === expect, `fékk ${fmt(dart)}`);
  }

  head('Myndavél: öfug vörpun (AR-hringurinn)');
  {
    const srcPts = aiCal.map(p => [p.x, p.y]);
    const h = homographyFrom4(srcPts, cam.AI_TARGETS);
    const hInv = homographyFrom4(cam.AI_TARGETS, srcPts);
    // arbitrary image point: image -> board -> back to image
    const p = [0.61, 0.42];
    const board = projectPoint(h, ...p);
    const back = projectPoint(hInv, ...board);
    ok('hringferð skilar sama punkti', Math.hypot(back[0] - p[0], back[1] - p[1]) < 1e-6,
      JSON.stringify(back));
  }

  head('Myndavél: skáhornsmæling (tiltRatio)');
  const faceOn = [{ x: .5, y: .1 }, { x: .9, y: .5 }, { x: .5, y: .9 }, { x: .1, y: .5 }];
  ok('bein sýn ≈ 1', cam.tiltRatio(faceOn) === 1);
  const skewed = [{ x: .5, y: .3 }, { x: .9, y: .5 }, { x: .5, y: .7 }, { x: .1, y: .5 }];
  ok('mikill skái < 0.82', cam.tiltRatio(skewed) < 0.82, String(cam.tiltRatio(skewed)));
  ok('viðmiðunarmyndin telst nógu bein', cam.tiltRatio(aiCal) >= 0.82,
    String(cam.tiltRatio(aiCal)));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

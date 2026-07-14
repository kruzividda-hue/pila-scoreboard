// Reusable dart keypad. Emits one dart at a time: {num, ring} where
// ring is 1 (single), 2 (double) or 3 (triple). num 0..20 or 25 (bull).
// Also emits miss (0), undo and "next" (end turn early).

export function createKeypad({ onDart, onMiss, onUndo, onNext }) {
  const el = document.createElement('div');
  el.className = 'keypad';
  let mult = 1; // pending multiplier applied to the next number press

  el.innerHTML = `
    <div class="mult-row">
      <button class="dbl" data-m="2">TVÖFALT</button>
      <button class="trp" data-m="3">ÞREFALT</button>
    </div>
    <div class="kp-grid" id="kpNums"></div>
    <div class="kp-hint" id="kpHint">Veldu tölu — pikkaðu TVÖFALT/ÞREFALT fyrst fyrir margfeldi</div>
  `;

  const grid = el.querySelector('#kpNums');
  const hint = el.querySelector('#kpHint');

  // number buttons 1..20 then 25 (bull)
  for (let n = 1; n <= 20; n++) addBtn(String(n), () => fire(n));
  addBtn('Bull', () => fire(25), 'bull');
  addBtn('0', () => onMiss(), 'miss');
  addBtn('Núlla', () => { onUndo(); resetMult(); }, 'wide undo');
  addBtn('Klára ✓', () => { onNext(); resetMult(); }, 'wide next');

  function addBtn(label, fn, cls = '') {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', () => { fn(); });
    grid.appendChild(b);
  }

  function fire(num) {
    let ring = mult;
    if (num === 25 && ring === 3) ring = 2; // no triple bull
    onDart({ num, ring });
    resetMult();
  }

  function resetMult() {
    mult = 1;
    updateMultUI();
  }
  function updateMultUI() {
    el.querySelector('.dbl').classList.toggle('on', mult === 2);
    el.querySelector('.trp').classList.toggle('on', mult === 3);
    hint.textContent = mult === 2 ? 'TVÖFALT valið — veldu tölu'
      : mult === 3 ? 'ÞREFALT valið — veldu tölu'
      : 'Veldu tölu — pikkaðu TVÖFALT/ÞREFALT fyrst fyrir margfeldi';
  }

  el.querySelectorAll('.mult-row button').forEach(b => {
    b.addEventListener('click', () => {
      const m = Number(b.dataset.m);
      mult = (mult === m) ? 1 : m;
      updateMultUI();
    });
  });

  return el;
}

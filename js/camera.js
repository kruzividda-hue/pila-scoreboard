// Camera + calibrated tap input (AI roadmap phase 2).
// Photos and tap markers stay in memory only. Calibration is stored locally.
import { scoreAt } from './board.js';
import { dartLabel } from './games/base.js';
import { detectDarts, loadDartModel } from './camera-ai.js';

const CAL_KEY = 'pila.cameraCalibration.v1';
const TARGET_R = 94.5; // middle of the double ring in board.js coordinates
const TARGETS = [[0, -TARGET_R], [TARGET_R, 0], [0, TARGET_R], [-TARGET_R, 0]];
const CAL_STEPS = [
  '<b>1/4:</b> Pikkaðu á miðjan tvöfalda 20 hringinn efst',
  '<b>2/4:</b> Pikkaðu á miðjan tvöfalda 6 hringinn hægra megin',
  '<b>3/4:</b> Pikkaðu á miðjan tvöfalda 3 hringinn neðst',
  '<b>4/4:</b> Pikkaðu á miðjan tvöfalda 11 hringinn vinstra megin',
];

function readCalibration() {
  try {
    const value = JSON.parse(localStorage.getItem(CAL_KEY));
    return Array.isArray(value) && value.length === 4 ? value : null;
  } catch { return null; }
}

let session = {
  stream: null,
  image: null,
  width: 0,
  height: 0,
  calibration: readCalibration(), // normalized image coordinates
  calPoints: [],
  darts: [],
  mode: 'camera', // camera | calibrate | score
  aiCalibration: null,
  aiIgnored: [],
  aiBusy: false,
  aiTimer: null,
  aiGeneration: 0,
};

// Solve A*x=b with partial pivoting. Used by the 4-point homography.
function solve(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) throw new Error('Ógild kvörðun');
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col];
    for (let j = col; j <= n; j++) m[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j];
    }
  }
  return m.map(row => row[n]);
}

// Four image points -> four canonical dartboard points.
export function homographyFrom4(src, dst = TARGETS) {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Þarf fjóra punkta');
  const a = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return solve(a, b);
}

export function projectPoint(h, x, y) {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w,
          (h[3] * x + h[4] * y + h[5]) / w];
}

export function calibratedScore(calibration, width, height, x, y) {
  const src = calibration.map(p => [p.x * width, p.y * height]);
  const [bx, by] = projectPoint(homographyFrom4(src), x, y);
  return { dart: scoreAt(bx, by), boardX: bx, boardY: by };
}

function stopStream() {
  stopAI();
  if (session.stream) session.stream.getTracks().forEach(track => track.stop());
  session.stream = null;
}

function stopAI() {
  session.aiGeneration++;
  clearTimeout(session.aiTimer);
  session.aiTimer = null;
  session.aiBusy = false;
}

export function closeCamera() { stopStream(); }

function clearPhoto() {
  stopStream();
  session.image = null;
  session.width = 0;
  session.height = 0;
  session.calPoints = [];
  session.darts = [];
  session.aiCalibration = null;
  session.aiIgnored = [];
  session.mode = 'camera';
}

export function createCameraInput({ onTurn, onKeypad, onBoard }) {
  const root = document.createElement('div');
  root.className = 'camerapad';
  root.innerHTML = `
    <div class="cam-message"></div>
    <div class="cam-stage">
      <video playsinline muted></video>
      <canvas></canvas>
      <div class="cam-empty">📷<br><span>Mynd af píluspjaldinu</span></div>
      <div class="cam-markers"></div>
    </div>
    <div class="cam-chips"></div>
    <div class="cam-actions"></div>
    <div class="cam-modes">
      <button data-mode="keypad" title="Talnaborð">⌨️</button>
      <button data-mode="board" title="Teiknað spjald">🎯</button>
      <span>AI keyrir í símanum · myndir fara ekki út</span>
    </div>`;

  const video = root.querySelector('video');
  const canvas = root.querySelector('canvas');
  const aiCanvas = document.createElement('canvas');
  aiCanvas.width = aiCanvas.height = 512;
  const stage = root.querySelector('.cam-stage');
  const markerLayer = root.querySelector('.cam-markers');
  const message = root.querySelector('.cam-message');
  const actions = root.querySelector('.cam-actions');
  const chips = root.querySelector('.cam-chips');

  root.querySelector('[data-mode="keypad"]').onclick = () => { stopStream(); onKeypad(); };
  root.querySelector('[data-mode="board"]').onclick = () => { stopStream(); onBoard(); };

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      message.textContent = 'Myndavélin er ekki tiltæk. Opnaðu appið yfir HTTPS.';
      return;
    }
    try {
      stopStream();
      session.image = null; session.darts = []; session.calPoints = [];
      session.aiCalibration = null; session.aiIgnored = []; session.mode = 'camera';
      session.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      video.srcObject = session.stream;
      await video.play();
      draw();
      startAI();
    } catch (err) {
      const denied = err?.name === 'NotAllowedError';
      message.textContent = denied
        ? 'Myndavélarleyfi vantar. Leyfðu myndavél í stillingum Safari og reyndu aftur.'
        : 'Ekki tókst að opna myndavélina.';
    }
  }

  function videoSquare(target, size = 512) {
    const crop = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - crop) / 2;
    const sy = (video.videoHeight - crop) / 2;
    target.width = target.height = size;
    target.getContext('2d', { willReadFrequently: true })
      .drawImage(video, sx, sy, crop, crop, 0, 0, size, size);
  }

  function addAIDart(det, calibration) {
    try {
      const result = calibratedScore(calibration, 1, 1, det.x, det.y);
      if (session.aiIgnored.some(p => Math.hypot(p.x - result.boardX, p.y - result.boardY) < 8)) return;
      const near = session.darts.find(p => p.boardX != null
        && Math.hypot(p.boardX - result.boardX, p.boardY - result.boardY) < 7);
      if (near) {
        if ((det.confidence || 0) >= (near.confidence || 0)) {
          Object.assign(near, det, result, { normalized: true, source: 'ai' });
        }
      } else if (session.darts.length < 3) {
        session.darts.push({ ...det, ...result, normalized: true, source: 'ai' });
      }
    } catch { /* wait for a stronger calibration frame */ }
  }

  async function scanFrame(generation) {
    if (!session.stream || generation !== session.aiGeneration || session.aiBusy || !video.videoWidth) return;
    session.aiBusy = true;
    try {
      videoSquare(aiCanvas);
      const detections = await detectDarts(aiCanvas, progress => {
        message.innerHTML = `<b>AI hleðst…</b> ${Math.round(progress * 100)}%`;
      });
      if (generation !== session.aiGeneration) return;
      const byClass = cls => detections.filter(d => d.cls === cls)
        .sort((a, b) => b.confidence - a.confidence)[0];
      // DeepDarts classes are top, bottom, left, right. calibratedScore expects
      // top, right, bottom, left.
      const cal = [byClass(1), byClass(4), byClass(2), byClass(3)];
      if (cal.every(Boolean)) {
        session.aiCalibration = cal.map(p => ({ x: p.x, y: p.y }));
        detections.filter(d => d.cls === 0)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3).forEach(d => addAIDart(d, session.aiCalibration));
      }
      draw();
    } catch (err) {
      message.textContent = 'AI náði ekki að greina rammann — reyndu að halda spjaldinu öllu inni.';
      console.warn('DeepDarts inference failed', err);
    } finally {
      session.aiBusy = false;
      if (session.stream && generation === session.aiGeneration) {
        session.aiTimer = setTimeout(() => scanFrame(generation), 500);
      }
    }
  }

  function startAI() {
    stopAI();
    const generation = session.aiGeneration;
    message.innerHTML = '<b>AI hleðst…</b> fyrsta skiptið getur tekið smástund';
    loadDartModel(progress => {
      if (generation === session.aiGeneration) {
        message.innerHTML = `<b>AI hleðst…</b> ${Math.round(progress * 100)}%`;
      }
    }).then(() => scanFrame(generation)).catch(() => {
      message.textContent = 'Ekki tókst að hlaða AI-líkaninu.';
    });
  }

  function takePhoto() {
    if (!video.videoWidth) return;
    // A dartboard is round: crop the centre of the camera frame to a square.
    // This keeps the board large enough for accurate taps on a portrait phone.
    const crop = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - crop) / 2;
    const sy = (video.videoHeight - crop) / 2;
    session.width = session.height = Math.min(1280, crop);
    canvas.width = session.width; canvas.height = session.height;
    canvas.getContext('2d').drawImage(video, sx, sy, crop, crop, 0, 0, session.width, session.height);
    session.image = canvas.toDataURL('image/jpeg', .86);
    stopStream();
    session.darts = []; session.calPoints = [];
    session.mode = session.calibration ? 'score' : 'calibrate';
    draw();
  }

  function loadPhoto() {
    if (!session.image) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = session.width; canvas.height = session.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = session.image;
  }

  function imagePoint(e) {
    const rect = stage.getBoundingClientRect();
    if (!session.image) return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    return {
      x: (e.clientX - rect.left) * session.width / rect.width,
      y: (e.clientY - rect.top) * session.height / rect.height,
    };
  }

  stage.onclick = e => {
    const p = imagePoint(e);
    if (!session.image && session.stream && session.aiCalibration && session.darts.length < 3) {
      try {
        const result = calibratedScore(session.aiCalibration, 1, 1, p.x, p.y);
        session.darts.push({ ...p, ...result, normalized: true, source: 'manual' });
        draw();
      } catch { /* ignore taps until calibration is stable */ }
      return;
    }
    if (!session.image) return;
    if (session.mode === 'calibrate') {
      session.calPoints.push(p);
      if (session.calPoints.length === 4) {
        session.calibration = session.calPoints.map(q => ({ x: q.x / session.width, y: q.y / session.height }));
        // The four named points already provide the required quadrilateral.
        // Save immediately; projection is validated when a dart is tapped.
        localStorage.setItem(CAL_KEY, JSON.stringify(session.calibration));
        session.mode = 'score';
      }
    } else if (session.mode === 'score' && session.darts.length < 3) {
      try {
        const result = calibratedScore(session.calibration, session.width, session.height, p.x, p.y);
        session.darts.push({ ...p, dart: result.dart });
      } catch {
        message.textContent = 'Kvörðunin er ógild — kvarðaðu spjaldið aftur.';
      }
    }
    draw();
  };

  function marker(x, y, label, cls = '') {
    const left = session.image ? x / session.width * 100 : x * 100;
    const top = session.image ? y / session.height * 100 : y * 100;
    return `<span class="cam-marker ${cls}" style="left:${left}%;top:${top}%">${label}</span>`;
  }

  function draw() {
    const live = !!session.stream;
    video.style.display = live ? 'block' : 'none';
    canvas.style.display = session.image ? 'block' : 'none';
    root.querySelector('.cam-empty').style.display = (!live && !session.image) ? 'flex' : 'none';
    if (session.image) loadPhoto();

    if (session.mode === 'calibrate') {
      message.innerHTML = CAL_STEPS[Math.min(session.calPoints.length, 3)];
    } else if (session.mode === 'score') {
      message.innerHTML = session.darts.length < 3
        ? `<b>Pikkaðu á pílurnar</b> — ${session.darts.length} af 3 merktar`
        : '<b>Yfirfarðu kastið</b> og staðfestu';
    } else if (live) {
      if (!session.aiCalibration) message.innerHTML = '<b>Leita að spjaldinu…</b> hafðu allan tvöfalda hringinn inni';
      else if (session.darts.length < 3) message.innerHTML = `<b>AI sér ${session.darts.length} af 3 pílum</b> — færðu símann aðeins ef píla er falin`;
      else message.innerHTML = '<b>3 pílur fundnar</b> — yfirfarðu og staðfestu';
    }
    else message.textContent = 'Opnaðu myndavél — AI finnur spjaldið og pílurnar';

    let marks = '';
    session.calPoints.forEach((p, i) => { marks += marker(p.x, p.y, String(i + 1), 'cal'); });
    session.darts.forEach((p, i) => {
      const label = p.dart.num === 0 ? '0' : dartLabel(p.dart);
      marks += marker(p.x, p.y, `${i + 1} · ${label}`);
    });
    markerLayer.innerHTML = marks;

    chips.innerHTML = session.darts.map((p, i) => {
      const label = p.dart.num === 0 ? '0' : dartLabel(p.dart);
      return `<button data-remove="${i}" title="Fjarlægja">${i + 1}: ${label} ×</button>`;
    }).join('');
    chips.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const removed = session.darts.splice(Number(btn.dataset.remove), 1)[0];
      if (removed?.source === 'ai' && removed.boardX != null) {
        session.aiIgnored.push({ x: removed.boardX, y: removed.boardY });
      }
      draw();
    });

    if (live) {
      actions.innerHTML = `<button data-act="reset-ai">Hreinsa</button>
        <button data-act="capture">Mynd + pikk</button>
        <button class="cam-primary" data-act="confirm" ${session.darts.length ? '' : 'disabled'}>Staðfesta ✓</button>`;
    } else if (!session.image) {
      actions.innerHTML = '<button class="cam-primary" data-act="open">Opna myndavél</button>';
    } else if (session.mode === 'calibrate') {
      actions.innerHTML = '<button data-act="undo-cal">⟲ Punktur</button><button data-act="retake">Ný mynd</button>';
    } else {
      actions.innerHTML = `<button data-act="undo">⟲ Aftur</button>
        <button data-act="recal">Kvarða aftur</button>
        <button class="cam-primary" data-act="confirm" ${session.darts.length ? '' : 'disabled'}>Staðfesta kast ✓</button>`;
    }
    actions.querySelector('[data-act="open"]')?.addEventListener('click', startCamera);
    actions.querySelector('[data-act="capture"]')?.addEventListener('click', takePhoto);
    actions.querySelector('[data-act="reset-ai"]')?.addEventListener('click', () => {
      session.darts = []; session.aiCalibration = null; session.aiIgnored = []; draw();
    });
    actions.querySelector('[data-act="retake"]')?.addEventListener('click', startCamera);
    actions.querySelector('[data-act="undo-cal"]')?.addEventListener('click', () => { session.calPoints.pop(); draw(); });
    actions.querySelector('[data-act="undo"]')?.addEventListener('click', () => { session.darts.pop(); draw(); });
    actions.querySelector('[data-act="recal"]')?.addEventListener('click', () => {
      session.calPoints = []; session.darts = []; session.mode = 'calibrate'; draw();
    });
    actions.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      const darts = session.darts.map(p => p.dart);
      clearPhoto();
      onTurn(darts);
    });
  }

  draw();
  return root;
}

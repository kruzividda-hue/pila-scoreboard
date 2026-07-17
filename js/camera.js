// Camera + calibrated tap input (AI roadmap phase 2).
// Photos and tap markers stay in memory only. Calibration is stored locally.
import { scoreAtReal } from './board.js';
import { dartLabel } from './games/base.js';
import { detectDarts, loadDartModel } from './camera-ai.js';

const CAL_KEY = 'pila.cameraCalibration.v1';

// Manual calibration: the user taps the middle of the double BEDS of 20/6/3/11.
// Those sit on the vertical/horizontal axes at 165mm of 170mm = 97.06 units.
const MANUAL_R = 97.06;
export const MANUAL_TARGETS = [[0, -MANUAL_R], [MANUAL_R, 0], [0, MANUAL_R], [-MANUAL_R, 0]];

// DeepDarts calibration keypoints are NOT on the axes: they sit on the sector
// WIRES 9° counter-clockwise of each axis (5/20, 13/6, 3/17 and 8/11 wires),
// at the OUTER edge of the double ring (170mm = 100 units). Order here matches
// how scanFrame assembles them: top(cal1), right(cal4), bottom(cal2), left(cal3).
const S9 = Math.sin(9 * Math.PI / 180) * 100;  // 15.643
const C9 = Math.cos(9 * Math.PI / 180) * 100;  // 98.769
export const AI_TARGETS = [[-S9, -C9], [C9, -S9], [S9, C9], [-C9, S9]];

// How face-on is the camera? The four calibration points span two orthogonal
// board diameters; seen at an angle a circle becomes an ellipse and the
// shorter diameter shrinks by cos(tilt). 1 = straight on, <0.82 ≈ >35° skew,
// where dart-tip parallax starts producing wrong beds/sectors.
export function tiltRatio(cal) {
  const d1 = Math.hypot(cal[0].x - cal[2].x, cal[0].y - cal[2].y); // top-bottom
  const d2 = Math.hypot(cal[1].x - cal[3].x, cal[1].y - cal[3].y); // right-left
  if (!d1 || !d2) return 1;
  return Math.min(d1, d2) / Math.max(d1, d2);
}
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
  aiCalFrame: -99, // frame index when calibration was last seen
  aiTilt: 1,       // 1 = camera face-on; lower = skewed viewing angle
  aiCrop: null,    // zoom region around the found board (normalized square coords)
  aiIgnored: [],
  aiTracks: [],
  aiLast: [],      // raw detections from the latest scan (for the debug view)
  aiFrame: 0,
  aiBusy: false,
  aiTimer: null,
  aiGeneration: 0,
  debug: false,    // show raw detections with confidences
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
export function homographyFrom4(src, dst = MANUAL_TARGETS) {
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

// DeepDarts classes are dart(0), top(1), bottom(2), left(3), right(4).
// Returns [top, right, bottom, left] to match AI_TARGETS, or null.
function pickCal(detections) {
  // ignore weak detections that a low debug threshold may have let through
  const byClass = cls => detections.filter(d => d.cls === cls && d.confidence >= 0.18)
    .sort((a, b) => b.confidence - a.confidence)[0];
  const cal = [byClass(1), byClass(4), byClass(2), byClass(3)];
  return cal.every(Boolean) ? cal : null;
}

export function calibratedScore(calibration, width, height, x, y, targets = MANUAL_TARGETS) {
  const src = calibration.map(p => [p.x * width, p.y * height]);
  const [bx, by] = projectPoint(homographyFrom4(src, targets), x, y);
  // camera points are real board positions: classify with real proportions
  return { dart: scoreAtReal(bx, by), boardX: bx, boardY: by };
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
  session.aiCalFrame = -99;
  session.aiTilt = 1;
  session.aiCrop = null;
  session.aiIgnored = [];
  session.aiTracks = [];
  session.aiLast = [];
  session.aiFrame = 0;
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
      <svg class="cam-ring" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon fill="none" stroke-width="0.8" points=""/></svg>
      <div class="cam-markers"></div>
    </div>
    <div class="cam-chips"></div>
    <div class="cam-actions"></div>
    <input type="file" accept="image/*" hidden>
    <div class="cam-modes">
      <button data-mode="keypad" title="Talnaborð">⌨️</button>
      <button data-mode="board" title="Teiknað spjald">🎯</button>
      <button data-mode="debug" title="Greiningarsýn">🐞</button>
      <span>AI keyrir í símanum · myndir fara ekki út</span>
    </div>`;

  const video = root.querySelector('video');
  const canvas = root.querySelector('canvas');
  const aiCanvas = document.createElement('canvas');
  aiCanvas.width = aiCanvas.height = 800;
  const stage = root.querySelector('.cam-stage');
  const markerLayer = root.querySelector('.cam-markers');
  const message = root.querySelector('.cam-message');
  const actions = root.querySelector('.cam-actions');
  const chips = root.querySelector('.cam-chips');

  root.querySelector('[data-mode="keypad"]').onclick = () => { stopStream(); onKeypad(); };
  root.querySelector('[data-mode="board"]').onclick = () => { stopStream(); onBoard(); };
  const dbgBtn = root.querySelector('[data-mode="debug"]');
  dbgBtn.onclick = () => {
    session.debug = !session.debug;
    dbgBtn.style.background = session.debug ? 'var(--amber)' : '';
    draw();
  };
  const fileInput = root.querySelector('input[type="file"]');
  fileInput.onchange = e => {
    const f = e.target.files[0];
    if (f) analyzePhoto(f);
    e.target.value = '';
  };

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      message.textContent = 'Myndavélin er ekki tiltæk. Opnaðu appið yfir HTTPS.';
      return;
    }
    try {
      stopStream();
      session.image = null; session.darts = []; session.calPoints = [];
      session.aiCalibration = null; session.aiCalFrame = -99; session.aiTilt = 1;
      session.aiCrop = null; session.aiIgnored = []; session.aiTracks = [];
      session.aiFrame = 0; session.mode = 'camera';
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

  // Draw the centre square of the video into `target`. When `crop` is given
  // ({cx, cy, r} in normalized square coords), zoom into that region instead —
  // DeepDarts was trained on images where the board nearly fills the frame, so
  // detection is far more reliable on a board-sized crop than on a room-sized
  // one. Returns the used region so detections can be mapped back.
  function videoSquare(target, size = 800, crop = null) {
    const base = Math.min(video.videoWidth, video.videoHeight);
    const bx = (video.videoWidth - base) / 2;
    const by = (video.videoHeight - base) / 2;
    let s = 1, x0 = 0, y0 = 0;
    if (crop) {
      s = Math.min(1, Math.max(0.25, crop.r * 2)); // never zoom past 4×
      x0 = Math.min(1 - s, Math.max(0, crop.cx - s / 2));
      y0 = Math.min(1 - s, Math.max(0, crop.cy - s / 2));
    }
    target.width = target.height = size;
    target.getContext('2d', { willReadFrequently: true })
      .drawImage(video, bx + x0 * base, by + y0 * base, s * base, s * base, 0, 0, size, size);
    return { x0, y0, s };
  }

  function addAIDart(det, calibration) {
    try {
      const result = calibratedScore(calibration, 1, 1, det.x, det.y, AI_TARGETS);
      // An automatic miss is much more likely to be a bad calibration than a
      // useful result. Misses remain easy to enter manually.
      if (result.dart.num === 0 || det.confidence < 0.28) return;
      if (session.aiIgnored.some(p => Math.hypot(p.x - result.boardX, p.y - result.boardY) < 8)) return;
      let track = session.aiTracks.find(p =>
        Math.hypot(p.boardX - result.boardX, p.boardY - result.boardY) < 8);
      if (!track) {
        track = { ...det, ...result, hits: 0, lastFrame: -1 };
        session.aiTracks.push(track);
      }
      if (track.lastFrame !== session.aiFrame) track.hits++;
      Object.assign(track, det, result, { lastFrame: session.aiFrame });
      // Ignore one-frame flashes. A real dart remains in the same canonical
      // board position even when the phone moves slightly.
      if (track.hits < 2) return;
      const near = session.darts.find(p => p.boardX != null
        && Math.hypot(p.boardX - result.boardX, p.boardY - result.boardY) < 7);
      if (near) {
        // never override a dart the user placed or corrected by hand
        if (near.source !== 'manual' && (det.confidence || 0) >= (near.confidence || 0)) {
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
      const region = videoSquare(aiCanvas, 800, session.aiCrop);
      // with the debug view on, surface even very weak detections (6%+)
      const raw = await detectDarts(aiCanvas, progress => {
        message.innerHTML = `<b>AI hleðst…</b> ${Math.round(progress * 100)}%`;
      }, session.debug ? 0.06 : undefined);
      if (generation !== session.aiGeneration) return;
      session.aiFrame++;
      // map detections from the (possibly zoomed) crop back to full-square coords
      const detections = raw.map(d => ({
        ...d,
        x: region.x0 + d.x * region.s, y: region.y0 + d.y * region.s,
        w: d.w * region.s, h: d.h * region.s,
      }));
      const cal = pickCal(detections);
      if (cal) {
        session.aiCalibration = cal.map(p => ({ x: p.x, y: p.y }));
        session.aiCalFrame = session.aiFrame;
        session.aiTilt = tiltRatio(session.aiCalibration);
        // zoom the next frames in on the board — matches the training data,
        // where the board nearly fills the image
        const cx = cal.reduce((a, p) => a + p.x, 0) / 4;
        const cy = cal.reduce((a, p) => a + p.y, 0) / 4;
        const r = Math.max(...cal.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.25;
        session.aiCrop = { cx, cy, r };
      } else if (session.aiFrame - session.aiCalFrame > 6) {
        session.aiCrop = null; // lost the board — search the full frame again
      }
      // darts may be added as long as we have a recent calibration, even if
      // one calibration point is briefly occluded by an arm or a dart
      if (session.aiCalibration && session.aiFrame - session.aiCalFrame <= 6) {
        detections.filter(d => d.cls === 0)
          .filter(d => !session.aiCalibration.some(p => Math.hypot(p.x - d.x, p.y - d.y) < 0.03))
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 3).forEach(d => addAIDart(d, session.aiCalibration));
      }
      session.aiTracks = session.aiTracks.filter(t => session.aiFrame - t.lastFrame <= 4);
      session.aiLast = detections;
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

  // Run the full AI pipeline on a photo picked from the library: full-frame
  // pass, then a zoomed pass around the found board (same as the live flow).
  async function analyzePhoto(file) {
    stopStream();
    // img.decode() can hang forever on blob URLs in some engines; prefer
    // createImageBitmap and fall back to <img> onload (handles HEIC on iOS)
    let img;
    try { img = await createImageBitmap(file); }
    catch {
      try {
        img = await new Promise((resolve, reject) => {
          const el = new Image();
          const url = URL.createObjectURL(file);
          el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
          el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
          el.src = url;
        });
      } catch { message.textContent = 'Gat ekki lesið myndina.'; return; }
    }
    const iw = img.naturalWidth ?? img.width, ih = img.naturalHeight ?? img.height;
    const crop = Math.min(iw, ih);
    const sx = (iw - crop) / 2, sy = (ih - crop) / 2;
    session.width = session.height = Math.min(1280, crop);
    canvas.width = canvas.height = session.width;
    canvas.getContext('2d').drawImage(img, sx, sy, crop, crop, 0, 0, session.width, session.width);
    img.close?.();
    session.image = canvas.toDataURL('image/jpeg', .86);
    session.darts = []; session.calPoints = [];
    session.aiCalibration = null; session.aiLast = [];
    session.mode = 'score';
    message.innerHTML = '<b>AI greinir myndina…</b>';
    draw();

    try {
      aiCanvas.width = aiCanvas.height = 800;
      const ctx = aiCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, 800, 800);
      let dets = await detectDarts(aiCanvas, p => {
        message.innerHTML = `<b>AI hleðst…</b> ${Math.round(p * 100)}%`;
      }, session.debug ? 0.06 : undefined);
      let cal = pickCal(dets);
      if (cal) {
        // zoomed second pass around the board
        const cx = cal.reduce((a, p) => a + p.x, 0) / 4;
        const cy = cal.reduce((a, p) => a + p.y, 0) / 4;
        const r = Math.max(...cal.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.25;
        const s = Math.min(1, Math.max(0.25, r * 2));
        const x0 = Math.min(1 - s, Math.max(0, cx - s / 2));
        const y0 = Math.min(1 - s, Math.max(0, cy - s / 2));
        ctx.drawImage(canvas, x0 * session.width, y0 * session.width,
          s * session.width, s * session.width, 0, 0, 800, 800);
        const zoomed = (await detectDarts(aiCanvas, undefined, session.debug ? 0.06 : undefined)).map(d => ({
          ...d, x: x0 + d.x * s, y: y0 + d.y * s, w: d.w * s, h: d.h * s,
        }));
        const cal2 = pickCal(zoomed);
        if (cal2) { dets = zoomed; cal = cal2; }
      }
      session.aiLast = dets.map(d => ({ ...d, x: d.x * session.width, y: d.y * session.height }));
      if (!cal) {
        if (!session.calibration) session.mode = 'calibrate';
        draw(); // then override the mode-default message
        message.innerHTML = 'AI fann ekki spjaldið á myndinni — kvarðaðu og pikkaðu handvirkt.';
        return;
      }
      session.aiCalibration = cal.map(p => ({ x: p.x, y: p.y }));
      session.aiTilt = tiltRatio(session.aiCalibration);
      for (const d of dets.filter(d => d.cls === 0 && d.confidence >= 0.28)
        .filter(d => !session.aiCalibration.some(p => Math.hypot(p.x - d.x, p.y - d.y) < 0.03))
        .sort((a, b) => b.confidence - a.confidence).slice(0, 3)) {
        try {
          const result = calibratedScore(session.aiCalibration, 1, 1, d.x, d.y, AI_TARGETS);
          if (result.dart.num === 0) continue;
          session.darts.push({
            x: d.x * session.width, y: d.y * session.height,
            ...result, confidence: d.confidence, source: 'ai',
          });
        } catch { /* skip unprojectable detection */ }
      }
      draw(); // then override the mode-default message with the AI summary
      const tiltNote = session.aiTilt < 0.82 ? ' · 📐 mikill skái, lestri varlega treystandi' : '';
      message.innerHTML = `<b>AI sá ${session.darts.length} pílur</b>${tiltNote} — pikkaðu til að bæta við, × til að fjarlægja`;
    } catch (err) {
      console.warn('Photo analysis failed', err);
      draw();
      message.textContent = 'AI náði ekki að greina myndina.';
    }
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
        const result = calibratedScore(session.aiCalibration, 1, 1, p.x, p.y, AI_TARGETS);
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
        // prefer the AI-found calibration (photo analysis / captured after live
        // lock); fall back to the user's manual 4-point calibration
        const result = session.aiCalibration
          ? calibratedScore(session.aiCalibration, session.width, session.height, p.x, p.y, AI_TARGETS)
          : calibratedScore(session.calibration, session.width, session.height, p.x, p.y);
        session.darts.push({ ...p, ...result, source: 'manual' });
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
      const skewed = session.aiCalibration && session.aiTilt < 0.82;
      if (!session.aiCalibration) message.innerHTML = '<b>Leita að spjaldinu…</b> hafðu allan tvöfalda hringinn inni';
      else if (skewed) message.innerHTML = '📐 <b>Mikill skái</b> — hafðu símann beint fyrir framan spjaldið, annars mislesast pílur';
      else if (session.darts.length < 3) message.innerHTML = `<b>AI sér ${session.darts.length} af 3 pílum</b> — færðu símann aðeins ef píla er falin`;
      else message.innerHTML = '<b>3 pílur fundnar</b> — yfirfarðu og staðfestu';
    }
    else message.textContent = 'Opnaðu myndavél — AI finnur spjaldið og pílurnar';

    // AR ring: project the outer double ring back onto the live image so the
    // user sees that (and how well) the board is locked. Green = good angle,
    // amber = too skewed to trust dart reads.
    const ringSvg = root.querySelector('.cam-ring');
    const ringPoly = ringSvg.querySelector('polygon');
    const locked = live && session.aiCalibration
      && session.aiFrame - session.aiCalFrame <= 6;
    if (locked) {
      try {
        const hInv = homographyFrom4(AI_TARGETS, session.aiCalibration.map(p => [p.x, p.y]));
        let pts = '';
        for (let a = 0; a < 360; a += 5) {
          const t = a * Math.PI / 180;
          const [ix, iy] = projectPoint(hInv, 100 * Math.sin(t), -100 * Math.cos(t));
          pts += `${(ix * 100).toFixed(1)},${(iy * 100).toFixed(1)} `;
        }
        ringPoly.setAttribute('points', pts.trim());
        ringPoly.setAttribute('stroke', session.aiTilt < 0.82 ? '#f59e0b' : '#4ade80');
        ringSvg.style.display = 'block';
      } catch { ringSvg.style.display = 'none'; }
    } else {
      ringSvg.style.display = 'none';
    }

    let marks = '';
    // debug view: every raw detection with class + confidence (P=píla, 1-4=kvörðun)
    if ((live || session.image) && session.debug) {
      for (const d of session.aiLast) {
        const cls = ['P', '1', '2', '3', '4'][d.cls];
        marks += marker(d.x, d.y, `${cls}${Math.round(d.confidence * 100)}`, 'dbg');
      }
    }
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
      actions.innerHTML = `<button class="cam-primary" data-act="open">Opna myndavél</button>
        <button data-act="pick">Velja mynd</button>`;
    } else if (session.mode === 'calibrate') {
      actions.innerHTML = '<button data-act="undo-cal">⟲ Punktur</button><button data-act="retake">Ný mynd</button>';
    } else {
      actions.innerHTML = `<button data-act="undo">⟲ Aftur</button>
        <button data-act="recal">Kvarða aftur</button>
        <button class="cam-primary" data-act="confirm" ${session.darts.length ? '' : 'disabled'}>Staðfesta kast ✓</button>`;
    }
    actions.querySelector('[data-act="open"]')?.addEventListener('click', startCamera);
    actions.querySelector('[data-act="pick"]')?.addEventListener('click', () => fileInput.click());
    actions.querySelector('[data-act="capture"]')?.addEventListener('click', takePhoto);
    actions.querySelector('[data-act="reset-ai"]')?.addEventListener('click', () => {
      session.darts = []; session.aiCalibration = null; session.aiCalFrame = -99;
      session.aiTilt = 1; session.aiCrop = null; session.aiIgnored = [];
      session.aiTracks = []; session.aiFrame = 0; draw();
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

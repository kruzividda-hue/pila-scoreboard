// DeepDarts browser inference. The model and every frame stay on the device.
const MODEL_URL = `${new URL('../models/deepdarts-d2/model.json', import.meta.url).href}?v=800-1`;
const TF_URL = new URL('../vendor/tf.min.js', import.meta.url).href;
const INPUT_SIZE = 800;
const SCORE_THRESHOLD = 0.18;
const IOU_THRESHOLD = 0.30;

let modelPromise;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.tf) return resolve();
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function loadDartModel(onProgress) {
  if (!modelPromise) {
    modelPromise = (async () => {
      await loadScript(TF_URL);
      // WebGL is substantially faster than WASM on current iOS Safari.
      try { await window.tf.setBackend('webgl'); } catch { /* default backend */ }
      await window.tf.ready();
      return window.tf.loadGraphModel(MODEL_URL, { onProgress });
    })();
  }
  return modelPromise;
}

function iou(a, b) {
  const ax1 = a.x - a.w / 2, ax2 = a.x + a.w / 2;
  const ay1 = a.y - a.h / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, bx2 = b.x + b.w / 2;
  const by1 = b.y - b.h / 2, by2 = b.y + b.h / 2;
  const intersection = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1))
    * Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  return intersection / (a.w * a.h + b.w * b.h - intersection || 1);
}

function nms(candidates) {
  const kept = [];
  for (let cls = 0; cls < 5; cls++) {
    const sorted = candidates.filter(x => x.cls === cls).sort((a, b) => b.confidence - a.confidence);
    while (sorted.length) {
      const best = sorted.shift(); kept.push(best);
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (iou(best, sorted[i]) > IOU_THRESHOLD) sorted.splice(i, 1);
      }
    }
  }
  return kept;
}

function decode(data, shape, minScore) {
  const cellStride = shape[3];
  const stride = 10; // x, y, w, h, objectness + five class probabilities
  const candidates = [];
  for (let cell = 0; cell < data.length; cell += cellStride) {
    for (let anchor = 0; anchor < 3; anchor++) {
      const i = cell + anchor * stride;
      const objectness = data[i + 4];
      let cls = 0, probability = data[i + 5];
      for (let c = 1; c < 5; c++) {
        if (data[i + 5 + c] > probability) { probability = data[i + 5 + c]; cls = c; }
      }
      const confidence = objectness * probability;
      if (confidence >= minScore) {
        candidates.push({
          x: data[i], y: data[i + 1], w: data[i + 2], h: data[i + 3],
          cls, confidence,
        });
      }
    }
  }
  return candidates;
}

// minScore below SCORE_THRESHOLD surfaces weak detections (debug view);
// callers filter for their own purposes.
export async function detectDarts(source, onProgress, minScore = SCORE_THRESHOLD) {
  const model = await loadDartModel(onProgress);
  const tf = window.tf;
  const input = tf.tidy(() => tf.browser.fromPixels(source)
    .resizeBilinear([INPUT_SIZE, INPUT_SIZE])
    .toFloat().div(255).expandDims(0));
  let output;
  try { output = await model.executeAsync(input); }
  finally { input.dispose(); }
  const tensors = Array.isArray(output) ? output : Object.values(output);
  try {
    const decoded = [];
    for (const tensor of tensors) decoded.push(...decode(await tensor.data(), tensor.shape, minScore));
    return nms(decoded);
  } finally {
    tensors.forEach(tensor => tensor.dispose());
  }
}

export function modelIsLoaded() { return !!modelPromise; }

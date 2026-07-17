// Frame-difference dart finding: compares two settled grayscale frames and
// returns blobs that appeared between them. Pure functions — no DOM — so the
// whole thing is testable headless. Used by camera.js as a detector that is
// independent of what the darts look like (the DeepDarts model generalizes
// poorly to unseen dart styles; a before/after difference does not care).

export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = (rgba[i] * 3 + rgba[i + 1] * 4 + rgba[i + 2]) >> 3; // fast luma
  }
  return g;
}

// Blobs where |cur - prev| exceeds `thresh`. dx/dy shift the sampling of
// `cur` to compensate small camera drift measured from the calibration
// points. Returns up to 5 largest blobs with pixel lists.
export function diffBlobs(prev, cur, w, h,
  { thresh = 26, minArea = 40, maxArea = 8000, dx = 0, dy = 0 } = {}) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x + dx));
      if (Math.abs(cur[sy * w + sx] - prev[y * w + x]) > thresh) mask[y * w + x] = 1;
    }
  }
  const blobs = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) continue;
    let area = 0, sumX = 0, sumY = 0;
    const px = [];
    stack.length = 0; stack.push(i); mask[i] = 2;
    while (stack.length) {
      const j = stack.pop();
      const x = j % w, y = (j / w) | 0;
      area++; sumX += x; sumY += y; px.push(j);
      if (x > 0 && mask[j - 1] === 1) { mask[j - 1] = 2; stack.push(j - 1); }
      if (x < w - 1 && mask[j + 1] === 1) { mask[j + 1] = 2; stack.push(j + 1); }
      if (y > 0 && mask[j - w] === 1) { mask[j - w] = 2; stack.push(j - w); }
      if (y < h - 1 && mask[j + w] === 1) { mask[j + w] = 2; stack.push(j + w); }
    }
    if (area >= minArea && area <= maxArea) {
      blobs.push({ area, cx: sumX / area, cy: sumY / area, px });
    }
  }
  blobs.sort((a, b) => b.area - a.area);
  return blobs.slice(0, 5);
}

// The dart tip is almost always the blob end nearest the board centre:
// the flight leans outward in projection, the point sits in the board.
export function blobTip(blob, w, centerX, centerY) {
  let best = null, bestD = Infinity;
  for (const j of blob.px) {
    const x = j % w, y = (j / w) | 0;
    const d = (x - centerX) ** 2 + (y - centerY) ** 2;
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

'use strict';
// Object/body tracking (A22): grayscale patch tracking by normalized
// cross-correlation with parabolic subpixel refinement, plus
// least-squares 2D affine estimation between tracked point sets (the
// 2D core of matchmove/object-motion recovery). Images are
// { data: Float32Array (row-major), width, height }.

function sample(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  return img.data[y * img.width + x];
}

/** Bilinear sample at fractional coordinates (null outside). */
export function sampleBilinear(img, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const a = sample(img, x0, y0), b = sample(img, x0 + 1, y0);
  const c = sample(img, x0, y0 + 1), d = sample(img, x0 + 1, y0 + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

function extractPatch(img, cx, cy, radius) {
  const values = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const v = sample(img, Math.round(cx) + x, Math.round(cy) + y);
      if (v === null) return null;
      values.push(v);
    }
  }
  return values;
}

function ncc(template, candidate) {
  const n = template.length;
  let mt = 0, mc = 0;
  for (let i = 0; i < n; i++) { mt += template[i]; mc += candidate[i]; }
  mt /= n; mc /= n;
  let num = 0, dt = 0, dc = 0;
  for (let i = 0; i < n; i++) {
    const a = template[i] - mt, b = candidate[i] - mc;
    num += a * b; dt += a * a; dc += b * b;
  }
  if (dt < 1e-12 || dc < 1e-12) return -1; // featureless patch
  return num / Math.sqrt(dt * dc);
}

/**
 * Track a patch centered at (cx, cy) in frame A into frame B.
 * Returns { x, y, score } at subpixel precision, or null when the
 * best score is below minScore (track lost).
 */
export function trackPatch(frameA, frameB, cx, cy, { radius = 5, search = 8, minScore = 0.7 } = {}) {
  // The template is sampled on the pixel grid; anchor all reporting
  // to that rounded center. (Reporting against the fractional input
  // center introduced a systematic half-pixel bias for fractional
  // track points — measured 0.49/0.29 px on a known shift.)
  const cxr = Math.round(cx), cyr = Math.round(cy);
  const template = extractPatch(frameA, cxr, cyr, radius);
  if (!template) throw new Error('tracker: template patch leaves the frame');
  let best = { dx: 0, dy: 0, score: -Infinity };
  const scores = new Map();
  for (let dy = -search; dy <= search; dy++) {
    for (let dx = -search; dx <= search; dx++) {
      const candidate = extractPatch(frameB, cxr + dx, cyr + dy, radius);
      const score = candidate ? ncc(template, candidate) : -1;
      scores.set(`${dx},${dy}`, score);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  if (best.score < minScore) return null;
  // Subpixel refinement: Lucas-Kanade Gauss-Newton on SSD. NCC alone
  // cannot do this job: it is contrast-invariant, so on smooth
  // near-linear patches a whole ridge of shifts scores NCC = 1
  // (measured: wrong shift scoring 1.0000). SSD against the bilinear
  // surface of frame B has its minimum at the true shift.
  let fx = best.dx, fy = best.dy;
  for (let iter = 0; iter < 16; iter++) {
    let h00 = 0, h01 = 0, h11 = 0, g0 = 0, g1 = 0, valid = true;
    for (let y = -radius; y <= radius && valid; y++) {
      for (let x = -radius; x <= radius; x++) {
        const sx = cxr + fx + x, sy = cyr + fy + y;
        const v = sampleBilinear(frameB, sx, sy);
        const vx1 = sampleBilinear(frameB, sx + 0.5, sy);
        const vx0 = sampleBilinear(frameB, sx - 0.5, sy);
        const vy1 = sampleBilinear(frameB, sx, sy + 0.5);
        const vy0 = sampleBilinear(frameB, sx, sy - 0.5);
        if (v === null || vx1 === null || vx0 === null || vy1 === null || vy0 === null) { valid = false; break; }
        const gx = vx1 - vx0, gy = vy1 - vy0;
        const residual = template[(y + radius) * (2 * radius + 1) + (x + radius)] - v;
        h00 += gx * gx; h01 += gx * gy; h11 += gy * gy;
        g0 += gx * residual; g1 += gy * residual;
      }
    }
    if (!valid) break;
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    let stepX = (h11 * g0 - h01 * g1) / det;
    let stepY = (h00 * g1 - h01 * g0) / det;
    const stepLen = Math.hypot(stepX, stepY);
    if (stepLen > 1) { stepX /= stepLen; stepY /= stepLen; }
    fx += stepX; fy += stepY;
    if (Math.hypot(stepX, stepY) < 1e-4) break;
  }
  // Report NCC at the refined position as the match confidence.
  const candidate = [];
  let inside = true;
  for (let y = -radius; y <= radius && inside; y++) {
    for (let x = -radius; x <= radius; x++) {
      const v = sampleBilinear(frameB, cxr + fx + x, cyr + fy + y);
      if (v === null) { inside = false; break; }
      candidate.push(v);
    }
  }
  return {
    // Caller frame: the feature sits (cx - cxr) from the template
    // anchor, and that offset carries over under local translation.
    // Returning cxr + fx here corrupted chained tracking by up to
    // half a pixel per step.
    x: cx + fx,
    y: cy + fy,
    score: inside ? ncc(template, candidate) : best.score,
    integerOffset: [best.dx, best.dy],
  };
}

/** Track many points from frame A to frame B; lost points are null. */
export function trackPoints(frameA, frameB, points, options = {}) {
  return points.map((p) => {
    const hit = trackPatch(frameA, frameB, p[0], p[1], options);
    return hit ? [hit.x, hit.y] : null;
  });
}

/**
 * Least-squares 2D affine [a b tx; c d ty] mapping src -> dst.
 * Exact for noiseless correspondences. Throws on degenerate input.
 */
export function estimateAffine(src, dst) {
  if (src.length !== dst.length || src.length < 3) {
    throw new Error('tracker: affine estimation needs >= 3 point pairs');
  }
  // Normal equations for each output row share the same Gram matrix.
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = src.length;
  for (const [x, y] of src) { sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; }
  const gram = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const det = gram[0][0] * (gram[1][1] * gram[2][2] - gram[1][2] * gram[2][1])
    - gram[0][1] * (gram[1][0] * gram[2][2] - gram[1][2] * gram[2][0])
    + gram[0][2] * (gram[1][0] * gram[2][1] - gram[1][1] * gram[2][0]);
  if (Math.abs(det) < 1e-9) throw new Error('tracker: degenerate (collinear) point set');
  const solve = (target) => {
    let bx = 0, by = 0, b1 = 0;
    for (let i = 0; i < n; i++) { bx += src[i][0] * target[i]; by += src[i][1] * target[i]; b1 += target[i]; }
    const rhs = [bx, by, b1];
    // Cramer on the 3x3 Gram system.
    const replace = (col) => gram.map((row, r) => row.map((v, c) => (c === col ? rhs[r] : v)));
    const detOf = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    return [detOf(replace(0)) / det, detOf(replace(1)) / det, detOf(replace(2)) / det];
  };
  const [a, b, tx] = solve(dst.map((p) => p[0]));
  const [c, d, ty] = solve(dst.map((p) => p[1]));
  return [[a, b, tx], [c, d, ty]];
}

export function applyAffine(affine, [x, y]) {
  return [
    affine[0][0] * x + affine[0][1] * y + affine[0][2],
    affine[1][0] * x + affine[1][1] * y + affine[1][2],
  ];
}

/** RMS reprojection residual of an affine against point pairs. */
export function affineResidual(affine, src, dst) {
  let sum = 0, count = 0;
  for (let i = 0; i < src.length; i++) {
    if (!dst[i]) continue;
    const p = applyAffine(affine, src[i]);
    sum += (p[0] - dst[i][0]) ** 2 + (p[1] - dst[i][1]) ** 2;
    count++;
  }
  if (!count) throw new Error('tracker: no valid pairs for residual');
  return Math.sqrt(sum / count);
}

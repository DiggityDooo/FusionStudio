'use strict';
// Image denoise / upscale filters (A31 "AI denoising and
// upscaling" — classical, verifiable counterparts; A21
// "Denoising passes"): separable Gaussian blur, edge-preserving
// bilateral filter, median filter, and nearest/bilinear upscaling
// over compositor image buffers ({ width, height, data: RGBA
// Float32Array }). Every filter returns a new buffer and has
// exact limiting behaviors the tests pin down (constant images
// are invariant; the Gaussian impulse response is the normalized
// kernel outer product; the bilateral filter reduces to the
// Gaussian as range sigma grows and preserves a step edge as it
// shrinks).

function checkBuffer(buffer) {
  const { width, height, data } = buffer || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || !data || data.length !== width * height * 4) {
    throw new Error('filter: malformed image buffer');
  }
  return buffer;
}

function newBufferLike(buffer, data) {
  return { width: buffer.width, height: buffer.height, data, aovs: buffer.aovs || {} };
}

export function gaussianKernel(sigma) {
  if (!(sigma > 0)) throw new Error('filter: sigma must be positive');
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const weights = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    sum += w;
  }
  return { weights: weights.map((w) => w / sum), radius };
}

export function gaussianBlur(buffer, sigma) {
  checkBuffer(buffer);
  const { width, height } = buffer;
  const { weights, radius } = gaussianKernel(sigma);
  const pass = (src, horizontal) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const acc = [0, 0, 0, 0];
        for (let k = -radius; k <= radius; k++) {
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
          const idx = (sx + width * sy) * 4;
          const w = weights[k + radius];
          for (let c = 0; c < 4; c++) acc[c] += src[idx + c] * w;
        }
        out.set(acc, (x + width * y) * 4);
      }
    }
    return out;
  };
  return newBufferLike(buffer, pass(pass(buffer.data, true), false));
}

export function bilateralFilter(buffer, { spatialSigma = 1.5, rangeSigma = 0.2 } = {}) {
  checkBuffer(buffer);
  if (!(spatialSigma > 0) || !(rangeSigma > 0)) throw new Error('filter: sigmas must be positive');
  const { width, height, data } = buffer;
  const radius = Math.max(1, Math.ceil(2 * spatialSigma));
  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (x + width * y) * 4;
      const center = [data[centerIdx], data[centerIdx + 1], data[centerIdx + 2]];
      const acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const idx = (sx + width * sy) * 4;
          const spatial = Math.exp(-(dx * dx + dy * dy) / (2 * spatialSigma * spatialSigma));
          const dr = data[idx] - center[0], dg = data[idx + 1] - center[1], db = data[idx + 2] - center[2];
          const range = Math.exp(-(dr * dr + dg * dg + db * db) / (2 * rangeSigma * rangeSigma));
          const w = spatial * range;
          wsum += w;
          for (let c = 0; c < 4; c++) acc[c] += data[idx + c] * w;
        }
      }
      for (let c = 0; c < 4; c++) out[centerIdx + c] = acc[c] / wsum;
    }
  }
  return newBufferLike(buffer, out);
}

export function medianFilter(buffer, radius = 1) {
  checkBuffer(buffer);
  if (!Number.isInteger(radius) || radius < 1) throw new Error('filter: radius must be a positive integer');
  const { width, height, data } = buffer;
  const out = new Float32Array(data.length);
  const window = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        window.length = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            window.push(data[(sx + width * sy) * 4 + c]);
          }
        }
        window.sort((a, b) => a - b);
        out[(x + width * y) * 4 + c] = window[window.length >> 1];
      }
    }
  }
  return newBufferLike(buffer, out);
}

/**
 * Upscale by an integer factor (or to an explicit size).
 * method 'bilinear' (pixel-center mapping) or 'nearest'.
 */
export function upscale(buffer, { factor, width: targetW, height: targetH, method = 'bilinear' } = {}) {
  checkBuffer(buffer);
  const outW = targetW ?? buffer.width * (factor ?? 2);
  const outH = targetH ?? buffer.height * (factor ?? 2);
  if (!Number.isInteger(outW) || !Number.isInteger(outH) || outW < 1 || outH < 1) {
    throw new Error('filter: target size must be positive integers');
  }
  if (method !== 'bilinear' && method !== 'nearest') throw new Error(`filter: unknown method ${method}`);
  const { width, height, data } = buffer;
  const out = new Float32Array(outW * outH * 4);
  const sample = (sx, sy, c) => data[(sx + width * sy) * 4 + c];
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const gx = ((x + 0.5) * width) / outW - 0.5;
      const gy = ((y + 0.5) * height) / outH - 0.5;
      const idx = (x + outW * y) * 4;
      if (method === 'nearest') {
        const sx = Math.min(width - 1, Math.max(0, Math.round(gx)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(gy)));
        for (let c = 0; c < 4; c++) out[idx + c] = sample(sx, sy, c);
      } else {
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const fx = gx - x0, fy = gy - y0;
        const cx = [Math.min(width - 1, Math.max(0, x0)), Math.min(width - 1, Math.max(0, x0 + 1))];
        const cy = [Math.min(height - 1, Math.max(0, y0)), Math.min(height - 1, Math.max(0, y0 + 1))];
        for (let c = 0; c < 4; c++) {
          const v00 = sample(cx[0], cy[0], c), v10 = sample(cx[1], cy[0], c);
          const v01 = sample(cx[0], cy[1], c), v11 = sample(cx[1], cy[1], c);
          out[idx + c] = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
        }
      }
    }
  }
  return { width: outW, height: outH, data: out, aovs: buffer.aovs || {} };
}

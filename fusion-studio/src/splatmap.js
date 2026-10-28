'use strict';
// Terrain splat painting (A20 "Terrain painting (layers, splat
// maps) and landscape tools"): derive per-layer texture weights
// from a heightfield's height and slope with smooth band rules.
// Heights are a flat res*res array indexed [x + res * z], in world
// units; worldSize is the terrain extent in world units.

function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function band(value, range, falloff) {
  if (!range) return 1;
  const [lo, hi] = range;
  const f = Math.max(0, falloff);
  return smoothstep(lo - f, lo + f, value) * (1 - smoothstep(hi - f, hi + f, value));
}

/**
 * Per-texel slope angle (radians from horizontal) via central
 * differences (one-sided at the borders).
 */
export function heightfieldSlopes(heights, res, worldSize) {
  if (heights.length !== res * res) throw new Error('splat: heights length must be res*res');
  if (!(worldSize > 0)) throw new Error('splat: worldSize must be positive');
  const dx = worldSize / (res - 1);
  const slopes = new Float32Array(res * res);
  const at = (x, z) => heights[x + res * z];
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(res - 1, x + 1);
      const zm = Math.max(0, z - 1), zp = Math.min(res - 1, z + 1);
      const gx = (at(xp, z) - at(xm, z)) / ((xp - xm) * dx);
      const gz = (at(x, zp) - at(x, zm)) / ((zp - zm) * dx);
      slopes[x + res * z] = Math.atan(Math.hypot(gx, gz));
    }
  }
  return slopes;
}

/**
 * Layer weights for a heightfield. layers: [{ height?: [lo, hi],
 * slope?: [lo, hi] (radians), heightFalloff?, slopeFalloff?,
 * strength? }]. Raw weight = strength * heightBand * slopeBand;
 * weights are normalized per texel and any uncovered remainder
 * goes to baseLayer (default first layer), so each texel sums
 * to exactly 1 across layers.
 */
export function splatWeights(heights, res, { worldSize = 100, layers, baseLayer = 0 } = {}) {
  if (!Array.isArray(layers) || layers.length === 0) throw new Error('splat: at least one layer is required');
  if (baseLayer < 0 || baseLayer >= layers.length) throw new Error('splat: baseLayer out of range');
  const slopes = heightfieldSlopes(heights, res, worldSize);
  const n = res * res;
  const weights = layers.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    let total = 0;
    const raw = layers.map((layer, li) => {
      const w = (layer.strength ?? 1)
        * band(heights[i], layer.height, layer.heightFalloff ?? 0)
        * band(slopes[i], layer.slope, layer.slopeFalloff ?? 0);
      weights[li][i] = w;
      total += w;
      return w;
    });
    void raw;
    if (total > 1) {
      for (let li = 0; li < layers.length; li++) weights[li][i] /= total;
    } else {
      weights[baseLayer][i] += 1 - total;
    }
  }
  return { weights, slopes, res };
}

/** Index of the strongest layer per texel (preview/selection map). */
export function splatDominantLayer(weights) {
  const n = weights[0].length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let li = 1; li < weights.length; li++) if (weights[li][i] > weights[best][i]) best = li;
    out[i] = best;
  }
  return out;
}

/** Mean weight per layer (coverage fractions sum to 1). */
export function splatCoverage(weights) {
  const n = weights[0].length;
  return weights.map((w) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += w[i];
    return sum / n;
  });
}

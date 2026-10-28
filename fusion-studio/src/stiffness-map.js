'use strict';
// Cloth stiffness weight maps (A18 "Cloth painting and weight
// maps for stiffness"): per-vertex weights in [0, 1] that artists
// paint with a spatial brush, blurred across mesh adjacency, and
// remapped into XPBD constraint compliance (./xpbd.js) on a
// geometric scale — stiff paint (weight 1) approaches the rigid
// end of the compliance range, soft paint (weight 0) the loose
// end.

function falloffValue(kind, t) {
  if (t >= 1) return 0;
  if (kind === 'constant') return 1;
  if (kind === 'linear') return 1 - t;
  if (kind === 'smooth') {
    const s = t * t * (3 - 2 * t);
    return 1 - s;
  }
  throw new Error(`stiffness: unknown falloff ${kind}`);
}

function checkWeights(weights) {
  for (let i = 0; i < weights.length; i++) {
    if (!(weights[i] >= -1e-9 && weights[i] <= 1 + 1e-9)) throw new Error('stiffness: weights must lie in [0, 1]');
  }
}

/**
 * Paint a spherical brush into a weight map (mutates and returns
 * it). positions: flat [x,y,z] per vertex matching weights.
 * mode 'add' accumulates strength * falloff, 'subtract' removes,
 * 'set' blends toward `value` by falloff. Result clamped to [0,1].
 */
export function paintWeights(weights, positions, { center, radius, strength = 1, value = 1, mode = 'add', falloff = 'smooth' } = {}) {
  if (!(radius > 0)) throw new Error('stiffness: brush radius must be positive');
  if (weights.length * 3 !== positions.length) throw new Error('stiffness: positions/weights length mismatch');
  checkWeights(weights);
  for (let i = 0; i < weights.length; i++) {
    const dx = positions[i * 3] - center[0];
    const dy = positions[i * 3 + 1] - center[1];
    const dz = positions[i * 3 + 2] - center[2];
    const f = falloffValue(falloff, Math.hypot(dx, dy, dz) / radius);
    if (f === 0) continue;
    let w = weights[i];
    if (mode === 'add') w += strength * f;
    else if (mode === 'subtract') w -= strength * f;
    else if (mode === 'set') w += (value - w) * f;
    else throw new Error(`stiffness: unknown paint mode ${mode}`);
    weights[i] = Math.min(1, Math.max(0, w));
  }
  return weights;
}

/** Neighbor lists (sorted, deduplicated) from triangle indices. */
export function adjacencyFromIndices(vertexCount, indices) {
  const sets = Array.from({ length: vertexCount }, () => new Set());
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      if (u !== v) { sets[u].add(v); sets[v].add(u); }
    }
  }
  return sets.map((s) => [...s].sort((x, y) => x - y));
}

/**
 * Jacobi diffusion blur: v' = (1 - lambda) v + lambda * mean
 * (neighbors). A convex combination, so the [min, max] range of
 * the map never grows. Returns a new array.
 */
export function blurWeights(weights, adjacency, { iterations = 1, lambda = 0.5 } = {}) {
  if (!(lambda > 0 && lambda <= 1)) throw new Error('stiffness: lambda must be in (0, 1]');
  let current = Float32Array.from(weights);
  for (let it = 0; it < iterations; it++) {
    const next = Float32Array.from(current);
    for (let i = 0; i < current.length; i++) {
      const neighbors = adjacency[i];
      if (!neighbors?.length) continue;
      let mean = 0;
      for (const j of neighbors) mean += current[j];
      mean /= neighbors.length;
      next[i] = (1 - lambda) * current[i] + lambda * mean;
    }
    current = next;
  }
  return current;
}

/** Gamma/invert remap into a new array. */
export function remapWeights(weights, { gamma = 1, invert = false } = {}) {
  if (!(gamma > 0)) throw new Error('stiffness: gamma must be positive');
  checkWeights(weights);
  return Float32Array.from(weights, (w) => {
    const v = invert ? 1 - w : w;
    return Math.pow(Math.min(1, Math.max(0, v)), gamma);
  });
}

/**
 * Per-edge XPBD compliance from vertex weights: the edge weight
 * is the endpoint average, mapped geometrically between
 * softCompliance (weight 0) and stiffCompliance (weight 1).
 * edges: [[i, j], ...]. Returns Float64Array of compliances.
 */
export function complianceProfile(weights, edges, { softCompliance = 1e-4, stiffCompliance = 1e-8 } = {}) {
  if (!(softCompliance > 0) || !(stiffCompliance > 0)) throw new Error('stiffness: compliances must be positive');
  if (stiffCompliance > softCompliance) throw new Error('stiffness: stiffCompliance must not exceed softCompliance');
  checkWeights(weights);
  const ratio = stiffCompliance / softCompliance;
  return Float64Array.from(edges, ([i, j]) => {
    const w = (weights[i] + weights[j]) / 2;
    return softCompliance * Math.pow(ratio, w);
  });
}

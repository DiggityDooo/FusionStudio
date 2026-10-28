'use strict';
// Scattering / instancing placement (A20 "Scattering/instancing
// tools"): deterministic seeded placement over a rectangular domain.
// Poisson-disk (dart throwing with a spatial hash) guarantees a
// minimum separation; density-field rejection sampling follows an
// artist density function; slope/altitude masks cull placements from
// a heightfield.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_DOMAIN = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

/**
 * Poisson-disk scatter: every pair of points is >= minDist apart.
 * Returns fewer than count points when the domain saturates.
 */
export function poissonDiskScatter({ count = 100, minDist = 1, domain = DEFAULT_DOMAIN, seed = 1, maxAttempts = 2000 } = {}) {
  if (minDist <= 0) throw new Error('scatter: minDist must be positive');
  const rng = mulberry32(seed);
  const cell = minDist / Math.SQRT2;
  const cols = Math.max(1, Math.ceil((domain.maxX - domain.minX) / cell));
  const rows = Math.max(1, Math.ceil((domain.maxZ - domain.minZ) / cell));
  const grid = new Int32Array(cols * rows).fill(-1);
  const points = [];
  const cellOf = (x, z) => [
    Math.min(cols - 1, Math.max(0, Math.floor((x - domain.minX) / cell))),
    Math.min(rows - 1, Math.max(0, Math.floor((z - domain.minZ) / cell))),
  ];
  const farEnough = (x, z) => {
    const [cx, cz] = cellOf(x, z);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const gx = cx + dx, gz = cz + dz;
      if (gx < 0 || gz < 0 || gx >= cols || gz >= rows) continue;
      const idx = grid[gz * cols + gx];
      if (idx < 0) continue;
      const p = points[idx];
      if (Math.hypot(p[0] - x, p[1] - z) < minDist) return false;
    }
    return true;
  };
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts++;
    const x = domain.minX + rng() * (domain.maxX - domain.minX);
    const z = domain.minZ + rng() * (domain.maxZ - domain.minZ);
    if (!farEnough(x, z)) continue;
    const [cx, cz] = cellOf(x, z);
    grid[cz * cols + cx] = points.length;
    points.push([x, z]);
  }
  return points;
}

/**
 * Density-field rejection sampling: acceptance probability equals
 * the (clamped 0..1) density at the candidate.
 */
export function densityScatter({ count = 100, density, domain = DEFAULT_DOMAIN, seed = 1, maxAttempts = 20000 } = {}) {
  if (typeof density !== 'function') throw new Error('scatter: density function required');
  const rng = mulberry32(seed);
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts++;
    const x = domain.minX + rng() * (domain.maxX - domain.minX);
    const z = domain.minZ + rng() * (domain.maxZ - domain.minZ);
    const d = Math.min(1, Math.max(0, density(x, z)));
    if (rng() < d) points.push([x, z]);
  }
  return points;
}

/** Orthonormal basis whose Y axis is the given surface normal. */
export function alignToNormal(normal, rngValue = 0) {
  const up = (() => {
    const l = Math.hypot(...normal);
    if (l < 1e-12) throw new Error('scatter: zero normal');
    return normal.map((v) => v / l);
  })();
  const ref = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = ref[1] * up[2] - ref[2] * up[1];
  let ty = ref[2] * up[0] - ref[0] * up[2];
  let tz = ref[0] * up[1] - ref[1] * up[0];
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl; ty /= tl; tz /= tl;
  const bx = up[1] * tz - up[2] * ty;
  const by = up[2] * tx - up[0] * tz;
  const bz = up[0] * ty - up[1] * tx;
  // Random spin about the normal.
  const c = Math.cos(rngValue * Math.PI * 2), s = Math.sin(rngValue * Math.PI * 2);
  const tangent = [tx * c + bx * s, ty * c + by * s, tz * c + bz * s];
  const bitangent = [
    up[1] * tangent[2] - up[2] * tangent[1],
    up[2] * tangent[0] - up[0] * tangent[2],
    up[0] * tangent[1] - up[1] * tangent[0],
  ];
  return { tangent, normal: up, bitangent };
}

/**
 * Turn 2D placements into instances on a heightfield with slope and
 * altitude masks. heightfield(x, z) returns height; slope is the
 * gradient magnitude. Returns [{position, basis, scale}].
 */
export function placeOnHeightfield(points2D, heightfield, {
  maxSlope = Infinity, minHeight = -Infinity, maxHeight = Infinity,
  seed = 7, minScale = 0.8, maxScale = 1.3, step = 0.25,
} = {}) {
  const rng = mulberry32(seed);
  const instances = [];
  for (const [x, z] of points2D) {
    const h = heightfield(x, z);
    if (h < minHeight || h > maxHeight) continue;
    const gx = (heightfield(x + step, z) - heightfield(x - step, z)) / (2 * step);
    const gz = (heightfield(x, z + step) - heightfield(x, z - step)) / (2 * step);
    const slope = Math.hypot(gx, gz);
    if (slope > maxSlope) continue;
    const normal = [-gx, 1, -gz];
    const basis = alignToNormal(normal, rng());
    instances.push({
      position: [x, h, z],
      basis,
      scale: minScale + rng() * (maxScale - minScale),
    });
  }
  return instances;
}

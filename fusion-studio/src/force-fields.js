'use strict';
// Force/vector field kernels: data-driven field descriptors sampled anywhere
// in space (and time). Used by particles, cloth wind, and FX. Fields are
// plain serializable objects; fieldVector is the single sampler.
//
//   {type:'gravity', direction:[x,y,z], strength}
//   {type:'wind', direction:[x,y,z], strength, gustFrequency, gustAmount}
//   {type:'vortex', center:[x,y,z], axis:[x,y,z], strength, core}
//   {type:'attractor', center:[x,y,z], strength, softening}  (negative = repel)
//   {type:'curlNoise', scale, seed, strength}
//   {type:'radial', center:[x,y,z], strength}  (outward blast / inward sink)

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Deterministic gradient (Perlin-style) noise from a seed.
function makeNoise3(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let a = (seed >>> 0) || 1;
  const rand = () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (hash, x, y, z) => {
    const u = (hash & 15) < 8 ? x : y;
    const v = (hash & 15) < 4 ? y : ((hash & 15) === 12 || (hash & 15) === 14 ? x : z);
    return (((hash & 1) === 0 ? u : -u) + ((hash & 2) === 0 ? v : -v));
  };
  const lerp = (a2, b, t) => a2 + t * (b - a2);
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(
        lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  };
}

const noiseCache = new Map();
function noiseFor(seed) {
  if (!noiseCache.has(seed)) noiseCache.set(seed, makeNoise3(seed));
  return noiseCache.get(seed);
}

const EPS = 0.002;
// Curl of a 3-component noise potential. The continuous curl is exactly
// divergence-free; this finite-difference curl carries a residual divergence
// of O(EPS^2 * fourth derivative of the potentials), which EPS = 0.002 keeps
// at ~1e-5 relative to field magnitude (verified by test).
function curlNoise(noise, x, y, z, scale) {
  const s = scale;
  const e = EPS;
  const px = x * s, py = y * s, pz = z * s;
  // Three decorrelated noise potentials.
  const P1 = (dx, dy, dz) => noise(px + dx, py + dy, pz + dz);
  const P2 = (dx, dy, dz) => noise(px + 47.3 + dx, py + 11.9 + dy, pz + 83.1 + dz);
  const P3 = (dx, dy, dz) => noise(px + 91.7 + dx, py + 57.3 + dy, pz + 13.9 + dz);
  // F = curl(Psi): Fx = dP3/dy - dP2/dz, etc. Derivatives wrt world coords
  // pick up the scale factor s.
  const fx = ((P3(0, e, 0) - P3(0, -e, 0)) - (P2(0, 0, e) - P2(0, 0, -e))) / (2 * e) * s;
  const fy = ((P1(0, 0, e) - P1(0, 0, -e)) - (P3(e, 0, 0) - P3(-e, 0, 0))) / (2 * e) * s;
  const fz = ((P2(e, 0, 0) - P2(-e, 0, 0)) - (P1(0, e, 0) - P1(0, -e, 0))) / (2 * e) * s;
  return [fx, fy, fz];
}

/** Sample a field descriptor at point [x,y,z] and time t. Returns [fx,fy,fz]. */
export function fieldVector(field, point, t = 0) {
  const [x, y, z] = point;
  switch (field.type) {
    case 'gravity': {
      const d = norm3(field.direction || [0, -1, 0]);
      const s = field.strength ?? 9.81;
      return [d[0] * s, d[1] * s, d[2] * s];
    }
    case 'wind': {
      const d = norm3(field.direction || [1, 0, 0]);
      let s = field.strength ?? 1;
      if (field.gustAmount) {
        s *= 1 + field.gustAmount * Math.sin(2 * Math.PI * (field.gustFrequency ?? 0.5) * t + (field.gustPhase ?? 0));
      }
      return [d[0] * s, d[1] * s, d[2] * s];
    }
    case 'vortex': {
      const c = field.center || [0, 0, 0];
      const axis = norm3(field.axis || [0, 1, 0]);
      const rx = x - c[0], ry = y - c[1], rz = z - c[2];
      // Tangential direction: axis x r. Magnitude strength * r / (r^2 + core^2)
      // peaks at r = core, solid-body-like inside, 1/r outside.
      const tx = axis[1] * rz - axis[2] * ry;
      const ty = axis[2] * rx - axis[0] * rz;
      const tz = axis[0] * ry - axis[1] * rx;
      const r2 = rx * rx + ry * ry + rz * rz - (rx * axis[0] + ry * axis[1] + rz * axis[2]) ** 2;
      const core = field.core ?? 0.5;
      const m = (field.strength ?? 1) / (Math.max(r2, 0) + core * core);
      return [tx * m, ty * m, tz * m];
    }
    case 'attractor': {
      const c = field.center || [0, 0, 0];
      const rx = c[0] - x, ry = c[1] - y, rz = c[2] - z;
      const r = Math.hypot(rx, ry, rz);
      if (r < 1e-9) return [0, 0, 0];
      const soft = field.softening ?? 0.1;
      const m = (field.strength ?? 1) / (r * (r * r + soft * soft));
      return [rx * m, ry * m, rz * m];
    }
    case 'radial': {
      const c = field.center || [0, 0, 0];
      const rx = x - c[0], ry = y - c[1], rz = z - c[2];
      const r = Math.hypot(rx, ry, rz);
      if (r < 1e-9) return [0, 0, 0];
      const m = (field.strength ?? 1) / r;
      return [rx * m, ry * m, rz * m];
    }
    case 'curlNoise': {
      const noise = noiseFor(field.seed ?? 1);
      const v = curlNoise(noise, x, y, z, field.scale ?? 0.5);
      const s = field.strength ?? 1;
      return [v[0] * s, v[1] * s, v[2] * s];
    }
    default:
      throw new Error(`unknown field type: ${field.type}`);
  }
}

/** Sample the sum of several fields. */
export function combinedFieldVector(fields, point, t = 0) {
  let fx = 0, fy = 0, fz = 0;
  for (const field of fields) {
    const v = fieldVector(field, point, t);
    fx += v[0]; fy += v[1]; fz += v[2];
  }
  return [fx, fy, fz];
}

/**
 * Numeric divergence of a field at a point (central differences).
 * Curl-noise fields return ~0; attractor/radial fields return their
 * analytic sink/source strength.
 */
export function fieldDivergence(field, point, t = 0, h = 0.02) {
  let div = 0;
  for (let axis = 0; axis < 3; axis++) {
    const plus = [point[0], point[1], point[2]];
    const minus = [point[0], point[1], point[2]];
    plus[axis] += h; minus[axis] -= h;
    div += (fieldVector(field, plus, t)[axis] - fieldVector(field, minus, t)[axis]) / (2 * h);
  }
  return div;
}

'use strict';
// Wind animation for vegetation (A20 "Wind animation for
// vegetation"): hierarchical joint bending over branch segment trees
// (e.g. from src/l-system.js). Each joint rotates by an angle driven
// by a traveling gust field; rotations accumulate root -> tip, so
// tips deflect most while segment lengths are preserved exactly.
// Stiffness grows toward the base via a per-depth flexibility decay.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return l < 1e-12 ? [0, 0, 0] : a.map((v) => v / l);
};

function rotationMatrix(axis, angle) {
  const [x, y, z] = axis;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}
function applyMat(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
function multiplyMat(a, b) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  }
  return out;
}
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Gust strength at a position/time: base wind plus traveling sine
 * waves. Deterministic. params: { base, gust, wavelength, speed,
 * direction (of travel, horizontal) }.
 */
export function gustStrength(position, time, { base = 0.4, gust = 0.6, wavelength = 6, speed = 1.5, direction = [1, 0, 0] } = {}) {
  const dir = norm(direction);
  const phase = (dot(position, dir) / wavelength) * Math.PI * 2 - time * speed;
  return base + gust * (0.5 + 0.5 * Math.sin(phase)) * Math.sin(phase * 0.37 + 1.7) * 0.5 + gust * 0.5 * Math.sin(phase);
}

function pointKey(p) {
  return `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
}

/**
 * Bend a segment list ([{a, b, radius?, depth?}]) by wind.
 * options: { time, windDirection = [1,0,0], strength (scalar or
 * gust params object), flexibility (rad at strength 1, depth 0),
 * depthDecay (flexibility multiplier per depth) }.
 * Returns a new segment list with identical lengths/radii/depths.
 */
export function bendByWind(segments, {
  time = 0, windDirection = [1, 0, 0], strength = null,
  flexibility = 0.12, depthDecay = 0.8,
} = {}) {
  const wind = norm(windDirection);
  if (Math.hypot(...wind) === 0) throw new Error('wind: windDirection must be non-zero');
  const strengthAt = typeof strength === 'function'
    ? strength
    : (p) => (strength === null ? gustStrength(p, time) : strength);

  // Build the hierarchy: children start where a parent ends.
  const childrenOf = new Map();
  const isChild = new Set();
  const byStart = new Map();
  segments.forEach((seg, i) => {
    const key = pointKey(seg.a);
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(i);
  });
  segments.forEach((seg, i) => {
    const kids = byStart.get(pointKey(seg.b)) || [];
    childrenOf.set(i, kids);
    for (const kid of kids) isChild.add(kid);
  });
  const roots = segments.map((_, i) => i).filter((i) => !isChild.has(i));

  const out = new Array(segments.length);
  function traverse(index, parentEnd, parentRotation) {
    const seg = segments[index];
    const originalDir = sub(seg.b, seg.a);
    const len = Math.hypot(...originalDir);
    const dir0 = len < 1e-12 ? [0, 1, 0] : originalDir.map((v) => v / len);
    // Joint rotation: bend the CURRENT direction toward the wind.
    const currentDir = applyMat(parentRotation, dir0);
    let joint = IDENTITY;
    const axisRaw = cross(currentDir, wind);
    const axisLen = Math.hypot(...axisRaw);
    if (axisLen > 1e-9) {
      const depth = seg.depth ?? 0;
      const localStrength = strengthAt(parentEnd, time);
      const angle = localStrength * flexibility * Math.pow(depthDecay, depth);
      joint = rotationMatrix(axisRaw.map((v) => v / axisLen), angle);
    }
    const rotation = multiplyMat(joint, parentRotation);
    const newDir = applyMat(rotation, dir0);
    const a = [...parentEnd];
    const b = [a[0] + newDir[0] * len, a[1] + newDir[1] * len, a[2] + newDir[2] * len];
    out[index] = { ...seg, a, b };
    for (const kid of childrenOf.get(index) || []) traverse(kid, b, rotation);
  }
  for (const root of roots) traverse(root, [...segments[root].a], IDENTITY);
  return out;
}

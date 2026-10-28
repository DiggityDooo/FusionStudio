'use strict';
// Procedural asset generators (A27 "Procedural asset generators"):
// parametric hard-surface assets emitted as indexed meshes in the repo
// convention { positions: Float32Array, indices: Uint32Array, normals:
// Float32Array }. Every generator's dimensions are exact functions of
// its parameters, so output is verifiable geometrically.

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

function finish(positions, indices) {
  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return { positions: pos, indices: idx, normals: computeNormals(pos, idx) };
}

// Append an axis-aligned box (24 verts, flat faces) centered at c.
function pushBox(P, I, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +z
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // -z
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], // +x
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // -x
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], // +y
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // -y
  ];
  for (const face of faces) {
    const base = P.length / 3;
    for (const v of face) P.push(v[0], v[1], v[2]);
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function requirePositive(name, value) {
  if (!(value > 0)) throw new Error(`procedural-assets: ${name} must be positive`);
}

/**
 * Solid staircase: step k is a full-height block (ground to its tread),
 * so the union is a classic solid stair. Total height = steps*riser,
 * total run = steps*tread, volume = width*tread*riser*steps*(steps+1)/2.
 */
export function generateStairs({ steps = 10, width = 1.2, tread = 0.28, riser = 0.18 } = {}) {
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('procedural-assets: steps must be a positive integer');
  requirePositive('width', width); requirePositive('tread', tread); requirePositive('riser', riser);
  const P = [], I = [];
  for (let k = 0; k < steps; k++) {
    const height = (k + 1) * riser;
    pushBox(P, I, 0, height / 2, (k + 0.5) * tread, width, height, tread);
  }
  return finish(P, I);
}

/**
 * Extruded spur gear: trapezoidal teeth around a root circle, tip
 * radius = radius + toothDepth, extruded over thickness, centered caps.
 */
export function generateGear({ teeth = 12, radius = 1, toothDepth = 0.18, thickness = 0.3 } = {}) {
  if (!Number.isInteger(teeth) || teeth < 3) throw new Error('procedural-assets: teeth must be an integer >= 3');
  requirePositive('radius', radius); requirePositive('toothDepth', toothDepth); requirePositive('thickness', thickness);
  // Outline: 4 points per tooth (root, root, tip, tip).
  const outline = [];
  const tip = radius + toothDepth;
  for (let k = 0; k < teeth; k++) {
    const a0 = (k / teeth) * Math.PI * 2;
    const T = (Math.PI * 2) / teeth;
    for (const [frac, r] of [[0, radius], [0.3, radius], [0.45, tip], [0.7, tip]]) {
      const a = a0 + frac * T;
      outline.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  const n = outline.length;
  const P = [], I = [];
  const half = thickness / 2;
  // Front cap (z=+half): center + ring; back cap mirrored winding.
  P.push(0, 0, half);
  const frontCenter = 0;
  const frontStart = P.length / 3;
  for (const [x, y] of outline) P.push(x, y, half);
  for (let i = 0; i < n; i++) I.push(frontCenter, frontStart + i, frontStart + ((i + 1) % n));
  const backCenter = P.length / 3;
  P.push(0, 0, -half);
  const backStart = P.length / 3;
  for (const [x, y] of outline) P.push(x, y, -half);
  for (let i = 0; i < n; i++) I.push(backCenter, backStart + ((i + 1) % n), backStart + i);
  // Sides: separate ring verts so cap/side normals stay distinct.
  const sideStart = P.length / 3;
  for (const [x, y] of outline) P.push(x, y, half);
  for (const [x, y] of outline) P.push(x, y, -half);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const f0 = sideStart + i, f1 = sideStart + j, b0 = sideStart + n + i, b1 = sideStart + n + j;
    I.push(f0, b0, b1, f0, b1, f1);
  }
  return finish(P, I);
}

/**
 * Fence run along +X from x=0: posts every `postEvery` (plus an end
 * post), horizontal rails at each of `railLevels` (fractions of
 * height). All parts are boxes merged into one mesh.
 */
export function generateFence({ length = 4, height = 1.1, postEvery = 1, postSize = 0.09, railSize = 0.05, railLevels = [0.35, 0.85] } = {}) {
  requirePositive('length', length); requirePositive('height', height); requirePositive('postEvery', postEvery);
  const P = [], I = [];
  const postCount = Math.floor(length / postEvery + 1e-9) + 1;
  for (let k = 0; k < postCount; k++) {
    pushBox(P, I, k * postEvery, height / 2, 0, postSize, height, postSize);
  }
  for (const level of railLevels) {
    if (!(level > 0 && level < 1)) throw new Error('procedural-assets: rail levels must be in (0, 1)');
    pushBox(P, I, length / 2, level * height, 0, length, railSize, railSize * 0.6);
  }
  const mesh = finish(P, I);
  mesh.meta = { postCount, railCount: railLevels.length };
  return mesh;
}

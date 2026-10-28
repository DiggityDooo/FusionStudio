'use strict';
// Support generation + print-orientation optimization for FDM, on plain
// {positions, indices} triangle meshes (the src/slicer.js mesh shape).
//
// Overhang rule: a down-facing triangle needs support when its plane
// inclination to the build plate is below maxAngleDeg (flat underside =
// 0 deg = always supported; vertical wall = 90 deg = never).
//
// Support model (documented simplification): grid columns under overhang
// faces. Each overhang face votes into the XY grid cell of its centroid;
// a cell's column rises from the plate to the lowest voting face centroid
// (minus topGap). This is the classic grid-support approximation -- not
// tree supports and not per-pixel contact solving.

function tri(mesh, i) {
  const p = mesh.positions;
  const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
  return [
    [p[a], p[a + 1], p[a + 2]],
    [p[b], p[b + 1], p[b + 2]],
    [p[c], p[c + 1], p[c + 2]],
  ];
}

export function faceNormal(mesh, triIndex) {
  const [a, b, c] = tri(mesh, triIndex * 3);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function faceAreaCentroid(mesh, triIndex) {
  const [a, b, c] = tri(mesh, triIndex * 3);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cr = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  return {
    area: Math.hypot(...cr) / 2,
    centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
  };
}

/** Faces needing support: down-facing and shallower than maxAngleDeg. */
export function overhangFaces(mesh, { maxAngleDeg = 45 } = {}) {
  const faces = [];
  const triCount = mesh.indices.length / 3;
  for (let i = 0; i < triCount; i++) {
    const normal = faceNormal(mesh, i);
    if (normal[2] >= 0) continue;
    const inclination = Math.acos(Math.min(1, Math.abs(normal[2]))) * 180 / Math.PI;
    // Epsilon: a face at exactly the threshold (a 45 deg rotated cube) must
    // not be flagged by float32 vertex storage + acos noise (~1e-5 deg).
    if (inclination < maxAngleDeg - 1e-4) {
      const { area, centroid } = faceAreaCentroid(mesh, i);
      faces.push({ index: i, normal, area, centroid, inclination });
    }
  }
  return faces;
}

/** Total down-facing shallow area (the support-driving metric). */
export function overhangArea(mesh, options = {}) {
  return overhangFaces(mesh, options).reduce((s, f) => s + f.area, 0);
}

/**
 * Generate grid support columns. Every overhang triangle is rasterized
 * over the XY grid (cell centers tested against the projected triangle);
 * each covered cell's column rises to the triangle's interpolated height
 * there (lowest vote wins), minus topGap. Returns {columns, volume,
 * contactArea}; a column is {x, y, size, zTop}, rising from plateZ.
 */
export function generateSupports(mesh, {
  maxAngleDeg = 45, xySpacing = 4, plateZ = 0, topGap = 0.2, columnScale = 0.8, minHeight = 0.4,
} = {}) {
  const cells = new Map();
  const vote = (x, y, z) => {
    if (z - topGap - plateZ < minHeight) return; // rests (nearly) on the plate
    const key = `${Math.floor(x / xySpacing)},${Math.floor(y / xySpacing)}`;
    const existing = cells.get(key);
    if (!existing || z < existing.zTop) {
      cells.set(key, {
        x: (Math.floor(x / xySpacing) + 0.5) * xySpacing,
        y: (Math.floor(y / xySpacing) + 0.5) * xySpacing,
        zTop: z - topGap,
      });
    }
  };
  for (const face of overhangFaces(mesh, { maxAngleDeg })) {
    // Centroid vote guarantees every overhang face seeds its cell even when
    // no grid center falls inside its projection (small pole triangles).
    vote(face.centroid[0], face.centroid[1], face.centroid[2]);
    const [a, b, c] = tri(mesh, face.index * 3);
    const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]);
    const minY = Math.min(a[1], b[1], c[1]), maxY = Math.max(a[1], b[1], c[1]);
    const denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denom) < 1e-12) { vote(face.centroid[0], face.centroid[1], face.centroid[2]); continue; }
    const gx0 = Math.floor(minX / xySpacing), gx1 = Math.floor(maxX / xySpacing);
    const gy0 = Math.floor(minY / xySpacing), gy1 = Math.floor(maxY / xySpacing);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const x = (gx + 0.5) * xySpacing, y = (gy + 0.5) * xySpacing;
        const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denom;
        const w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        vote(x, y, w0 * a[2] + w1 * b[2] + w2 * c[2]);
      }
    }
  }
  const size = xySpacing * columnScale;
  const columns = [...cells.values()].map((c) => ({ ...c, size }));
  const volume = columns.reduce((s, c) => s + size * size * Math.max(0, c.zTop - plateZ), 0);
  return { columns, volume, contactArea: columns.length * size * size };
}

/** Rotate a mesh (returns a new mesh; input untouched). rotation: {axis, angleDeg} or 3x3 matrix array. */
export function rotateMesh(mesh, rotation) {
  let m;
  if (Array.isArray(rotation)) {
    m = rotation;
  } else {
    const { axis, angleDeg } = rotation;
    const l = Math.hypot(...axis) || 1;
    const [x, y, z] = [axis[0] / l, axis[1] / l, axis[2] / l];
    const t = angleDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
    m = [
      c + x * x * C, x * y * C - z * s, x * z * C + y * s,
      y * x * C + z * s, c + y * y * C, y * z * C - x * s,
      z * x * C - y * s, z * y * C + x * s, c + z * z * C,
    ];
  }
  const src = mesh.positions;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const px = src[i], py = src[i + 1], pz = src[i + 2];
    out[i] = m[0] * px + m[1] * py + m[2] * pz;
    out[i + 1] = m[3] * px + m[4] * py + m[5] * pz;
    out[i + 2] = m[6] * px + m[7] * py + m[8] * pz;
  }
  return { positions: out, indices: mesh.indices };
}

function dropToPlate(mesh) {
  let minZ = Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) minZ = Math.min(minZ, mesh.positions[i]);
  const out = new Float32Array(mesh.positions);
  for (let i = 2; i < out.length; i += 3) out[i] -= minZ;
  return { positions: out, indices: mesh.indices };
}

export const ORIENTATION_CANDIDATES = [
  { name: 'as-is', rotation: null },
  { name: 'x+90', rotation: { axis: [1, 0, 0], angleDeg: 90 } },
  { name: 'x-90', rotation: { axis: [1, 0, 0], angleDeg: -90 } },
  { name: 'y+90', rotation: { axis: [0, 1, 0], angleDeg: 90 } },
  { name: 'y-90', rotation: { axis: [0, 1, 0], angleDeg: -90 } },
  { name: 'x180', rotation: { axis: [1, 0, 0], angleDeg: 180 } },
  { name: 'y180', rotation: { axis: [0, 1, 0], angleDeg: 180 } },
  { name: 'x+45', rotation: { axis: [1, 0, 0], angleDeg: 45 } },
  { name: 'x-45', rotation: { axis: [1, 0, 0], angleDeg: -45 } },
  { name: 'y+45', rotation: { axis: [0, 1, 0], angleDeg: 45 } },
  { name: 'y-45', rotation: { axis: [0, 1, 0], angleDeg: -45 } },
];

/**
 * Score an orientation: drop the rotated mesh onto the plate, then
 * measure support volume and overhang area. Lower is better.
 */
export function evaluateOrientation(mesh, candidate, supportOptions = {}) {
  const rotated = candidate.rotation ? rotateMesh(mesh, candidate.rotation) : mesh;
  const dropped = dropToPlate(rotated);
  const supports = generateSupports(dropped, supportOptions);
  return {
    name: candidate.name,
    supportVolume: supports.volume,
    supportColumns: supports.columns.length,
    overhangArea: overhangArea(dropped, supportOptions),
    mesh: dropped,
  };
}

/** Pick the candidate orientation with the least support volume. */
export function optimizeOrientation(mesh, { candidates = ORIENTATION_CANDIDATES, ...supportOptions } = {}) {
  const results = candidates.map((c) => evaluateOrientation(mesh, c, supportOptions));
  results.sort((a, b) => (a.supportVolume - b.supportVolume) || (a.overhangArea - b.overhangArea));
  return { best: results[0], results };
}

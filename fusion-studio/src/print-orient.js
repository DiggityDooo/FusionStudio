'use strict';
// Print orientation optimization (A24 "Print orientation
// optimization"): evaluate candidate build directions by the
// downward-facing area that would need support (excluding faces
// resting on the build plate) plus build height, and pick the best.

import { computeFaceNormals } from './mesh-segment.js';

function vertexAt(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

export function faceArea(positions, indices, face) {
  const a = vertexAt(positions, indices[face * 3]);
  const b = vertexAt(positions, indices[face * 3 + 1]);
  const c = vertexAt(positions, indices[face * 3 + 2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ) / 2;
}

/**
 * Support evaluation for a build direction (unit vector pointing
 * "up" in build space, expressed in object coordinates).
 * A face needs support when its normal points downward steeply:
 * dot(normal, up) < -cos(overhangAngleDeg from vertical-down is
 * measured via sin threshold below). Faces whose vertices all rest
 * on the build plate (min projection along up) are exempt.
 */
export function evaluateOrientation(mesh, up, { overhangAngleDeg = 45, plateEpsilon = 1e-6 } = {}) {
  const len = Math.hypot(...up);
  if (len < 1e-12) throw new Error('print-orient: zero build direction');
  const u = up.map((v) => v / len);
  const normals = computeFaceNormals(mesh);
  const faces = mesh.indices.length / 3;
  // Projection range along up (build height + plate level).
  let minProj = Infinity, maxProj = -Infinity;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const p = vertexAt(mesh.positions, i);
    const proj = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    minProj = Math.min(minProj, proj);
    maxProj = Math.max(maxProj, proj);
  }
  const threshold = -Math.sin((overhangAngleDeg * Math.PI) / 180);
  let supportArea = 0;
  let totalArea = 0;
  for (let f = 0; f < faces; f++) {
    const area = faceArea(mesh.positions, mesh.indices, f);
    totalArea += area;
    const n = [normals[f * 3], normals[f * 3 + 1], normals[f * 3 + 2]];
    const facing = n[0] * u[0] + n[1] * u[1] + n[2] * u[2];
    if (facing >= threshold) continue;
    // Exempt when the whole face rests on the plate.
    let onPlate = true;
    for (let k = 0; k < 3; k++) {
      const p = vertexAt(mesh.positions, mesh.indices[f * 3 + k]);
      const proj = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
      if (proj > minProj + plateEpsilon) { onPlate = false; break; }
    }
    if (!onPlate) supportArea += area;
  }
  return { supportArea, totalArea, height: maxProj - minProj, up: u };
}

/** Deterministic candidate directions: axes, diagonals, fibonacci sphere. */
export function candidateDirections(count = 162) {
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    dirs.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return dirs;
}

/**
 * Find the best build direction minimizing support area, breaking
 * ties by lower build height. Returns the evaluation plus `up`.
 */
export function findBestOrientation(mesh, { candidates = null, overhangAngleDeg = 45 } = {}) {
  const dirs = candidates || candidateDirections();
  let best = null;
  for (const dir of dirs) {
    const evaluation = evaluateOrientation(mesh, dir, { overhangAngleDeg });
    if (!best
      || evaluation.supportArea < best.supportArea - 1e-12
      || (Math.abs(evaluation.supportArea - best.supportArea) <= 1e-12 && evaluation.height < best.height)) {
      best = evaluation;
    }
  }
  return best;
}

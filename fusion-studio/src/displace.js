'use strict';
// True displacement (A9 "Displacement (bump, normal, true
// micro-displacement, vector displacement)"): move mesh vertices
// along their normals by a height field (scalar displacement) or
// along arbitrary per-vertex vectors (vector displacement), then
// recompute vertex normals. Heights come from a function
// (position, normal, uv, index) => number or a per-vertex array.

import { computeVertexNormals } from './light-bake.js';

function baseNormals(mesh) {
  return mesh.normals || computeVertexNormals(mesh);
}

function finish(positions, mesh) {
  const displaced = { positions, normals: null, indices: mesh.indices };
  displaced.normals = computeVertexNormals(displaced);
  if (mesh.uvs) displaced.uvs = mesh.uvs;
  return displaced;
}

/**
 * Scalar displacement: p' = p + n * (h - midpoint) * scale.
 * displacement: function(position, normal, uv, vertexIndex) =>
 * height, or a per-vertex Float32Array/array of heights.
 */
export function displaceMesh(mesh, displacement, { scale = 1, midpoint = 0 } = {}) {
  const count = mesh.positions.length / 3;
  const normals = baseNormals(mesh);
  const heights = typeof displacement === 'function'
    ? null
    : displacement;
  if (heights && heights.length !== count) throw new Error('displace: heights length must match the vertex count');
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < count; i++) {
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const uv = mesh.uvs ? [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]] : null;
    const h = heights ? heights[i] : displacement(p, n, uv, i);
    const offset = (h - midpoint) * scale;
    positions[i * 3] = p[0] + n[0] * offset;
    positions[i * 3 + 1] = p[1] + n[1] * offset;
    positions[i * 3 + 2] = p[2] + n[2] * offset;
  }
  return finish(positions, mesh);
}

/**
 * Vector displacement: p' = p + v * scale, with v per-vertex
 * (Float32Array of 3 per vertex) or from a function
 * (position, normal, uv, index) => [x, y, z].
 */
export function vectorDisplaceMesh(mesh, vectors, { scale = 1 } = {}) {
  const count = mesh.positions.length / 3;
  const normals = baseNormals(mesh);
  const isFn = typeof vectors === 'function';
  if (!isFn && vectors.length !== count * 3) throw new Error('displace: vectors length must be 3x the vertex count');
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < count; i++) {
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const uv = mesh.uvs ? [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]] : null;
    const v = isFn ? vectors(p, n, uv, i) : [vectors[i * 3], vectors[i * 3 + 1], vectors[i * 3 + 2]];
    positions[i * 3] = p[0] + v[0] * scale;
    positions[i * 3 + 1] = p[1] + v[1] * scale;
    positions[i * 3 + 2] = p[2] + v[2] * scale;
  }
  return finish(positions, mesh);
}

/** Height range a displacement will produce (for bounds/culling). */
export function displacementRange(displacement, mesh) {
  const count = mesh.positions.length / 3;
  if (typeof displacement !== 'function') {
    let min = Infinity, max = -Infinity;
    for (const h of displacement) { if (h < min) min = h; if (h > max) max = h; }
    return { min, max };
  }
  const normals = baseNormals(mesh);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < count; i++) {
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const uv = mesh.uvs ? [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]] : null;
    const h = displacement(p, n, uv, i);
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { min, max };
}

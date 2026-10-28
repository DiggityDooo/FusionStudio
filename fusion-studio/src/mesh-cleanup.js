'use strict';
// Scene optimization / cleanup (A26 "Scene optimization and cleanup
// tools"): vertex welding, degenerate-triangle removal, and
// unreferenced-vertex compaction for triangle meshes in the
// standard { positions, indices, normals? } convention.

function vertexAt(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

/**
 * Weld vertices that coincide within tolerance. Returns a new mesh
 * plus a remap (old index -> new index). Normals are averaged.
 */
export function weldVertices(mesh, { tolerance = 1e-6 } = {}) {
  const positions = mesh.positions;
  const count = positions.length / 3;
  const keyOf = (p) => p.map((v) => Math.round(v / tolerance)).join(',');
  const buckets = new Map();
  const remap = new Uint32Array(count);
  const outPositions = [];
  const outNormals = mesh.normals ? [] : null;
  const normalSums = mesh.normals ? [] : null;
  for (let i = 0; i < count; i++) {
    const p = vertexAt(positions, i);
    const key = keyOf(p);
    if (!buckets.has(key)) {
      buckets.set(key, outPositions.length / 3);
      outPositions.push(p[0], p[1], p[2]);
      if (outNormals) {
        outNormals.push(0, 0, 0);
        normalSums.push([0, 0, 0]);
      }
    }
    const target = buckets.get(key);
    remap[i] = target;
    if (normalSums) {
      const s = normalSums[target];
      s[0] += mesh.normals[i * 3]; s[1] += mesh.normals[i * 3 + 1]; s[2] += mesh.normals[i * 3 + 2];
    }
  }
  if (outNormals) {
    for (let i = 0; i < normalSums.length; i++) {
      const s = normalSums[i];
      const l = Math.hypot(...s);
      outNormals[i * 3] = l > 0 ? s[0] / l : 0;
      outNormals[i * 3 + 1] = l > 0 ? s[1] / l : 0;
      outNormals[i * 3 + 2] = l > 0 ? s[2] / l : 1;
    }
  }
  const outIndices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) outIndices[i] = remap[mesh.indices[i]];
  return {
    mesh: {
      positions: Float32Array.from(outPositions),
      normals: outNormals ? Float32Array.from(outNormals) : null,
      indices: outIndices,
    },
    remap,
    weldedCount: count - outPositions.length / 3,
  };
}

/** Remove triangles with repeated indices or near-zero area. */
export function removeDegenerateTriangles(mesh, { areaEpsilon = 1e-12 } = {}) {
  const positions = mesh.positions;
  const kept = [];
  let removed = 0;
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const [ia, ib, ic] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    if (ia === ib || ib === ic || ia === ic) { removed++; continue; }
    const a = vertexAt(positions, ia), b = vertexAt(positions, ib), c = vertexAt(positions, ic);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.hypot(...cross) / 2 <= areaEpsilon) { removed++; continue; }
    kept.push(ia, ib, ic);
  }
  return {
    mesh: { positions: mesh.positions, normals: mesh.normals ?? null, indices: Uint32Array.from(kept) },
    removed,
  };
}

/** Drop vertices no triangle references; remap indices accordingly. */
export function removeUnreferencedVertices(mesh) {
  const count = mesh.positions.length / 3;
  const used = new Uint8Array(count);
  for (const idx of mesh.indices) used[idx] = 1;
  const remap = new Int32Array(count).fill(-1);
  const outPositions = [];
  const outNormals = mesh.normals ? [] : null;
  for (let i = 0; i < count; i++) {
    if (!used[i]) continue;
    remap[i] = outPositions.length / 3;
    const p = vertexAt(mesh.positions, i);
    outPositions.push(p[0], p[1], p[2]);
    if (outNormals) outNormals.push(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
  }
  const outIndices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) outIndices[i] = remap[mesh.indices[i]];
  return {
    mesh: {
      positions: Float32Array.from(outPositions),
      normals: outNormals ? Float32Array.from(outNormals) : null,
      indices: outIndices,
    },
    removedCount: count - outPositions.length / 3,
  };
}

/** Full cleanup pipeline: weld -> degenerate removal -> compaction. */
export function cleanupMesh(mesh, options = {}) {
  const welded = weldVertices(mesh, options);
  const cleaned = removeDegenerateTriangles(welded.mesh, options);
  const compacted = removeUnreferencedVertices(cleaned.mesh);
  return {
    mesh: compacted.mesh,
    stats: {
      verticesBefore: mesh.positions.length / 3,
      verticesAfter: compacted.mesh.positions.length / 3,
      trianglesBefore: mesh.indices.length / 3,
      trianglesAfter: compacted.mesh.indices.length / 3,
      welded: welded.weldedCount,
      degenerateRemoved: cleaned.removed,
      unreferencedRemoved: compacted.removedCount,
    },
  };
}

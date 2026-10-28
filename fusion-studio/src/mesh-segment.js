'use strict';
// Smart selection / segmentation (A31 "Smart selection and
// segmentation of meshes"): dual-graph face adjacency, dihedral
// angle computation, region growing by angle threshold, and
// planar-region selection from a seed face.

function vertexAt(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}

export function faceNormal(positions, indices, face) {
  const a = vertexAt(positions, indices[face * 3]);
  const b = vertexAt(positions, indices[face * 3 + 1]);
  const c = vertexAt(positions, indices[face * 3 + 2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const l = Math.hypot(...n);
  return l < 1e-18 ? [0, 0, 0] : n.map((v) => v / l);
}

/** All face normals (Float32Array, 3 per face). */
export function computeFaceNormals(mesh) {
  const faces = mesh.indices.length / 3;
  const out = new Float32Array(faces * 3);
  for (let f = 0; f < faces; f++) {
    const n = faceNormal(mesh.positions, mesh.indices, f);
    out.set(n, f * 3);
  }
  return out;
}

/**
 * Dual-graph adjacency: for each face, a list of
 * { face, angleDeg } neighbors sharing an edge, where angleDeg is
 * the angle between face normals (0 = coplanar continuation).
 */
export function buildFaceAdjacency(mesh) {
  const faces = mesh.indices.length / 3;
  const normals = computeFaceNormals(mesh);
  const edgeToFaces = new Map();
  const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let f = 0; f < faces; f++) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[f * 3 + e];
      const b = mesh.indices[f * 3 + ((e + 1) % 3)];
      const k = key(a, b);
      if (!edgeToFaces.has(k)) edgeToFaces.set(k, []);
      edgeToFaces.get(k).push(f);
    }
  }
  const adjacency = Array.from({ length: faces }, () => []);
  const getN = (f) => [normals[f * 3], normals[f * 3 + 1], normals[f * 3 + 2]];
  for (const sharing of edgeToFaces.values()) {
    for (let i = 0; i < sharing.length; i++) {
      for (let j = i + 1; j < sharing.length; j++) {
        const f1 = sharing[i], f2 = sharing[j];
        const n1 = getN(f1), n2 = getN(f2);
        const d = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
        const angleDeg = (Math.acos(d) * 180) / Math.PI;
        adjacency[f1].push({ face: f2, angleDeg });
        adjacency[f2].push({ face: f1, angleDeg });
      }
    }
  }
  return adjacency;
}

/**
 * Segment the mesh into regions: connected components of the dual
 * graph where edges with dihedral angle > threshold are cut.
 * Returns { labels: Int32Array (region id per face), regionCount }.
 */
export function segmentByAngle(mesh, { angleThresholdDeg = 30 } = {}) {
  const adjacency = buildFaceAdjacency(mesh);
  const faces = adjacency.length;
  const labels = new Int32Array(faces).fill(-1);
  let regionCount = 0;
  for (let seed = 0; seed < faces; seed++) {
    if (labels[seed] !== -1) continue;
    const stack = [seed];
    labels[seed] = regionCount;
    while (stack.length) {
      const f = stack.pop();
      for (const { face, angleDeg } of adjacency[f]) {
        if (labels[face] === -1 && angleDeg <= angleThresholdDeg) {
          labels[face] = regionCount;
          stack.push(face);
        }
      }
    }
    regionCount++;
  }
  return { labels, regionCount };
}

/**
 * Planar selection: flood from a seed face across neighbors whose
 * normal is within angleDeg of the SEED face's normal (flat-region
 * selection, not a growing-angle chain).
 */
export function selectPlanarRegion(mesh, seedFace, { angleDeg = 10 } = {}) {
  const normals = computeFaceNormals(mesh);
  const adjacency = buildFaceAdjacency(mesh);
  const faces = adjacency.length;
  if (seedFace < 0 || seedFace >= faces) throw new Error('segment: seed face out of range');
  const seedNormal = [normals[seedFace * 3], normals[seedFace * 3 + 1], normals[seedFace * 3 + 2]];
  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);
  const selected = new Uint8Array(faces);
  const stack = [seedFace];
  selected[seedFace] = 1;
  while (stack.length) {
    const f = stack.pop();
    for (const { face } of adjacency[f]) {
      if (selected[face]) continue;
      const n = [normals[face * 3], normals[face * 3 + 1], normals[face * 3 + 2]];
      const d = n[0] * seedNormal[0] + n[1] * seedNormal[1] + n[2] * seedNormal[2];
      if (d >= cosLimit) {
        selected[face] = 1;
        stack.push(face);
      }
    }
  }
  const facesOut = [];
  selected.forEach((v, i) => { if (v) facesOut.push(i); });
  return facesOut;
}

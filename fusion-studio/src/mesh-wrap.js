'use strict';
// Mesh wrap kernel: closest-point projection of a template mesh onto a
// target surface with Laplacian relaxation -- the core of scan-to-template
// facial topology wrapping. Meshes are {positions, indices} (flat arrays).
// Closest-point search is brute force (correct at tool/test scales; a BVH
// can replace it without changing semantics).

function tri(mesh, flat) {
  const p = mesh.positions;
  const a = mesh.indices[flat] * 3, b = mesh.indices[flat + 1] * 3, c = mesh.indices[flat + 2] * 3;
  return [
    [p[a], p[a + 1], p[a + 2]],
    [p[b], p[b + 1], p[b + 2]],
    [p[c], p[c + 1], p[c + 2]],
  ];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Closest point on triangle abc to p (Ericson's region classification). */
export function closestPointOnTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: [...a], barycentric: [1, 0, 0] };
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: [...b], barycentric: [0, 1, 0] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]], barycentric: [1 - v, v, 0] };
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: [...c], barycentric: [0, 0, 1] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]], barycentric: [1 - w, 0, w] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const bc = sub(c, b);
    return { point: [b[0] + w * bc[0], b[1] + w * bc[1], b[2] + w * bc[2]], barycentric: [0, 1 - w, w] };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return {
    point: [
      a[0] + ab[0] * v + ac[0] * w,
      a[1] + ab[1] * v + ac[1] * w,
      a[2] + ab[2] * v + ac[2] * w,
    ],
    barycentric: [1 - v - w, v, w],
  };
}

/** Closest point on a whole mesh: {point, distance, triIndex, barycentric}. */
export function closestPointOnMesh(p, mesh) {
  let best = null;
  for (let f = 0; f < mesh.indices.length; f += 3) {
    const [a, b, c] = tri(mesh, f);
    const hit = closestPointOnTriangle(p, a, b, c);
    const d = Math.hypot(p[0] - hit.point[0], p[1] - hit.point[1], p[2] - hit.point[2]);
    if (!best || d < best.distance) best = { ...hit, distance: d, triIndex: f / 3 };
  }
  return best;
}

function buildAdjacency(mesh) {
  const count = mesh.positions.length / 3;
  const adj = Array.from({ length: count }, () => new Set());
  for (let f = 0; f < mesh.indices.length; f += 3) {
    const [a, b, c] = [mesh.indices[f], mesh.indices[f + 1], mesh.indices[f + 2]];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }
  return adj.map((set) => [...set]);
}

/**
 * Wrap a template onto a target: iterate {project toward closest point by
 * `projection` factor, Laplacian relax by `smoothing`}, then a final full
 * projection so the result lies on the target surface. Topology and vertex
 * order are preserved. Returns {mesh, maxDistance, meanDistance}.
 */
export function wrapMesh(template, target, { iterations = 8, projection = 0.7, smoothing = 0.3 } = {}) {
  const count = template.positions.length / 3;
  const positions = Float64Array.from(template.positions);
  const adjacency = buildAdjacency(template);
  const current = () => ({ positions, indices: template.indices });
  const projectAll = (factor) => {
    for (let i = 0; i < count; i++) {
      const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const hit = closestPointOnMesh(p, target);
      positions[i * 3] += (hit.point[0] - p[0]) * factor;
      positions[i * 3 + 1] += (hit.point[1] - p[1]) * factor;
      positions[i * 3 + 2] += (hit.point[2] - p[2]) * factor;
    }
  };
  const smoothAll = (lambda) => {
    if (lambda <= 0) return;
    const next = Float64Array.from(positions);
    for (let i = 0; i < count; i++) {
      const neighbours = adjacency[i];
      if (!neighbours.length) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const n of neighbours) {
        cx += positions[n * 3]; cy += positions[n * 3 + 1]; cz += positions[n * 3 + 2];
      }
      const k = neighbours.length;
      next[i * 3] = positions[i * 3] + (cx / k - positions[i * 3]) * lambda;
      next[i * 3 + 1] = positions[i * 3 + 1] + (cy / k - positions[i * 3 + 1]) * lambda;
      next[i * 3 + 2] = positions[i * 3 + 2] + (cz / k - positions[i * 3 + 2]) * lambda;
    }
    positions.set(next);
  };
  for (let it = 0; it < iterations; it++) {
    projectAll(projection);
    smoothAll(smoothing);
  }
  projectAll(1); // final conformity pass
  let maxDistance = 0, sum = 0;
  const result = current();
  for (let i = 0; i < count; i++) {
    const hit = closestPointOnMesh([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], target);
    maxDistance = Math.max(maxDistance, hit.distance);
    sum += hit.distance;
  }
  return { mesh: result, maxDistance, meanDistance: sum / count };
}

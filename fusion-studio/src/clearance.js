'use strict';
// Tolerance & clearance tools (A24 "Tolerance and clearance tools"):
// minimum distance between two meshes and a pass/fail clearance
// report for assembled/printed parts. Distance is vertex-to-surface
// (each vertex of A against the full surface of B and vice versa,
// via the exact closest-point-on-triangle kernel in mesh-wrap), which
// is exact for separated parts -- the case clearance checking exists
// for. Containment and face-face crossing without near vertices are
// blind spots; see clearanceReport.

import { closestPointOnMesh } from './mesh-wrap.js';

function vertices(mesh) {
  const out = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    out.push([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
  }
  return out;
}

function vertexToMeshMin(points, mesh) {
  let best = { distance: Infinity, point: null, closest: null };
  for (const p of points) {
    const hit = closestPointOnMesh(p, mesh);
    if (hit.distance < best.distance) best = { distance: hit.distance, point: p, closest: hit.point };
  }
  return best;
}

/**
 * Minimum vertex-to-surface distance between two meshes, both
 * directions, with the witness points. For separated convex-ish parts
 * this equals the true mesh distance; a vertex exactly on the other
 * surface yields 0.
 */
export function meshClearance(meshA, meshB) {
  const ab = vertexToMeshMin(vertices(meshA), meshB);
  const ba = vertexToMeshMin(vertices(meshB), meshA);
  const best = ab.distance <= ba.distance
    ? { distance: ab.distance, pointA: ab.point, pointB: ab.closest }
    : { distance: ba.distance, pointA: ba.closest, pointB: ba.point };
  return best;
}

/**
 * Count vertices of A closer than `tolerance` to B's surface (and
 * vice versa): the "too tight" hot spots a designer must fix.
 */
export function clearanceViolations(meshA, meshB, tolerance) {
  if (!(tolerance >= 0)) throw new Error('clearance: tolerance must be >= 0');
  const countWithin = (points, mesh) =>
    points.filter((p) => closestPointOnMesh(p, mesh).distance < tolerance).length;
  const vertsA = vertices(meshA), vertsB = vertices(meshB);
  return {
    tolerance,
    aTooClose: countWithin(vertsA, meshB),
    bTooClose: countWithin(vertsB, meshA),
    verticesA: vertsA.length,
    verticesB: vertsB.length,
  };
}

/**
 * Full report: minimum clearance, whether it meets the required
 * tolerance (with margin), and violation counts. NOTE: vertex-to-
 * surface sampling cannot detect face-face intersections where no
 * vertex is near the other surface (crossing thin walls); treat a
 * passing report as clearance-verified for separated parts, not as
 * an intersection proof.
 */
export function clearanceReport(meshA, meshB, { required = 0.2 } = {}) {
  const { distance, pointA, pointB } = meshClearance(meshA, meshB);
  const violations = clearanceViolations(meshA, meshB, required);
  return {
    minClearance: distance,
    pointA, pointB,
    required,
    margin: distance - required,
    passes: distance >= required,
    violations,
  };
}

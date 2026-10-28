'use strict';
// City/building generation (A20 "City/building/architectural
// generation"): extrude a 2D footprint polygon into a building with
// flat or gable roof. Emits the standard mesh convention with
// outward normals; volume is footprint area x height (checkable via
// src/mesh-section.js meshVolume).

import { signedArea } from './toolpath.js';

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function pointInTriangle(p, a, b, c) {
  const d1 = cross2(a, b, p), d2 = cross2(b, c, p), d3 = cross2(c, a, p);
  const hasNeg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
  const hasPos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
  return !(hasNeg && hasPos);
}

/** Ear-clipping triangulation of a simple polygon (CCW or CW). Returns index triples into the INPUT array. */
export function triangulatePolygon(polygon) {
  const pts = polygon.map((p) => [...p]);
  // Track original indices through the winding normalization —
  // returning indices into a reversed copy corrupts callers.
  const origIndex = pts.map((_, i) => i);
  if (signedArea(pts) < 0) {
    pts.reverse();
    origIndex.reverse();
  }
  const indices = pts.map((_, i) => i);
  const tris = [];
  let guard = 0;
  while (indices.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = indices[(i - 1 + indices.length) % indices.length];
      const curr = indices[i];
      const next = indices[(i + 1) % indices.length];
      if (cross2(pts[prev], pts[curr], pts[next]) <= 1e-15) continue; // reflex or collinear
      let ear = true;
      for (const other of indices) {
        if (other === prev || other === curr || other === next) continue;
        if (pointInTriangle(pts[other], pts[prev], pts[curr], pts[next])) { ear = false; break; }
      }
      if (ear) {
        tris.push([origIndex[prev], origIndex[curr], origIndex[next]]);
        indices.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) throw new Error('building: footprint triangulation failed (self-intersecting?)');
  }
  if (indices.length === 3) tris.push(indices.map((i) => origIndex[i]));
  return tris;
}

function buildExtrusion(footprint, height) {
  // Work in (x, z) as 2D; ensure CCW in that plane.
  let fp = footprint.map((p) => [...p]);
  const reversed = signedArea(fp) < 0;
  if (reversed) fp = [...fp].reverse();
  const n = fp.length;
  const positions = [];
  const normals = [];
  const indices = [];
  const push = (v, normal) => {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
    return positions.length / 3 - 1;
  };
  // Walls: quad per edge. For a CCW footprint in the XZ-as-XY plane,
  // the outward side of edge a->b in 3D is (dz, 0, -dx) normalized...
  // verified by signed volume in tests.
  for (let i = 0; i < n; i++) {
    const a = fp[i], b = fp[(i + 1) % n];
    const edge = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(...edge) || 1;
    const outward = [edge[1] / len, 0, -edge[0] / len];
    const a0 = push([a[0], 0, a[1]], outward);
    const b0 = push([b[0], 0, b[1]], outward);
    const b1 = push([b[0], height, b[1]], outward);
    const a1 = push([a[0], height, a[1]], outward);
    indices.push(a0, b1, b0, a0, a1, b1);
  }
  // Bottom cap (normal -Y) and top cap (normal +Y) via ear clipping.
  const tris = triangulatePolygon(fp);
  for (const [i, j, k] of tris) {
    // CCW in the (x, z) plane is mirrored when mapped to (x, y, z),
    // so cap windings are flipped relative to the 2D orientation.
    const top = [fp[i], fp[j], fp[k]].map((p) => push([p[0], height, p[1]], [0, 1, 0]));
    indices.push(top[0], top[2], top[1]);
    const bottom = [fp[i], fp[j], fp[k]].map((p) => push([p[0], 0, p[1]], [0, -1, 0]));
    indices.push(bottom[0], bottom[1], bottom[2]);
  }
  return {
    mesh: {
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      indices: Uint32Array.from(indices),
    },
    footprintCCW: fp,
  };
}

/**
 * Generate a building. footprint: [[x, z], ...]; floors * floorHeight
 * = wall height. roof: 'flat' | 'gable' (gable needs a rectangular
 * footprint; ridge runs along the longer side).
 */
export function generateBuilding({
  footprint, floors = 3, floorHeight = 3, roof = 'flat', roofHeight = 2,
} = {}) {
  if (!footprint || footprint.length < 3) throw new Error('building: footprint needs >= 3 points');
  if (floors < 1 || floorHeight <= 0) throw new Error('building: floors/floorHeight must be positive');
  const height = floors * floorHeight;
  const { mesh, footprintCCW } = buildExtrusion(footprint, height);
  if (roof === 'flat') return { mesh, height, footprintArea: Math.abs(signedArea(footprintCCW)) };
  if (roof !== 'gable') throw new Error(`building: unsupported roof ${roof}`);
  // Gable: rectangular footprints only.
  if (footprintCCW.length !== 4) throw new Error('building: gable roof needs a rectangular (4-point) footprint');
  const [p0, p1, p2, p3] = footprintCCW;
  const rightAngle = (a, b, c) => {
    const d = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    return Math.abs(d) < 1e-9;
  };
  if (!rightAngle(p0, p1, p2) || !rightAngle(p1, p2, p3)) {
    throw new Error('building: gable roof needs a rectangular footprint');
  }
  // Ridge along the longer pair of edges, centered.
  const longIsP0P1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const [ra, rb, rc, rd] = longIsP0P1 ? [p0, p1, p2, p3] : [p1, p2, p3, p0];
  const ridgeA = [(ra[0] + rd[0]) / 2, (ra[1] + rd[1]) / 2];
  const ridgeB = [(rb[0] + rc[0]) / 2, (rb[1] + rc[1]) / 2];
  const positions = Array.from(mesh.positions);
  const normals = Array.from(mesh.normals);
  const indices = Array.from(mesh.indices);
  // Remove the flat top-cap triangles: they are the ones with all
  // three normals +Y. Rebuild by filtering them out.
  const keptIndices = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [ia, ib, ic] = [indices[t], indices[t + 1], indices[t + 2]];
    const isTop = [ia, ib, ic].every((i) => normals[i * 3 + 1] === 1 && positions[i * 3 + 1] === height);
    if (!isTop) keptIndices.push(ia, ib, ic);
  }
  const push = (v, normal) => {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
    return positions.length / 3 - 1;
  };
  const apexY = height + roofHeight;
  // Two slopes. Slope normal: perpendicular to ridge direction and eave->ridge.
  const addSlope = (eaveA, eaveB, ridgeFrom, ridgeTo) => {
    const eaveDir = [ridgeTo[0] - ridgeFrom[0], 0, ridgeTo[1] - ridgeFrom[1]];
    const up = [ridgeFrom[0] - eaveA[0], apexY - height, ridgeFrom[1] - eaveA[1]];
    let normal = [
      eaveDir[1] * up[2] - eaveDir[2] * up[1],
      eaveDir[2] * up[0] - eaveDir[0] * up[2],
      eaveDir[0] * up[1] - eaveDir[1] * up[0],
    ];
    const l = Math.hypot(...normal) || 1;
    normal = normal.map((v) => v / l);
    // Self-correcting winding: the normal's horizontal component
    // must point away from the footprint centroid.
    const eaveMid = [(eaveA[0] + eaveB[0]) / 2, (eaveA[1] + eaveB[1]) / 2];
    const flip = (normal[0] * (eaveMid[0] - centroid[0]) + normal[2] * (eaveMid[1] - centroid[1])) < 0;
    if (flip) normal = normal.map((v) => -v);
    const a = push([eaveA[0], height, eaveA[1]], normal);
    const b = push([eaveB[0], height, eaveB[1]], normal);
    const c = push([ridgeTo[0], apexY, ridgeTo[1]], normal);
    const d = push([ridgeFrom[0], apexY, ridgeFrom[1]], normal);
    // Emit, then verify against the real face normal: analytic
    // flip bookkeeping proved unreliable here (both slopes wound
    // up facing down), so measure and swap if needed.
    const va = [eaveA[0], height, eaveA[1]], vb = [eaveB[0], height, eaveB[1]], vc = [ridgeTo[0], apexY, ridgeTo[1]];
    const e1 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const e2 = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const face = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const agrees = (face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2]) > 0;
    if (agrees) keptIndices.push(a, b, c, a, c, d);
    else keptIndices.push(a, c, b, a, d, c);
  };
  const centroid = [
    (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
    (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
  ];
  addSlope(ra, rb, ridgeA, ridgeB);
  addSlope(rc, rd, ridgeB, ridgeA);
  // Gable end triangles.
  const addEnd = (eaveA, eaveB, ridgePoint, flip) => {
    const mid = [(eaveA[0] + eaveB[0]) / 2, (eaveA[1] + eaveB[1]) / 2];
    const along = [eaveB[0] - eaveA[0], 0, eaveB[1] - eaveA[1]];
    const up = [ridgePoint[0] - mid[0], apexY - height, ridgePoint[1] - mid[1]];
    let normal = [
      along[1] * up[2] - along[2] * up[1],
      along[2] * up[0] - along[0] * up[2],
      along[0] * up[1] - along[1] * up[0],
    ];
    const l = Math.hypot(...normal) || 1;
    normal = normal.map((v) => v / l);
    const out = [mid[0] - centroid[0], mid[1] - centroid[1]];
    const needFlip = (normal[0] * out[0] + normal[2] * out[1]) < 0;
    const a = push([eaveA[0], height, eaveA[1]], normal);
    const b = push([eaveB[0], height, eaveB[1]], normal);
    const c = push([ridgePoint[0], apexY, ridgePoint[1]], normal);
    if (needFlip !== flip) keptIndices.push(a, c, b);
    else keptIndices.push(a, b, c);
  };
  addEnd(rd, ra, ridgeA, false);
  addEnd(rb, rc, ridgeB, false);
  return {
    mesh: {
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      indices: Uint32Array.from(keptIndices),
    },
    height: apexY,
    footprintArea: Math.abs(signedArea(footprintCCW)),
  };
}

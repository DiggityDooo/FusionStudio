'use strict';
// Section planes / cutaways (A29 "Section planes, cutaways and
// elevation views"): clip a triangle mesh by a half-space, keeping
// the part on the plane's positive side. Clipped polygons are
// fan-triangulated; open boundaries are left open (documented).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function getVertex(positions, i) {
  return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
}
function getNormal(normals, i) {
  return normals ? [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]] : null;
}

/** Signed distance of a point to the plane (normal must be unit). */
export function planeDistance(point, planePoint, planeNormal) {
  return dot(sub(point, planePoint), planeNormal);
}

/**
 * Clip a mesh { positions, indices, normals? } by the half-space
 * dot(p - planePoint, planeNormal) >= 0. Returns a new mesh in the
 * same convention (normals interpolated across cut edges).
 */
export function clipMeshByPlane(mesh, planePoint, planeNormal) {
  const len = Math.hypot(...planeNormal);
  if (len < 1e-12) throw new Error('section: plane normal must be non-zero');
  const n = planeNormal.map((v) => v / len);
  const positions = mesh.positions;
  const indices = mesh.indices;
  const normals = mesh.normals || null;
  const distOf = (i) => planeDistance(getVertex(positions, i), planePoint, n);

  const outPositions = [];
  const outNormals = normals ? [] : null;
  const outIndices = [];
  const emit = (vertex, normal) => {
    outPositions.push(vertex[0], vertex[1], vertex[2]);
    if (outNormals) outNormals.push(normal ? normal[0] : 0, normal ? normal[1] : 0, normal ? normal[2] : 0);
    return outPositions.length / 3 - 1;
  };

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const dists = tri.map(distOf);
    // Sutherland-Hodgman against the half-space, per triangle.
    const poly = []; // entries: { vertex, normal }
    for (let e = 0; e < 3; e++) {
      const curr = tri[e];
      const next = tri[(e + 1) % 3];
      const dCurr = dists[e];
      const dNext = dists[(e + 1) % 3];
      const currIn = dCurr >= 0;
      const nextIn = dNext >= 0;
      if (currIn) poly.push({ vertex: getVertex(positions, curr), normal: getNormal(normals, curr) });
      if (currIn !== nextIn) {
        const tHit = dCurr / (dCurr - dNext);
        const vc = getVertex(positions, curr), vn = getVertex(positions, next);
        const vertex = vc.map((v, i) => v + (vn[i] - v) * tHit);
        let normal = null;
        if (normals) {
          const nc = getNormal(normals, curr), nn = getNormal(normals, next);
          const raw = nc.map((v, i) => v + (nn[i] - v) * tHit);
          const l = Math.hypot(...raw) || 1;
          normal = raw.map((v) => v / l);
        }
        poly.push({ vertex, normal });
      }
    }
    if (poly.length < 3) continue;
    const base = emit(poly[0].vertex, poly[0].normal);
    for (let k = 1; k + 1 < poly.length; k++) {
      const i1 = emit(poly[k].vertex, poly[k].normal);
      const i2 = emit(poly[k + 1].vertex, poly[k + 1].normal);
      outIndices.push(base, i1, i2);
    }
  }
  return {
    positions: Float32Array.from(outPositions),
    normals: outNormals ? Float32Array.from(outNormals) : null,
    indices: Uint32Array.from(outIndices),
  };
}

/** Cross-section segments: where the plane cuts triangle edges. */
export function crossSectionSegments(mesh, planePoint, planeNormal) {
  const len = Math.hypot(...planeNormal);
  if (len < 1e-12) throw new Error('section: plane normal must be non-zero');
  const n = planeNormal.map((v) => v / len);
  const positions = mesh.positions;
  const indices = mesh.indices;
  const segments = [];
  const seen = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const cuts = [];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = edgeKey(a, b);
      const da = planeDistance(getVertex(positions, a), planePoint, n);
      const db = planeDistance(getVertex(positions, b), planePoint, n);
      if ((da >= 0 && db < 0) || (da < 0 && db >= 0)) {
        const tHit = da / (da - db);
        const va = getVertex(positions, a), vb = getVertex(positions, b);
        const point = va.map((v, i) => v + (vb[i] - v) * tHit);
        cuts.push({ key, point });
      }
    }
    // Each triangle contributes at most one segment (between its two
    // cut edges); dedupe identical segments from neighbor triangles.
    if (cuts.length === 2) {
      const segKey = [cuts[0].key, cuts[1].key].sort().join('|');
      if (!seen.has(segKey)) {
        seen.add(segKey);
        segments.push([cuts[0].point, cuts[1].point]);
      }
    }
  }
  return segments;
}

/**
 * Stitch unordered section segments into polylines by matching
 * quantized endpoints. Returns [{ points, closed }].
 */
export function stitchContours(segments, { tolerance = 1e-6, mergeCollinear = true } = {}) {
  const keyOf = (p) => p.map((v) => Math.round(v / tolerance)).join(',');
  const byEndpoint = new Map();
  const segs = segments.map(([a, b], i) => ({ a, b, id: i, used: false }));
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      const key = keyOf(p);
      if (!byEndpoint.has(key)) byEndpoint.set(key, []);
      byEndpoint.get(key).push(s);
    }
  }
  const contours = [];
  const takeNeighbor = (point, excludeId) => {
    const candidates = byEndpoint.get(keyOf(point)) || [];
    return candidates.find((s) => !s.used && s.id !== excludeId) || null;
  };
  for (const start of segs) {
    if (start.used) continue;
    start.used = true;
    const chain = [start.a, start.b];
    // Grow at the tail, then at the head.
    for (const atTail of [true, false]) {
      for (;;) {
        const end = atTail ? chain[chain.length - 1] : chain[0];
        const next = takeNeighbor(end, -1);
        if (!next) break;
        next.used = true;
        const nextFar = keyOf(next.a) === keyOf(end) ? next.b : next.a;
        if (atTail) chain.push(nextFar); else chain.unshift(nextFar);
      }
    }
    const closed = chain.length > 2 && keyOf(chain[0]) === keyOf(chain[chain.length - 1]);
    if (closed) chain.pop();
    // Merge collinear runs: triangulated faces put redundant
    // midpoints along straight section edges. clipAndCap disables
    // this so cap edges align 1:1 with the clipped wall edges
    // (merged caps would leave T-junctions along the cut).
    const merged = !mergeCollinear ? chain : chain.filter((p, i) => {
      if (chain.length < 3) return true;
      const prev = chain[(i - 1 + chain.length) % chain.length];
      const next = chain[(i + 1) % chain.length];
      if (!closed && (i === 0 || i === chain.length - 1)) return true;
      const e1 = sub(p, prev), e2 = sub(next, p);
      const crossMag = Math.hypot(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      );
      const scale = Math.hypot(...e1) * Math.hypot(...e2);
      return !(scale > 0 && crossMag / scale < 1e-9 && dot(e1, e2) > 0);
    });
    contours.push({ points: merged.length >= 2 ? merged : chain, closed });
  }
  return contours;
}

/**
 * Area enclosed by closed section contours on the plane: project
 * onto the plane's 2D basis and sum shoelace areas. Open contours
 * contribute 0.
 */
export function crossSectionArea(mesh, planePoint, planeNormal) {
  const segments = crossSectionSegments(mesh, planePoint, planeNormal);
  const contours = stitchContours(segments);
  const len = Math.hypot(...planeNormal);
  const n = planeNormal.map((v) => v / len);
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = (() => {
    const c = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
    const l = Math.hypot(...c);
    return c.map((v) => v / l);
  })();
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  let area = 0;
  for (const contour of contours) {
    if (!contour.closed) continue;
    const pts2 = contour.points.map((p) => {
      const d = sub(p, planePoint);
      return [dot(d, u), dot(d, v)];
    });
    let sum = 0;
    for (let i = 0; i < pts2.length; i++) {
      const [x1, y1] = pts2[i];
      const [x2, y2] = pts2[(i + 1) % pts2.length];
      sum += x1 * y2 - x2 * y1;
    }
    area += Math.abs(sum) / 2;
  }
  return area;
}

function planeBasis(planeNormal) {
  const len = Math.hypot(...planeNormal);
  if (len < 1e-12) throw new Error('section: plane normal must be non-zero');
  const n = planeNormal.map((v) => v / len);
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const c = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
  const l = Math.hypot(...c);
  const u = c.map((v) => v / l);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { n, u, v }; // u x v = n
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointInPolygon2D(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Triangulate one simple (possibly non-convex) section contour by
 * ear clipping in the plane's 2D basis. `points` are 3D points on
 * the plane in contour order (either winding). Returns index
 * triples wound so the cap faces -planeNormal (the side opposite
 * the kept half-space), matching clipAndCap's outward convention.
 */
export function triangulateContour(points, planeNormal) {
  if (points.length < 3) return [];
  const { n, u, v } = planeBasis(planeNormal);
  const pts2 = points.map((p) => [dot(p, u), dot(p, v)]);
  let signed = 0;
  for (let i = 0; i < pts2.length; i++) {
    const [x1, y1] = pts2[i];
    const [x2, y2] = pts2[(i + 1) % pts2.length];
    signed += x1 * y2 - x2 * y1;
  }
  // Work CCW in 2D (normal +n); emit flipped so the cap faces -n.
  const order = pts2.map((_, i) => i);
  if (signed < 0) order.reverse();
  const work = order.slice();
  const tris = [];
  const isEar = (ia, ib, ic) => {
    const a = pts2[ia], b = pts2[ib], c = pts2[ic];
    if (cross2(a, b, c) <= 1e-15) return false; // reflex or degenerate
    for (const i of work) {
      if (i === ia || i === ib || i === ic) continue;
      const p = pts2[i];
      const d1 = cross2(a, b, p), d2 = cross2(b, c, p), d3 = cross2(c, a, p);
      if (d1 > 1e-15 && d2 > 1e-15 && d3 > 1e-15) return false;
    }
    return true;
  };
  let guard = work.length * work.length + 10;
  while (work.length > 3) {
    if (guard-- <= 0) throw new Error('section: contour triangulation failed (self-intersecting contour?)');
    let clipped = false;
    for (let i = 0; i < work.length; i++) {
      const ia = work[(i - 1 + work.length) % work.length];
      const ib = work[i];
      const ic = work[(i + 1) % work.length];
      if (isEar(ia, ib, ic)) {
        tris.push([ia, ic, ib]); // flipped: faces -n
        work.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) throw new Error('section: contour triangulation failed (self-intersecting contour?)');
  }
  tris.push([work[0], work[2], work[1]]);
  return tris;
}

/**
 * Clip a mesh by a plane and close the cut with triangulated caps,
 * producing a watertight solid for section views / cutaways.
 * Multiple disjoint closed contours are capped independently;
 * nested contours (holes, e.g. a hollow tube) are rejected.
 * If the plane produces no closed contour the clipped mesh is
 * returned unchanged.
 */
export function clipAndCap(mesh, planePoint, planeNormal) {
  const clipped = clipMeshByPlane(mesh, planePoint, planeNormal);
  const segments = crossSectionSegments(mesh, planePoint, planeNormal);
  const contours = stitchContours(segments, { mergeCollinear: false }).filter((c) => c.closed);
  if (contours.length === 0) return clipped;
  const { n, u, v } = planeBasis(planeNormal);
  const polys2 = contours.map((c) => c.points.map((p) => {
    const d = sub(p, planePoint);
    return [dot(d, u), dot(d, v)];
  }));
  for (let i = 0; i < contours.length; i++) {
    for (let j = 0; j < contours.length; j++) {
      if (i !== j && pointInPolygon2D(polys2[i][0], polys2[j])) {
        throw new Error('section: nested section contours (holes) are not supported');
      }
    }
  }
  const positions = Array.from(clipped.positions);
  const normals = clipped.normals ? Array.from(clipped.normals) : null;
  const indices = Array.from(clipped.indices);
  const capNormal = n.map((x) => -x);
  for (const contour of contours) {
    const base = positions.length / 3;
    for (const p of contour.points) {
      positions.push(p[0], p[1], p[2]);
      if (normals) normals.push(capNormal[0], capNormal[1], capNormal[2]);
    }
    for (const [a, b, c] of triangulateContour(contour.points, planeNormal)) {
      indices.push(base + a, base + b, base + c);
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: normals ? Float32Array.from(normals) : null,
    indices: Uint32Array.from(indices),
  };
}

/** Mesh volume via the divergence theorem (signed). */
export function meshVolume(mesh) {
  const positions = mesh.positions;
  const indices = mesh.indices;
  let sum = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = getVertex(positions, indices[t]);
    const b = getVertex(positions, indices[t + 1]);
    const c = getVertex(positions, indices[t + 2]);
    sum += (a[0] * (b[1] * c[2] - b[2] * c[1])
      - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return sum;
}

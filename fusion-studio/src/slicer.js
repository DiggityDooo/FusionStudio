// FDM print preparation kernel (A24 print/CAM baseline).
// Slices indexed triangle meshes ({ positions, indices }, Z-up build plate)
// into ordered contour loops, analyses overhangs, estimates material/time,
// and emits perimeter-only G-code. No infill/support generation yet — the
// estimates say so where they apply.

import { meshBounds, meshVolume } from './feature-tree.js';

const EPS = 1e-9;

function triangleAt(mesh, i) {
  const p = mesh.positions, idx = mesh.indices;
  const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
  return [
    [p[a], p[a + 1], p[a + 2]],
    [p[b], p[b + 1], p[b + 2]],
    [p[c], p[c + 1], p[c + 2]],
  ];
}

function segmentAtZ(tri, z) {
  const pts = [];
  for (let e = 0; e < 3; e++) {
    const A = tri[e], B = tri[(e + 1) % 3];
    const da = A[2] - z, db = B[2] - z;
    if (Math.abs(da) < EPS && Math.abs(db) < EPS) continue; // in-plane edge
    if (da * db < 0 || (Math.abs(da) < EPS) !== (Math.abs(db) < EPS)) {
      const t = da / (da - db);
      pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  // Deduplicate near-identical crossings.
  const out = [];
  for (const p of pts) if (!out.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9)) out.push(p);
  return out.length === 2 ? out : null;
}

const keyOf = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

// Stitch raw segments into closed loops (ordered point arrays, not repeated).
export function stitchSegments(segments) {
  const byPoint = new Map();
  segments.forEach((seg, i) => {
    for (const p of seg) {
      const k = keyOf(p);
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(i);
    }
  });
  const used = new Array(segments.length).fill(false);
  const loops = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segments[i][0], segments[i][1]];
    let guard = 0;
    while (guard++ < segments.length + 2) {
      const tail = loop[loop.length - 1];
      if (loop.length > 2 && keyOf(tail) === keyOf(loop[0])) { loop.pop(); break; }
      const candidates = byPoint.get(keyOf(tail)) || [];
      const next = candidates.find((s) => !used[s]);
      if (next === undefined) break; // open chain
      used[next] = true;
      const seg = segments[next];
      loop.push(keyOf(seg[0]) === keyOf(tail) ? seg[1] : seg[0]);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function polygonArea(loop) {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function sliceMeshAtZ(mesh, z) {
  const segments = [];
  const seen = new Set();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const seg = segmentAtZ(triangleAt(mesh, i), z);
    if (!seg) continue;
    // Triangles sharing an edge on the slice plane emit the same segment.
    const id = [keyOf(seg[0]), keyOf(seg[1])].sort().join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    segments.push(seg);
  }
  const loops = stitchSegments(segments).map((loop) => {
    const area = polygonArea(loop);
    return { points: loop, area, perimeter: loop.reduce((s, p, j) => {
      const q = loop[(j + 1) % loop.length];
      return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
    }, 0), hole: area < 0 };
  });
  return { z, loops, area: loops.reduce((s, l) => s + l.area, 0), perimeter: loops.reduce((s, l) => s + l.perimeter, 0) };
}

export function sliceMesh(mesh, { layerHeight = 0.2, firstLayerHeight = null } = {}) {
  if (!(layerHeight > 0)) throw new Error('Layer height must be positive.');
  const { min, max } = meshBounds(mesh);
  const layers = [];
  let z = min[2] + (firstLayerHeight ?? layerHeight) / 2;
  while (z < max[2]) {
    const layer = sliceMeshAtZ(mesh, z);
    if (layer.loops.length) layers.push(layer);
    z += layerHeight;
  }
  return { layers, layerHeight, bounds: { min, max }, volume: meshVolume(mesh) };
}

// Downward-facing area steeper than the self-supporting angle. Faces resting
// on the build plate (within `plateClearance` of the lowest point) are
// supported by the plate itself and excluded.
export function overhangAnalysis(mesh, { maxOverhangDeg = 45, plateClearance = 0.24 } = {}) {
  const limit = -Math.cos((90 - maxOverhangDeg) * Math.PI / 180); // normal.z threshold
  const { min } = meshBounds(mesh);
  let overhangArea = 0, totalArea = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [A, B, C] = triangleAt(mesh, i);
    if ((A[2] + B[2] + C[2]) / 3 <= min[2] + plateClearance) continue;
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(...n);
    if (len < EPS) continue;
    const area = 0.5 * len;
    totalArea += area;
    if (n[2] / len < limit) overhangArea += area;
  }
  return { overhangArea, totalArea, overhangFraction: totalArea ? overhangArea / totalArea : 0, maxOverhangDeg };
}

// Material/time estimate. Assumes solid perimeters + `infillDensity` of the
// sliced cross-sections (a volumetric approximation, not a toolpath).
export function estimatePrint(sliced, { filamentDiameter = 1.75, infillDensity = 0.2, perimeterCount = 3, lineWidth = 0.45, printSpeedMmS = 50, densityGPerCm3 = 1.24 } = {}) {
  let extrudedMm3 = 0, perimeterMm = 0;
  for (const layer of sliced.layers) {
    perimeterMm += layer.perimeter * perimeterCount;
    const shellMm3 = layer.perimeter * perimeterCount * lineWidth * sliced.layerHeight;
    const coreMm3 = Math.max(0, Math.abs(layer.area) - layer.perimeter * perimeterCount * lineWidth) * sliced.layerHeight * infillDensity;
    extrudedMm3 += shellMm3 + coreMm3;
  }
  const filamentArea = Math.PI * (filamentDiameter / 2) ** 2;
  const filamentLengthMm = extrudedMm3 / filamentArea;
  const extrusionTimeS = perimeterMm / printSpeedMmS + filamentLengthMm / (printSpeedMmS * 0.4);
  return {
    layers: sliced.layers.length,
    extrudedMm3,
    filamentLengthMm,
    filamentLengthM: filamentLengthMm / 1000,
    weightG: extrudedMm3 / 1000 * densityGPerCm3,
    estimatedSeconds: Math.round(extrusionTimeS),
  };
}

// --- infill patterns ---------------------------------------------------------

// Clip scan lines (direction `angleDeg`, `spacing` apart) to the layer loops
// using even-odd fill across all loops. Returns segments [{ from, to }].
export function generateInfill(layer, { pattern = 'lines', spacing = 2, angleDeg = 45 } = {}) {
  if (!(spacing > 0)) throw new Error('Infill spacing must be positive.');
  if (!layer.loops.length) return [];
  const all = layer.loops.flatMap((l) => l.points);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const angles = pattern === 'grid' ? [angleDeg, angleDeg + 90] : [angleDeg];
  const segments = [];
  for (const ang of angles) {
    const rad = ang * Math.PI / 180;
    const dir = [Math.cos(rad), Math.sin(rad)], nrm = [-dir[1], dir[0]];
    const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
    const proj = corners.map((p) => p[0] * nrm[0] + p[1] * nrm[1]);
    const lo = Math.min(...proj), hi = Math.max(...proj);
    for (let d = lo + spacing / 2; d < hi; d += spacing) {
      const crossings = [];
      for (const loop of layer.loops) {
        const pts = loop.points;
        for (let i = 0; i < pts.length; i++) {
          const A = pts[i], B = pts[(i + 1) % pts.length];
          const da = A[0] * nrm[0] + A[1] * nrm[1] - d, db = B[0] * nrm[0] + B[1] * nrm[1] - d;
          // Half-open sign rule: vertices exactly on the scan line count once.
          if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            const px = A[0] + (B[0] - A[0]) * t, py = A[1] + (B[1] - A[1]) * t;
            crossings.push(px * dir[0] + py * dir[1]);
          }
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const mid = [(d * nrm[0]), (d * nrm[1])];
        segments.push({
          from: [mid[0] + crossings[i] * dir[0], mid[1] + crossings[i] * dir[1]],
          to: [mid[0] + crossings[i + 1] * dir[0], mid[1] + crossings[i + 1] * dir[1]],
        });
      }
    }
  }
  return segments;
}

export function infillLength(segments) {
  return segments.reduce((s, seg) => s + Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]), 0);
}

// Gyroid (TPMS) infill: iso-lines of the gyroid field at the layer height,
// extracted with marching squares over the layer bounds and clipped to the
// loops by midpoint containment.
export function gyroidInfill(layer, { period = 6, cell = 0.75 } = {}) {
  if (!(period > 0) || !(cell > 0)) throw new Error('Period and cell must be positive.');
  if (!layer.loops.length) return [];
  const z = layer.z || 0;
  const a = 2 * Math.PI / period;
  const field = (x, y) => Math.sin(a * x) * Math.cos(a * y) + Math.sin(a * y) * Math.cos(a * z) + Math.sin(a * z) * Math.cos(a * x);
  const all = layer.loops.flatMap((l) => l.points);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const inside = (x, y) => {
    let hit = false;
    for (const loop of layer.loops) {
      const pts = loop.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) hit = !hit;
      }
    }
    return hit;
  };
  const segments = [];
  const nx = Math.max(1, Math.round((maxX - minX) / cell)), ny = Math.max(1, Math.round((maxY - minY) / cell));
  const val = (i, j) => field(minX + i * cell, minY + j * cell);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x0 = minX + i * cell, y0 = minY + j * cell;
    const corners = [[x0, y0, val(i, j)], [x0 + cell, y0, val(i + 1, j)], [x0 + cell, y0 + cell, val(i + 1, j + 1)], [x0, y0 + cell, val(i, j + 1)]];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const A = corners[e], B = corners[(e + 1) % 4];
      if ((A[2] >= 0) !== (B[2] >= 0)) {
        const t = A[2] / (A[2] - B[2]);
        pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
      }
    }
    if (pts.length === 2) segments.push({ from: pts[0], to: pts[1] });
    else if (pts.length === 4) { segments.push({ from: pts[0], to: pts[1] }, { from: pts[2], to: pts[3] }); }
  }
  return segments.filter((s) => inside((s.from[0] + s.to[0]) / 2, (s.from[1] + s.to[1]) / 2));
}

// --- mesh integrity (print-readiness) ---------------------------------------

export function meshManifoldReport(mesh) {
  const edgeUse = new Map();
  let degenerate = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    if (new Set(tri).size < 3) { degenerate++; continue; }
    for (let e = 0; e < 3; e++) {
      const key = [tri[e], tri[(e + 1) % 3]].sort((x, y) => x - y).join('_');
      edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }
  return {
    triangles: mesh.indices.length / 3,
    boundaryEdges, nonManifoldEdges, degenerateTriangles: degenerate,
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0 && degenerate === 0,
  };
}

// Merge vertices within `epsilon` (0 = exact) and rebuild the index buffer.
export function weldVertices(mesh, epsilon = 0) {
  const scale = epsilon > 0 ? 1 / epsilon : 1;
  const remap = new Map(), positions = [];
  const remapIndex = new Uint32Array(mesh.positions.length / 3);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
    const key = epsilon > 0
      ? `${Math.round(x * scale)},${Math.round(y * scale)},${Math.round(z * scale)}`
      : `${x},${y},${z}`;
    if (!remap.has(key)) { remap.set(key, positions.length / 3); positions.push(x, y, z); }
    remapIndex[i / 3] = remap.get(key);
  }
  const indices = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [remapIndex[mesh.indices[i]], remapIndex[mesh.indices[i + 1]], remapIndex[mesh.indices[i + 2]]];
    if (new Set(tri).size === 3) indices.push(...tri);
  }
  return {
    mesh: { positions: new Float32Array(positions), indices: new Uint32Array(indices) },
    mergedVertices: mesh.positions.length / 3 - positions.length / 3,
  };
}

function vertexNormals(mesh) {
  const normals = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [A, B, C] = [0, 1, 2].map((k) => {
      const o = mesh.indices[i + k] * 3;
      return [mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]];
    });
    const ab = B.map((v, j) => v - A[j]), ac = C.map((v, j) => v - A[j]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (let k = 0; k < 3; k++) {
      const o = mesh.indices[i + k] * 3;
      normals[o] += n[0]; normals[o + 1] += n[1]; normals[o + 2] += n[2];
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

function rayHit(mesh, origin, dir) {
  let best = Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [A, B, C] = [0, 1, 2].map((k) => {
      const o = mesh.indices[i + k] * 3;
      return [mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]];
    });
    const e1 = B.map((v, j) => v - A[j]), e2 = C.map((v, j) => v - A[j]);
    const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tv = origin.map((v, j) => v - A[j]);
    const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) * inv;
    if (u < 0 || u > 1) continue;
    const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    if (t > 1e-6 && t < best) best = t;
  }
  return best;
}

// Wall thickness: cast inward rays from surface vertices and measure the
// distance to the opposite wall.
export function wallThickness(mesh, { maxSamples = 512 } = {}) {
  const normals = vertexNormals(mesh);
  const count = mesh.positions.length / 3;
  const stride = Math.max(1, Math.floor(count / maxSamples));
  const samples = [];
  for (let i = 0; i < count; i += stride) {
    const o = i * 3;
    const origin = [mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]];
    const dir = [-normals[o], -normals[o + 1], -normals[o + 2]];
    const t = rayHit(mesh, origin, dir);
    if (Number.isFinite(t)) samples.push(t);
  }
  if (!samples.length) return { samples: 0, min: 0, mean: 0, max: 0 };
  return {
    samples: samples.length,
    min: Math.min(...samples),
    mean: samples.reduce((s, v) => s + v, 0) / samples.length,
    max: Math.max(...samples),
  };
}

const f3 = (n) => Math.round(n * 1000) / 1000;

// Perimeter-only G-code (no infill, no supports). Layer comments included so
// downstream tools can split/inspect.
export function exportGCode(sliced, { nozzleTemp = 200, bedTemp = 60, filamentDiameter = 1.75, lineWidth = 0.45, feedMmMin = 2400 } = {}) {
  const lines = [
    '; Fusion Studio perimeter-only G-code',
    `M104 S${nozzleTemp}`, `M140 S${bedTemp}`, 'G28', 'G90', 'M82', 'G92 E0',
  ];
  const filamentArea = Math.PI * (filamentDiameter / 2) ** 2;
  let e = 0;
  sliced.layers.forEach((layer, li) => {
    lines.push(`;LAYER ${li} z=${f3(layer.z)}`);
    lines.push(`G1 Z${f3(layer.z + sliced.layerHeight / 2)} F1200`);
    for (const loop of layer.loops) {
      lines.push(`G1 X${f3(loop.points[0][0])} Y${f3(loop.points[0][1])} F${feedMmMin}`);
      for (let i = 1; i <= loop.points.length; i++) {
        const prev = loop.points[i - 1], next = loop.points[i % loop.points.length];
        e += Math.hypot(next[0] - prev[0], next[1] - prev[1]) * lineWidth * sliced.layerHeight / filamentArea;
        lines.push(`G1 X${f3(next[0])} Y${f3(next[1])} E${f3(e)}`);
      }
    }
  });
  lines.push('M104 S0', 'M140 S0', 'M84');
  return lines.join('\n') + '\n';
}

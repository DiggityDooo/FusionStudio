// Point-cloud processing kernel (A25 scanning baseline).
// Points are [x, y, z] arrays. Covers import-shaped data prep: normals,
// cleaning, downsampling, plane segmentation, registration (ICP) and
// heightfield meshing. No photogrammetry or splat rendering here.

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

export function validateCloud(points) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('Point cloud is empty.');
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 3 || p.some((v) => !Number.isFinite(v))) throw new Error('Points must be finite [x, y, z] arrays.');
  }
  return points;
}

export function cloudBounds(points) {
  validateCloud(points);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
  return { min, max, size: max.map((v, a) => v - min[a]) };
}

export function nearestNeighbours(points, index, k) {
  const p = points[index];
  return points
    .map((q, i) => ({ i, d: dist2(p, q) }))
    .filter((e) => e.i !== index)
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((e) => e.i);
}

export function voxelDownsample(points, voxelSize) {
  validateCloud(points);
  if (!(voxelSize > 0)) throw new Error('Voxel size must be positive.');
  const cells = new Map();
  for (const p of points) {
    const key = `${Math.floor(p[0] / voxelSize)},${Math.floor(p[1] / voxelSize)},${Math.floor(p[2] / voxelSize)}`;
    if (!cells.has(key)) cells.set(key, { sum: [0, 0, 0], count: 0 });
    const cell = cells.get(key);
    cell.sum = cell.sum.map((v, a) => v + p[a]);
    cell.count++;
  }
  return [...cells.values()].map((c) => c.sum.map((v) => v / c.count));
}

// Remove points whose mean kNN distance is beyond mean + stdRatio * std.
export function statisticalOutlierRemoval(points, { k = 8, stdRatio = 1.0 } = {}) {
  validateCloud(points);
  const kk = Math.min(k, points.length - 1);
  const means = points.map((_, i) => {
    const nb = nearestNeighbours(points, i, kk);
    return nb.reduce((s, j) => s + Math.sqrt(dist2(points[i], points[j])), 0) / kk;
  });
  const mean = means.reduce((s, v) => s + v, 0) / means.length;
  const std = Math.sqrt(means.reduce((s, v) => s + (v - mean) ** 2, 0) / means.length);
  const limit = mean + stdRatio * std;
  const kept = [], removed = [];
  points.forEach((p, i) => (means[i] <= limit ? kept : removed).push(p));
  return { points: kept, removed, threshold: limit };
}

// Smallest eigenvector of a symmetric 3x3 matrix (cyclic Jacobi sweeps).
function smallestEigenvector(m) {
  const a = m.map((row) => row.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.hypot(a[0][1], a[0][2], a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(theta), s = Math.sin(theta);
      for (let k = 0; k < 3; k++) {
        const akp = c * a[k][p] - s * a[k][q], akq = s * a[k][p] + c * a[k][q];
        a[k][p] = akp; a[k][q] = akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = c * a[p][k] - s * a[q][k], aqk = s * a[p][k] + c * a[q][k];
        a[p][k] = apk; a[q][k] = aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = c * v[k][p] - s * v[k][q], vkq = s * v[k][p] + c * v[k][q];
        v[k][p] = vkp; v[k][q] = vkq;
      }
    }
  }
  let minIdx = 0;
  for (let i = 1; i < 3; i++) if (a[i][i] < a[minIdx][minIdx]) minIdx = i;
  return [v[0][minIdx], v[1][minIdx], v[2][minIdx]];
}

// PCA normals oriented toward `viewpoint` (default: cloud centroid +Z side).
export function estimateNormals(points, { k = 10, viewpoint = null } = {}) {
  validateCloud(points);
  const kk = Math.min(k, points.length - 1);
  const centroid = points.reduce((s, p) => s.map((v, a) => v + p[a] / points.length), [0, 0, 0]);
  const vp = viewpoint || [centroid[0], centroid[1], centroid[2] + 1];
  return points.map((p, i) => {
    const nb = nearestNeighbours(points, i, kk).map((j) => points[j]);
    const c = nb.reduce((s, q) => s.map((v, a) => v + q[a] / nb.length), [0, 0, 0]);
    const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const q of nb) {
      const d = q.map((v, a) => v - c[a]);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += d[a] * d[b];
    }
    let n = smallestEigenvector(cov);
    const toView = vp.map((v, a) => v - p[a]);
    if (n[0] * toView[0] + n[1] * toView[1] + n[2] * toView[2] < 0) n = n.map((v) => -v);
    const len = Math.hypot(...n) || 1;
    return n.map((v) => v / len);
  });
}

// RANSAC dominant plane: { normal, d (n.x + d = 0), inliers: [indices] }.
export function ransacPlane(points, { iterations = 200, threshold = 0.01, seed = 1 } = {}) {
  validateCloud(points);
  if (points.length < 3) throw new Error('Need at least three points for a plane.');
  let s = (seed >>> 0) || 1;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let best = null;
  for (let it = 0; it < iterations; it++) {
    const pick = new Set();
    while (pick.size < 3) pick.add(Math.floor(rand() * points.length));
    const [A, B, C] = [...pick].map((i) => points[i]);
    const ab = B.map((v, j) => v - A[j]), ac = C.map((v, j) => v - A[j]);
    let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(...n);
    if (len < 1e-12) continue;
    n = n.map((v) => v / len);
    const d = -(n[0] * A[0] + n[1] * A[1] + n[2] * A[2]);
    const inliers = [];
    points.forEach((p, i) => { if (Math.abs(n[0] * p[0] + n[1] * p[1] + n[2] * p[2] + d) <= threshold) inliers.push(i); });
    if (!best || inliers.length > best.inliers.length) best = { normal: n, d, inliers };
  }
  return best;
}

// Horn's quaternion absolute orientation (largest eigenvector by power
// iteration on the 4x4 profile matrix).
function absoluteOrientation(source, target) {
  const cs = source.reduce((s, p) => s.map((v, a) => v + p[a] / source.length), [0, 0, 0]);
  const ct = target.reduce((s, p) => s.map((v, a) => v + p[a] / target.length), [0, 0, 0]);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < source.length; i++) {
    const a = source[i].map((v, j) => v - cs[j]), b = target[i].map((v, j) => v - ct[j]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c];
  }
  const trace = S[0][0] + S[1][1] + S[2][2];
  const N = [
    [trace, S[1][2] - S[2][1], S[2][0] - S[0][2], S[0][1] - S[1][0]],
    [S[1][2] - S[2][1], S[0][0] - S[1][1] - S[2][2], S[0][1] + S[1][0], S[2][0] + S[0][2]],
    [S[2][0] - S[0][2], S[0][1] + S[1][0], -S[0][0] + S[1][1] - S[2][2], S[1][2] + S[2][1]],
    [S[0][1] - S[1][0], S[2][0] + S[0][2], S[1][2] + S[2][1], -S[0][0] - S[1][1] + S[2][2]],
  ];
  let q = [1, 0.3, 0.2, 0.1];
  for (let it = 0; it < 200; it++) {
    const next = N.map((row) => row.reduce((s, v, j) => s + v * q[j], 0));
    const len = Math.hypot(...next) || 1;
    q = next.map((v) => v / len);
  }
  const [w, x, y, z] = q;
  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const t = ct.map((v, a) => v - (R[a][0] * cs[0] + R[a][1] * cs[1] + R[a][2] * cs[2]));
  return { rotation: R, translation: t };
}

export function applyRigid(points, { rotation, translation }) {
  return points.map((p) => [
    rotation[0][0] * p[0] + rotation[0][1] * p[1] + rotation[0][2] * p[2] + translation[0],
    rotation[1][0] * p[0] + rotation[1][1] * p[1] + rotation[1][2] * p[2] + translation[1],
    rotation[2][0] * p[0] + rotation[2][1] * p[1] + rotation[2][2] * p[2] + translation[2],
  ]);
}

// Point-to-point ICP registration of `source` onto `target`.
export function icpAlign(source, target, { iterations = 50, tolerance = 1e-9 } = {}) {
  validateCloud(source); validateCloud(target);
  let current = source.map((p) => p.slice());
  let total = { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0] };
  let prevRms = Infinity, rms = Infinity;
  for (let it = 0; it < iterations; it++) {
    const matched = current.map((p) => {
      let best = 0, bd = Infinity;
      target.forEach((q, j) => { const d = dist2(p, q); if (d < bd) { bd = d; best = j; } });
      return target[best];
    });
    const step = absoluteOrientation(current, matched);
    current = applyRigid(current, step);
    // Accumulate total transform: total = step ∘ total.
    total = {
      rotation: step.rotation.map((row, a) => row.map((_, b) => step.rotation[a][0] * total.rotation[0][b] + step.rotation[a][1] * total.rotation[1][b] + step.rotation[a][2] * total.rotation[2][b])),
      translation: step.translation.map((v, a) => v + step.rotation[a][0] * total.translation[0] + step.rotation[a][1] * total.translation[1] + step.rotation[a][2] * total.translation[2]),
    };
    rms = Math.sqrt(current.reduce((s, p, i) => s + dist2(p, matched[i]), 0) / current.length);
    if (Math.abs(prevRms - rms) < tolerance) { prevRms = rms; break; }
    prevRms = rms;
  }
  return { points: current, rotation: total.rotation, translation: total.translation, rms, iterations };
}

// --- PLY / XYZ import & export ------------------------------------------------

export function parsePly(text) {
  if (typeof text !== 'string' || !text.startsWith('ply')) throw new Error('Not a PLY document.');
  const headerEnd = text.indexOf('end_header');
  if (headerEnd < 0) throw new Error('PLY header not terminated.');
  const header = text.slice(0, headerEnd);
  if (/format binary/.test(header)) throw new Error('Binary PLY not supported by this parser; use ASCII PLY.');
  const vertexMatch = header.match(/element vertex (\d+)/);
  if (!vertexMatch) throw new Error('PLY has no vertex element.');
  const props = [...header.matchAll(/property float (\w+)/g)].map((m) => m[1]);
  const xi = props.indexOf('x'), yi = props.indexOf('y'), zi = props.indexOf('z');
  if (xi < 0 || yi < 0 || zi < 0) throw new Error('PLY vertices need x/y/z float properties.');
  const body = text.slice(headerEnd + 'end_header'.length).trim().split(/\r?\n/);
  const points = [];
  for (let i = 0; i < Number(vertexMatch[1]); i++) {
    const parts = body[i].trim().split(/\s+/).map(Number);
    points.push([parts[xi], parts[yi], parts[zi]]);
  }
  return validateCloud(points);
}

export function exportPly(points) {
  validateCloud(points);
  const lines = ['ply', 'format ascii 1.0', `element vertex ${points.length}`, 'property float x', 'property float y', 'property float z', 'end_header'];
  for (const p of points) lines.push(`${p[0]} ${p[1]} ${p[2]}`);
  return lines.join('\n') + '\n';
}

export function parseXyz(text) {
  const points = [];
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) points.push(parts.slice(0, 3));
  }
  return validateCloud(points);
}

// Grid heightfield meshing (2.5D reconstruction): one vertex per occupied
// cell (mean point), quads split where all four corners exist.
export function heightfieldMesh(points, { cellSize = 0.5 } = {}) {
  validateCloud(points);
  if (!(cellSize > 0)) throw new Error('Cell size must be positive.');
  const { min } = cloudBounds(points);
  const cells = new Map();
  for (const p of points) {
    const key = `${Math.floor((p[0] - min[0]) / cellSize)},${Math.floor((p[1] - min[1]) / cellSize)}`;
    if (!cells.has(key)) cells.set(key, { sum: [0, 0, 0], count: 0 });
    const cell = cells.get(key);
    cell.sum = cell.sum.map((v, a) => v + p[a]);
    cell.count++;
  }
  const index = new Map(), positions = [];
  const vertexAt = (gx, gy) => {
    const key = `${gx},${gy}`;
    if (index.has(key)) return index.get(key);
    const cell = cells.get(key);
    if (!cell) return -1;
    index.set(key, positions.length / 3);
    positions.push(...cell.sum.map((v) => v / cell.count));
    return index.get(key);
  };
  const indices = [];
  let holes = 0;
  for (const key of cells.keys()) {
    const [gx, gy] = key.split(',').map(Number);
    const a = vertexAt(gx, gy), b = vertexAt(gx + 1, gy), c = vertexAt(gx, gy + 1), d = vertexAt(gx + 1, gy + 1);
    if (a < 0 || b < 0 || c < 0 || d < 0) { holes++; continue; }
    indices.push(a, b, c, c, b, d);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), holes, cells: cells.size };
}

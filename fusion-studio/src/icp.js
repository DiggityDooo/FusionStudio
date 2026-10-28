'use strict';
// Scan alignment/registration (A25 "Alignment/registration of
// scans"): Kabsch rigid-transform estimation between corresponding
// point sets (Horn quaternion method) and point-to-point ICP for
// unregistered clouds. Points are flat Float32Array/number[] xyz
// triples.

function toPoints(flat) {
  const pts = [];
  for (let i = 0; i + 2 < flat.length; i += 3) pts.push([flat[i], flat[i + 1], flat[i + 2]]);
  return pts;
}
function centroid(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((v) => v / pts.length);
}

/** Largest-eigenvalue eigenvector of a symmetric 4x4 via Jacobi sweeps. */
function dominantEigenvector(mIn) {
  const a = mIn.map((row) => [...row]);
  const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 40; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 4; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 4; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
  return [v[0][best], v[1][best], v[2][best], v[3][best]]; // [w, x, y, z] ordering by construction below
}

export function quaternionToMatrix([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
export function applyTransform(rotation, translation, p) {
  return [
    rotation[0] * p[0] + rotation[1] * p[1] + rotation[2] * p[2] + translation[0],
    rotation[3] * p[0] + rotation[4] * p[1] + rotation[5] * p[2] + translation[1],
    rotation[6] * p[0] + rotation[7] * p[1] + rotation[8] * p[2] + translation[2],
  ];
}

/**
 * Kabsch: rotation (9, row-major) + translation minimizing
 * sum |R*a + t - b|^2 over corresponding point arrays.
 */
export function kabsch(flatA, flatB) {
  const A = toPoints(flatA), B = toPoints(flatB);
  if (A.length !== B.length || A.length < 3) throw new Error('icp: kabsch needs >= 3 corresponding pairs');
  const ca = centroid(A), cb = centroid(B);
  // Cross-covariance S = sum (a-ca)(b-cb)^T.
  const S = new Array(9).fill(0);
  for (let i = 0; i < A.length; i++) {
    const a = [A[i][0] - ca[0], A[i][1] - ca[1], A[i][2] - ca[2]];
    const b = [B[i][0] - cb[0], B[i][1] - cb[1], B[i][2] - cb[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += a[r] * b[c];
  }
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = S;
  // Horn's N matrix (quaternion [w,x,y,z]).
  const N = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const q = dominantEigenvector(N);
  const rotation = quaternionToMatrix(q);
  const rc = [
    rotation[0] * ca[0] + rotation[1] * ca[1] + rotation[2] * ca[2],
    rotation[3] * ca[0] + rotation[4] * ca[1] + rotation[5] * ca[2],
    rotation[6] * ca[0] + rotation[7] * ca[1] + rotation[8] * ca[2],
  ];
  return { rotation, translation: [cb[0] - rc[0], cb[1] - rc[1], cb[2] - rc[2]] };
}

function nearestIndex(p, targets) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const d = (targets[i][0] - p[0]) ** 2 + (targets[i][1] - p[1]) ** 2 + (targets[i][2] - p[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: Math.sqrt(bestD) };
}

/**
 * Point-to-point ICP aligning `source` onto `target` (flat xyz).
 * options: { maxIterations, tolerance, maxPairDistance }.
 * Returns { rotation, translation, rmse, iterations, pairs } where
 * the transform maps source -> target.
 */
export function icp(flatSource, flatTarget, { maxIterations = 60, tolerance = 1e-9, maxPairDistance = Infinity } = {}) {
  const source = toPoints(flatSource);
  const target = toPoints(flatTarget);
  if (source.length < 3 || target.length < 3) throw new Error('icp: needs >= 3 points per cloud');
  let rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let translation = [0, 0, 0];
  let prevRmse = Infinity, rmse = Infinity, pairs = 0;
  let iterations = 0;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations++;
    const moved = source.map((p) => applyTransform(rotation, translation, p));
    const srcPairs = [], dstPairs = [];
    for (const p of moved) {
      const near = nearestIndex(p, target);
      if (near.distance <= maxPairDistance) { srcPairs.push(p); dstPairs.push(target[near.index]); }
    }
    pairs = srcPairs.length;
    if (pairs < 3) throw new Error('icp: fewer than 3 pairs within maxPairDistance');
    // Delta transform between current positions and their matches.
    const flat = (pts) => pts.flatMap((p) => p);
    const delta = kabsch(flat(srcPairs), flat(dstPairs));
    // Compose: total = delta ∘ current.
    const newRotation = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) newRotation[r * 3 + c] += delta.rotation[r * 3 + k] * rotation[k * 3 + c];
    }
    translation = [
      delta.rotation[0] * translation[0] + delta.rotation[1] * translation[1] + delta.rotation[2] * translation[2] + delta.translation[0],
      delta.rotation[3] * translation[0] + delta.rotation[4] * translation[1] + delta.rotation[5] * translation[2] + delta.translation[1],
      delta.rotation[6] * translation[0] + delta.rotation[7] * translation[1] + delta.rotation[8] * translation[2] + delta.translation[2],
    ];
    rotation = newRotation;
    // RMSE over gated pairs only: rejected outliers are not part of
    // the objective and must not poison the reported error.
    const aligned = source.map((p) => applyTransform(rotation, translation, p));
    let sum = 0, counted = 0;
    for (const p of aligned) {
      const d = nearestIndex(p, target).distance;
      if (d <= maxPairDistance) { sum += d * d; counted++; }
    }
    rmse = counted ? Math.sqrt(sum / counted) : Infinity;
    if (Math.abs(prevRmse - rmse) < tolerance) break;
    prevRmse = rmse;
  }
  return { rotation, translation, rmse, iterations, pairs };
}

'use strict';
// Camera solving for matchmove (A21 "Camera tracking and 3D
// integration", A29 "Camera matching to photographs"): Direct
// Linear Transform estimation of the 3x4 camera matrix from 3D->2D
// correspondences, RQ decomposition into intrinsics K and pose
// [R|t], reprojection error, and camera-center recovery.

/** Jacobi eigensolver for a symmetric matrix: { values, vectors } (columns). */
export function jacobiEigen(matrixIn) {
  const n = matrixIn.length;
  const a = matrixIn.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-26) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return {
    values: a.map((row, i) => row[i]),
    vectors: v, // column j is eigenvector j: v[row][j]
  };
}

export function projectPoint(P, [x, y, z]) {
  const w = P[2][0] * x + P[2][1] * y + P[2][2] * z + P[2][3];
  return [
    (P[0][0] * x + P[0][1] * y + P[0][2] * z + P[0][3]) / w,
    (P[1][0] * x + P[1][1] * y + P[1][2] * z + P[1][3]) / w,
    w,
  ];
}

/**
 * DLT camera matrix from >= 6 correspondences.
 * points3D: [[x,y,z]...], points2D: [[u,v]...].
 * Returns 3x4 P (array of 3 rows), scaled so |P| = 1, with sign
 * chosen so most points have positive depth.
 */
export function estimateCameraMatrix(points3D, points2D) {
  const n = points3D.length;
  if (n !== points2D.length || n < 6) throw new Error('camera: DLT needs >= 6 correspondences');
  // Hartley normalization: without it the DLT system mixes pixel
  // (~1e2) and world (~1e0) magnitudes and the smallest-eigenvector
  // solve loses the accuracy matchmove needs.
  const norm2 = (() => {
    const c = [0, 0];
    for (const [u, v] of points2D) { c[0] += u; c[1] += v; }
    c[0] /= n; c[1] /= n;
    let meanDist = 0;
    for (const [u, v] of points2D) meanDist += Math.hypot(u - c[0], v - c[1]);
    const s = Math.SQRT2 / (meanDist / n);
    return { T: [[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]], apply: ([u, v]) => [s * (u - c[0]), s * (v - c[1])] };
  })();
  const norm3 = (() => {
    const c = [0, 0, 0];
    for (const p of points3D) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= n; c[1] /= n; c[2] /= n;
    let meanDist = 0;
    for (const p of points3D) meanDist += Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    const s = Math.sqrt(3) / (meanDist / n);
    return {
      T: [[s, 0, 0, -s * c[0]], [0, s, 0, -s * c[1]], [0, 0, s, -s * c[2]], [0, 0, 0, 1]],
      apply: ([x, y, z]) => [s * (x - c[0]), s * (y - c[1]), s * (z - c[2])],
    };
  })();
  const pts3 = points3D.map(norm3.apply);
  const pts2 = points2D.map(norm2.apply);
  // Normal equations A^T A (12x12) of the 2n x 12 DLT system.
  const ata = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const addRow = (row) => {
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) ata[i][j] += row[i] * row[j];
  };
  for (let i = 0; i < n; i++) {
    const [x, y, z] = pts3[i];
    const [u, v] = pts2[i];
    addRow([x, y, z, 1, 0, 0, 0, 0, -u * x, -u * y, -u * z, -u]);
    addRow([0, 0, 0, 0, x, y, z, 1, -v * x, -v * y, -v * z, -v]);
  }
  const { values, vectors } = jacobiEigen(ata);
  let minIdx = 0;
  for (let i = 1; i < 12; i++) if (values[i] < values[minIdx]) minIdx = i;
  const p = vectors.map((row) => row[minIdx]);
  const Phat = [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12)];
  // Denormalize: P = T2^-1 * Phat * T3.
  const T2inv = [
    [1 / norm2.T[0][0], 0, -norm2.T[0][2] / norm2.T[0][0]],
    [0, 1 / norm2.T[1][1], -norm2.T[1][2] / norm2.T[1][1]],
    [0, 0, 1],
  ];
  const mul34 = (A, B) => A.map((row) => [0, 1, 2, 3].map((j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const mul33x34 = (A, B) => A.map((row) => [0, 1, 2, 3].map((j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  let P = mul33x34(T2inv, mul34(Phat, norm3.T));
  // Cheirality: most points should be in front (positive depth).
  let front = 0;
  for (let i = 0; i < n; i++) if (projectPoint(P, points3D[i])[2] > 0) front++;
  if (front < n / 2) P = P.map((row) => row.map((value) => -value));
  return P;
}

function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function invert3(m) {
  const d = det3(m);
  if (Math.abs(d) < 1e-14) throw new Error('camera: singular 3x3');
  const adj = [
    [m[1][1] * m[2][2] - m[1][2] * m[2][1], m[0][2] * m[2][1] - m[0][1] * m[2][2], m[0][1] * m[1][2] - m[0][2] * m[1][1]],
    [m[1][2] * m[2][0] - m[1][0] * m[2][2], m[0][0] * m[2][2] - m[0][2] * m[2][0], m[0][2] * m[1][0] - m[0][0] * m[1][2]],
    [m[1][0] * m[2][1] - m[1][1] * m[2][0], m[0][1] * m[2][0] - m[0][0] * m[2][1], m[0][0] * m[1][1] - m[0][1] * m[1][0]],
  ];
  return adj.map((row) => row.map((v) => v / d));
}

/**
 * RQ-decompose P into { K, R, t, center }: K upper-triangular
 * intrinsics (positive diagonal, K[2][2] = 1), R rotation, t = -R*C.
 */
export function decomposeCamera(P) {
  let M = [P[0].slice(0, 3), P[1].slice(0, 3), P[2].slice(0, 3)];
  let p4 = [P[0][3], P[1][3], P[2][3]];
  if (det3(M) < 0) {
    // Negating M alone corrupts the camera center: p4 must flip too.
    M = M.map((row) => row.map((v) => -v));
    p4 = p4.map((v) => -v);
  }
  // RQ via QR of J M^T J with the anti-identity J.
  const J = [[0, 0, 1], [0, 1, 0], [1, 0, 0]];
  const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));
  const Mp = mul(J, mul(transpose(M), J));
  // Gram-Schmidt QR of Mp (columns).
  const cols = [0, 1, 2].map((j) => Mp.map((row) => row[j]));
  const qCols = [], r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let j = 0; j < 3; j++) {
    let vec = [...cols[j]];
    for (let i = 0; i < j; i++) {
      r[i][j] = vec.reduce((s, v, k) => s + v * qCols[i][k], 0);
      vec = vec.map((v, k) => v - r[i][j] * qCols[i][k]);
    }
    r[j][j] = Math.hypot(...vec);
    if (r[j][j] < 1e-14) throw new Error('camera: degenerate decomposition');
    qCols.push(vec.map((v) => v / r[j][j]));
  }
  const Qp = [0, 1, 2].map((i) => qCols.map((col) => col[i]));
  let K = mul(J, mul(transpose(r), J));
  let R = mul(J, mul(transpose(Qp), J));
  // Positive K diagonal.
  for (let i = 0; i < 3; i++) {
    if (K[i][i] < 0) {
      for (let row = 0; row < 3; row++) K[row][i] = -K[row][i];
      for (let col = 0; col < 3; col++) R[i][col] = -R[i][col];
    }
  }
  const scale = K[2][2];
  K = K.map((row) => row.map((v) => v / scale));
  const Minv = invert3(M);
  const center = Minv.map((row) => -(row[0] * p4[0] + row[1] * p4[1] + row[2] * p4[2]));
  // Recompute t from the sign-fixed pose so [R|t] is consistent.
  const t = [0, 1, 2].map((i) => -(R[i][0] * center[0] + R[i][1] * center[1] + R[i][2] * center[2]));
  return { K, R, t, center };
}

/** RMS reprojection error in pixels. */
export function reprojectionError(P, points3D, points2D) {
  let sum = 0;
  for (let i = 0; i < points3D.length; i++) {
    const [u, v] = projectPoint(P, points3D[i]);
    sum += (u - points2D[i][0]) ** 2 + (v - points2D[i][1]) ** 2;
  }
  return Math.sqrt(sum / points3D.length);
}

/**
 * Non-linear refinement of a camera matrix (the bundle-adjustment
 * core for a single camera): Levenberg-Marquardt on the 11 free
 * entries of P (last entry fixed for scale), minimizing squared
 * reprojection error. Numeric Jacobian; robust for DLT-initialized
 * problems.
 */
export function refineCameraMatrix(P0, points3D, points2D, { iterations = 30, lambda = 1e-3 } = {}) {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // free params (skip p[11])
  const toP = (params) => {
    const flat = [...params.slice(0, 11), params[11] ?? 1];
    return [flat.slice(0, 4), flat.slice(4, 8), flat.slice(8, 12)];
  };
  const residuals = (P) => {
    const out = [];
    for (let i = 0; i < points3D.length; i++) {
      const [u, v] = projectPoint(P, points3D[i]);
      out.push(u - points2D[i][0], v - points2D[i][1]);
    }
    return out;
  };
  const cost = (r) => r.reduce((s, v) => s + v * v, 0);
  // Scale anchor: keep P[2][3] (= flat index 11) at its initial value.
  let params = [...P0[0], ...P0[1], ...P0[2]];
  let P = P0;
  let r = residuals(P);
  let currentCost = cost(r);
  const m = r.length;
  for (let iter = 0; iter < iterations; iter++) {
    // Numeric Jacobian (m x 11).
    const J = Array.from({ length: m }, () => new Array(11).fill(0));
    for (let j = 0; j < 11; j++) {
      const idx = rows[j];
      const step = Math.max(Math.abs(params[idx]) * 1e-6, 1e-9);
      const perturbed = [...params];
      perturbed[idx] += step;
      const rp = residuals(toP(perturbed));
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - r[i]) / step;
    }
    // Normal equations (J^T J + lambda diag) delta = -J^T r.
    const A = Array.from({ length: 11 }, () => new Array(11).fill(0));
    const g = new Array(11).fill(0);
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < 11; a++) {
        g[a] += J[i][a] * r[i];
        for (let b = 0; b < 11; b++) A[a][b] += J[i][a] * J[i][b];
      }
    }
    for (let a = 0; a < 11; a++) A[a][a] += lambda * (A[a][a] + 1e-12);
    // Gaussian elimination with partial pivoting.
    const x = new Array(11).fill(0);
    const M = A.map((row, i) => [...row, -g[i]]);
    for (let col = 0; col < 11; col++) {
      let pivot = col;
      for (let row = col + 1; row < 11; row++) if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      [M[col], M[pivot]] = [M[pivot], M[col]];
      if (Math.abs(M[col][col]) < 1e-14) continue;
      for (let row = 0; row < 11; row++) {
        if (row === col) continue;
        const factor = M[row][col] / M[col][col];
        for (let k = col; k < 12; k++) M[row][k] -= factor * M[col][k];
      }
    }
    for (let i = 0; i < 11; i++) x[i] = Math.abs(M[i][i]) < 1e-14 ? 0 : M[i][11] / M[i][i];
    const next = [...params];
    for (let j = 0; j < 11; j++) next[rows[j]] += x[j];
    const nextP = toP(next);
    const nextR = residuals(nextP);
    const nextCost = cost(nextR);
    if (nextCost < currentCost) {
      params = next; P = nextP; r = nextR;
      if (currentCost - nextCost < 1e-12) { currentCost = nextCost; break; }
      currentCost = nextCost;
      lambda = Math.max(lambda * 0.3, 1e-9);
    } else {
      lambda *= 5;
      if (lambda > 1e6) break;
    }
  }
  return { P, error: reprojectionError(P, points3D, points2D), cost: currentCost };
}

/** Build a ground-truth camera matrix from K, R, center. */
export function composeCamera(K, R, center) {
  const t = [0, 1, 2].map((i) => -(R[i][0] * center[0] + R[i][1] * center[1] + R[i][2] * center[2]));
  const Rt = R.map((row, i) => [...row, t[i]]);
  return K.map((row, i) => Rt[0].map((_, j) => row.reduce((s, v, k) => s + v * Rt[k][j], 0)));
}

'use strict';
// Bundle adjustment (A21 "Camera tracking and 3D integration
// (matchmove)"): joint Levenberg-Marquardt refinement of camera
// poses and 3D points against 2D observations, on top of the DLT
// cameras from ./camera-solve.js. Intrinsics stay fixed; poses use
// a local axis-angle (Rodrigues) update; the first camera is held
// fixed by default to anchor the gauge (the residual similarity
// scale freedom is documented, not hidden).

import { composeCamera, projectPoint } from './camera-solve.js';

/** Rotation matrix from an axis-angle vector (Rodrigues' formula). */
export function rodrigues([x, y, z]) {
  const theta = Math.hypot(x, y, z);
  if (theta < 1e-14) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const [kx, ky, kz] = [x / theta, y / theta, z / theta];
  const c = Math.cos(theta), s = Math.sin(theta), v = 1 - c;
  return [
    [c + kx * kx * v, kx * ky * v - kz * s, kx * kz * v + ky * s],
    [ky * kx * v + kz * s, c + ky * ky * v, ky * kz * v - kx * s],
    [kz * kx * v - ky * s, kz * ky * v + kx * s, c + kz * kz * v],
  ];
}

const mul3 = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((sum, v, k) => sum + v * B[k][j], 0)));

function project(cameras, points, obs) {
  const cache = cameras.map((cam) => composeCamera(cam.K, cam.R, cam.center));
  return obs.map(({ camera, point, uv }) => {
    const [u, v, w] = projectPoint(cache[camera], points[point]);
    return [u - uv[0], v - uv[1], w];
  });
}

/** Reprojection statistics for a solved (or candidate) scene. */
export function reprojectionStats(cameras, points, observations) {
  const residuals = project(cameras, points, observations);
  let sum = 0, max = 0;
  for (const [du, dv] of residuals) {
    const e = Math.hypot(du, dv);
    sum += e * e;
    if (e > max) max = e;
  }
  return { rms: Math.sqrt(sum / Math.max(1, residuals.length)), max, count: residuals.length };
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-18) continue;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (Math.abs(row[i]) > 1e-18 ? row[i] : 1));
}

/**
 * Jointly refine camera poses and 3D points.
 * cameras: [{ K, R, center }] (R = 3 rows), points: [[x,y,z]...],
 * observations: [{ camera, point, uv: [u, v] }].
 * Cameras listed in fixedCameras (default [0]) keep their exact
 * input pose. Inputs are not mutated.
 */
export function bundleAdjust({ cameras, points, observations, iterations = 60, fixedCameras = [0], lambda0 = 1e-3 } = {}) {
  if (!cameras?.length || !points?.length || !observations?.length) {
    throw new Error('bundle: cameras, points and observations are required');
  }
  for (const o of observations) {
    if (!(o.camera >= 0 && o.camera < cameras.length) || !(o.point >= 0 && o.point < points.length)) {
      throw new Error('bundle: observation index out of range');
    }
  }
  const fixed = new Set(fixedCameras);
  const cams = cameras.map((c) => ({ K: c.K.map((r) => [...r]), R: c.R.map((r) => [...r]), center: [...c.center] }));
  const pts = points.map((p) => [...p]);

  // Parameter layout: per free camera [omega(3), center(3)], then
  // per point [x, y, z]. Local deltas are applied to a snapshot so
  // rejected LM steps cost nothing.
  const freeCams = cams.map((_, i) => i).filter((i) => !fixed.has(i));
  const camOffset = new Map(freeCams.map((ci, k) => [ci, k * 6]));
  const pointBase = freeCams.length * 6;
  const nParams = pointBase + pts.length * 3;

  const applyDelta = (delta) => {
    const savedCams = cams.map((c) => ({ R: c.R.map((r) => [...r]), center: [...c.center] }));
    const savedPts = pts.map((p) => [...p]);
    for (const ci of freeCams) {
      const o = camOffset.get(ci);
      const dR = rodrigues([delta[o], delta[o + 1], delta[o + 2]]);
      cams[ci].R = mul3(dR, cams[ci].R);
      cams[ci].center = cams[ci].center.map((v, k) => v + delta[o + 3 + k]);
    }
    for (let pi = 0; pi < pts.length; pi++) {
      const o = pointBase + pi * 3;
      pts[pi] = pts[pi].map((v, k) => v + delta[o + k]);
    }
    return () => {
      for (let i = 0; i < cams.length; i++) { cams[i].R = savedCams[i].R; cams[i].center = savedCams[i].center; }
      for (let i = 0; i < pts.length; i++) pts[i] = savedPts[i];
    };
  };

  const residualVector = () => {
    const out = [];
    for (const [du, dv] of project(cams, pts, observations)) out.push(du, dv);
    return out;
  };
  const cost = (r) => r.reduce((s, v) => s + v * v, 0) / 2;

  let residuals = residualVector();
  let currentCost = cost(residuals);
  const initialRms = Math.sqrt((2 * currentCost) / residuals.length);
  let lambda = lambda0;
  let accepted = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Central-difference Jacobian (numeric; problem sizes here are
    // matchmove tracks, not city-scale reconstructions).
    const nRes = residuals.length;
    const J = Array.from({ length: nRes }, () => new Float64Array(nParams));
    for (let p = 0; p < nParams; p++) {
      const step = 1e-6;
      const delta = new Float64Array(nParams);
      delta[p] = step;
      const undo = applyDelta(delta);
      const rp = residualVector();
      undo();
      delta[p] = -step;
      const undo2 = applyDelta(delta);
      const rm = residualVector();
      undo2();
      for (let r = 0; r < nRes; r++) J[r][p] = (rp[r] - rm[r]) / (2 * step);
    }
    // Normal equations J^T J delta = -J^T r.
    const A = Array.from({ length: nParams }, () => new Float64Array(nParams));
    const g = new Float64Array(nParams);
    for (let r = 0; r < nRes; r++) {
      const row = J[r], res = residuals[r];
      for (let i = 0; i < nParams; i++) {
        if (row[i] === 0) continue;
        g[i] += row[i] * res;
        for (let j = i; j < nParams; j++) A[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < nParams; i++) for (let j = i + 1; j < nParams; j++) A[j][i] = A[i][j];

    let improved = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const damped = A.map((row, i) => {
        const copy = Float64Array.from(row);
        copy[i] += lambda * Math.max(1e-12, A[i][i]);
        return copy;
      });
      const delta = solveLinear(damped.map((r) => Array.from(r)), g.map((v) => -v));
      const undo = applyDelta(delta);
      const candidate = residualVector();
      const candidateCost = cost(candidate);
      if (candidateCost < currentCost) {
        residuals = candidate;
        currentCost = candidateCost;
        lambda = Math.max(1e-12, lambda * 0.3);
        improved = true;
        accepted++;
        break;
      }
      undo();
      lambda *= 8;
    }
    if (!improved) break;
  }

  const stats = reprojectionStats(cams, pts, observations);
  return {
    cameras: cams,
    points: pts,
    rms: stats.rms,
    maxError: stats.max,
    initialRms,
    iterations: accepted,
  };
}

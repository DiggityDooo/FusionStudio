'use strict';
// Point-cloud cleaning (A25 "Point-cloud import, editing, cleaning
// and meshing"): voxel-grid downsampling, statistical outlier
// removal, and PCA normal estimation. Points are flat xyz arrays.
// Neighborhood search is brute force (documented scale limit).

import { jacobiEigen } from './camera-solve.js';

function toPoints(flat) {
  const pts = [];
  for (let i = 0; i + 2 < flat.length; i += 3) pts.push([flat[i], flat[i + 1], flat[i + 2]]);
  return pts;
}
const flatOf = (pts) => Float32Array.from(pts.flatMap((p) => p));

function knnIndices(pts, index, k) {
  const p = pts[index];
  const dists = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === index) continue;
    dists.push([((pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2 + (pts[i][2] - p[2]) ** 2), i]);
  }
  dists.sort((a, b) => a[0] - b[0]);
  return dists.slice(0, k).map((d) => ({ index: d[1], distance: Math.sqrt(d[0]) }));
}

/** Voxel-grid downsample: one centroid per occupied voxel. */
export function voxelDownsample(flat, voxelSize) {
  if (voxelSize <= 0) throw new Error('pointcloud: voxelSize must be positive');
  const pts = toPoints(flat);
  const voxels = new Map();
  for (const p of pts) {
    const key = `${Math.floor(p[0] / voxelSize)},${Math.floor(p[1] / voxelSize)},${Math.floor(p[2] / voxelSize)}`;
    if (!voxels.has(key)) voxels.set(key, []);
    voxels.get(key).push(p);
  }
  const centroids = [...voxels.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, members]) => {
      const c = [0, 0, 0];
      for (const p of members) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      return c.map((v) => v / members.length);
    });
  return { positions: flatOf(centroids), count: centroids.length, voxelCount: voxels.size };
}

/**
 * Statistical outlier removal: a point is an outlier when its mean
 * distance to its k nearest neighbors exceeds
 * globalMean + stdRatio * globalStd. Returns kept point indices.
 */
export function statisticalOutlierIndices(flat, { k = 8, stdRatio = 1 } = {}) {
  const pts = toPoints(flat);
  if (pts.length < k + 1) throw new Error('pointcloud: not enough points for k neighbors');
  const meanDists = pts.map((_, i) => {
    const neighbors = knnIndices(pts, i, k);
    return neighbors.reduce((s, n) => s + n.distance, 0) / k;
  });
  const mean = meanDists.reduce((s, v) => s + v, 0) / pts.length;
  const std = Math.sqrt(meanDists.reduce((s, v) => s + (v - mean) ** 2, 0) / pts.length);
  const threshold = mean + stdRatio * std;
  const kept = [];
  meanDists.forEach((d, i) => { if (d <= threshold) kept.push(i); });
  return { kept, threshold, mean, std };
}

export function filterPoints(flat, keptIndices) {
  const pts = toPoints(flat);
  return flatOf(keptIndices.map((i) => pts[i]));
}

/**
 * PCA normals: smallest-eigenvalue eigenvector of the kNN covariance,
 * oriented toward the viewpoint. Returns { normals, curvature }
 * where curvature = lambdaMin / sum(lambda) (0 flat, ~1/3 isotropic).
 */
export function estimateNormals(flat, { k = 10, viewpoint = [0, 0, 0] } = {}) {
  const pts = toPoints(flat);
  if (pts.length < k + 1) throw new Error('pointcloud: not enough points for k neighbors');
  const normals = new Float32Array(pts.length * 3);
  const curvature = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const neighbors = [pts[i], ...knnIndices(pts, i, k).map((n) => pts[n.index])];
    const c = [0, 0, 0];
    for (const p of neighbors) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    const cen = c.map((v) => v / neighbors.length);
    const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of neighbors) {
      const d = [p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]];
      for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) cov[r][col] += d[r] * d[col];
    }
    const { values, vectors } = jacobiEigen(cov);
    let minIdx = 0;
    for (let j = 1; j < 3; j++) if (values[j] < values[minIdx]) minIdx = j;
    let normal = [vectors[0][minIdx], vectors[1][minIdx], vectors[2][minIdx]];
    const toView = [viewpoint[0] - pts[i][0], viewpoint[1] - pts[i][1], viewpoint[2] - pts[i][2]];
    if (normal[0] * toView[0] + normal[1] * toView[1] + normal[2] * toView[2] < 0) {
      normal = normal.map((v) => -v);
    }
    normals.set(normal, i * 3);
    const sum = values[0] + values[1] + values[2];
    curvature[i] = sum > 0 ? values[minIdx] / sum : 0;
  }
  return { normals, curvature };
}

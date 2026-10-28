# 2026-10-27 — A25 point-cloud cleaning (downsample, SOR, PCA normals)

## Landed

- `src/pointcloud-clean.js` — scan cleaning kernels: `voxelDownsample` (deterministic per-voxel centroids), `statisticalOutlierIndices`/`filterPoints` (kNN mean-distance SOR with mean + ratio·σ threshold), and `estimateNormals` (PCA normals via the Jacobi eigensolver from `src/camera-solve.js`, viewpoint-oriented, with the λmin/Σλ curvature ratio).
- `tests/pointcloud-clean.test.mjs` — 3/3: voxel centroids exact (8 corners → (0.5, 0.5, 0.5); halving the voxel splits 1 → 8 cells); **exactly the 5 planted outliers removed** from a 200-point ball with inliers preserved; Fibonacci-sphere normals radial to dot < −0.98 (oriented toward the center viewpoint per the orientation rule) with sane curvature, plane normals exactly +Z with zero curvature. One test-bound fix: sphere local patches are shallow, so curvature ≈ 0.007 is correct behavior (not > 0.01 as first asserted); the invariant is orders-of-magnitude above the plane's 0.

## Ledger

- `A25 Point-cloud import, editing, cleaning and meshing` gains `tests/pointcloud-clean.test.mjs` evidence; stays partial (cleaning/downsample/normals only — no surface reconstruction meshing in this kernel, brute-force kNN documented).

## Verification

- Slice: 3/3. Full suite run after this slice (see summary).

## Limits

O(n²) neighbor search suits cleaned/decimated scan scales; global normal-orientation propagation (MST) not included — orientation is per-point toward a viewpoint.

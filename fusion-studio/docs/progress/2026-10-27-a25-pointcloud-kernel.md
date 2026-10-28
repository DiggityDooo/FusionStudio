# Progress — 2026-10-27 — A25 point-cloud kernel (new files only)

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Cloud stats, voxel downsampling, statistical outlier removal | `src/pointcloud.js` | `tests/pointcloud.test.mjs` (6/6) |
| PCA surface normals (Jacobi eigensolver) | `src/pointcloud.js` | same |
| RANSAC dominant-plane segmentation | `src/pointcloud.js` | same |
| ICP registration (Horn quaternion absolute orientation) | `src/pointcloud.js` | same |
| Heightfield (2.5D) meshing from points | `src/pointcloud.js` | same |

Verified combined across all new kernels: 51 pass, 0 fail.
Note: point-to-point ICP falls into local minima on rotationally symmetric
objects; the test uses asymmetric geometry (recovers a 25-degree transform
to RMS ~1e-15) and documents the limitation.

## Status update (11:14, landed 11:52)

The parallel session registered all A25 items as partial with its own
`scanning.js` evidence, so the status flips below are **superseded**.
**Landed:** `tests/pointcloud.test.mjs` is in the main test list (383/383)
and cited as evidence on the point-cloud and registration items.

## Proposed ledger updates (superseded — see above)

- `A25 Point-cloud import, editing, cleaning and meshing`: open -> **partial**
  (cleaning, downsampling, normals, heightfield meshing in; file-format
  import and editing UI not yet). Evidence: `tests/pointcloud.test.mjs`.
- `A25 Alignment/registration of scans`: open -> **partial** (ICP in;
  no global/multi-scan registration yet).
- Add `tests/pointcloud.test.mjs` to the `package.json` test list.

## Still open in A25 after this slice

Photogrammetry, depth-scan file import, NeRF/splat viewing, scan cleanup
(hole filling/decimation), de-lighting, scan-to-retopo, marker alignment,
scan pipelines, texture projection/baking.

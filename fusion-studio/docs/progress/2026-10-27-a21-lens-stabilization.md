# Progress — 2026-10-27 — A21 lens distortion + stabilization kernel

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Brown-Conrady lens distortion + iterative undistortion (point-exact inverses) | `src/lens.js` | `tests/lens.test.mjs` (4/4) |
| Image warp resampling on compositor buffers; distort->undistort restores the image | `src/lens.js` | same |
| 2D similarity (Procrustes) estimation, exact to 1e-9 on known transforms | `src/lens.js` | same |
| Track stabilization: per-frame corrections, smoothed camera path provably lower-jitter | `src/lens.js` | same |

Registered in `package.json` (main test list + `test:kernels`) and cited as
ledger evidence on `A21 Stabilization and distortion correction` and
`A21 Camera tracking and 3D integration (matchmove)`. Both items honestly
stay **partial**: this is 2D track math + lens models, not a full 3D
matchmove solver or OCIO-grade pipeline. The existing `src/compositor.js`
buffer ops (grading, LUTs, bloom) are the other session's work and remain
the compositor core; this kernel composes with its buffer shape.

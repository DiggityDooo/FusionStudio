# A21 multi-view bundle adjustment (2026-10-27)

Kernel: `src/bundle-adjust.js`. Tests:
`tests/bundle-adjust.test.mjs` (4/4). Builds on the DLT cameras in
`src/camera-solve.js` (same repo convention: camera looks down
−Z, P = K[R|t], in-front points have negative homogeneous w).

`bundleAdjust` jointly refines camera poses and 3D points with
Levenberg-Marquardt: poses update through a local axis-angle
(Rodrigues) delta, intrinsics stay fixed, and the first camera is
held fixed by default to anchor the gauge. The Jacobian is
numeric (central differences), the damped normal equations are
solved densely, and rejected steps roll back through saved state,
so inputs are never mutated.

Oracles:
- Noise-free synthetic scene (4 cameras, 24 points, perturbed
  start at 9.6 px RMS): reprojection converges to ~1e-13 px;
  structure (after similarity-scale alignment through the fixed
  camera) improves >5× over the perturbed start. The absolute
  structure bound (~2e-3) is set by scene conditioning — a narrow
  depth range at ~10 units with an 800 px focal leaves a flat
  valley along the viewing rays — so the sharp oracles are the
  machine-precision reprojection and the improvement ratio.
- Noisy observations (~0.3 px): final RMS stays near the noise
  floor (< 0.5 px, >5× better than the start) and structure error
  more than halves.
- Fixed camera returned bit-identical; inputs untouched.

Limits: dense numeric Jacobian (matchmove-track scale, not
city-scale reconstruction); no robust loss, no distortion model,
no intrinsics refinement; residual similarity scale freedom is
inherent to the fixed-single-camera gauge.

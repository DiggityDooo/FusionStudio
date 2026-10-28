# 2026-10-27 — A21/A29 camera solve (DLT matchmove core)

## Landed

- `src/camera-solve.js` — camera estimation from 3D→2D correspondences: Hartley-normalized DLT (12×12 normal equations, Jacobi eigensolver), cheirality sign fix, RQ decomposition into intrinsics K / rotation R / translation / camera center, reprojection error, and a ground-truth camera composer for tests.
- `tests/camera-solve.test.mjs` — 4/4: Jacobi eigensolver verified against A·v = λ·v; **DLT recovers a synthetic lookAt camera exactly** — center and rotation to 1e-6, fx/fy/cx/cy to 0.5 px at 900 px focal, reprojection < 1e-6 px; held-out points reproject exactly; 0.5 px observation noise keeps the fit residual < 0.5 px and center error < 0.25 world units. Two kernel defects found and fixed by the tests: (1) unnormalized DLT is too ill-conditioned (pixel vs world magnitudes) — Hartley normalization added; (2) `decomposeCamera` negated M for the determinant fix without negating p4, corrupting the camera center. Two fixture-side fixes: flat-vs-rows quaternion matrix shape, and the −Z lookAt depth-sign convention.

## Ledger

- `A21 Camera tracking and 3D integration (matchmove)` and `A29 Camera matching to photographs` gain `tests/camera-solve.test.mjs` evidence; both stay partial (no feature detection/front-end, no bundle adjustment, no solve UI).
- Housekeeping: `test-output/ledger-evidence.mjs` had five pre-existing duplicate object keys (later entries silently shadowing earlier ones, which had already swallowed two new evidence registrations this session). All merged into array form; duplicate audit now clean.

## Verification

- Slice: 4/4. Full suite run after this slice (see summary).

## Limits

DLT is the linear initializer; single-camera non-linear refinement landed below. Multi-view bundle adjustment and lens distortion terms still do not exist.

## Addendum (same day): non-linear refinement landed

- `refineCameraMatrix` — Levenberg-Marquardt on the 11 free entries of P (numeric Jacobian), the single-camera bundle-adjustment core. Test: from a camera perturbed by 5% entry noise (start error > 1 px) it recovers to < 0.01 px reprojection and < 0.01 center error against clean observations; on ±0.5 px noisy data it ends at the noise floor (0.372 vs DLT 0.377 — calibration note: uniform ±0.5 noise has 2D RMS ≈ 0.40, so both solvers were already near-optimal; the perturbed-recovery oracle is the discriminating one). Still single-camera: multi-view bundle adjustment and distortion terms remain open.

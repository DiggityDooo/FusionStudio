# A13 space switching — 2026-10-27

## Kernel

New `src/space-switch.js`: parent-space switching in the repo TRS /
3x4 row-major convention (reusing `composeMatrix` from
mograph-kernel).

- `multiplyMat34`, `invertMat34` (explicit singular error),
  `applyMat34`, `chainWorld` (parent-first chains), `decomposeMat34`
  (negative determinant folds into a negative scale axis; gimbal-lock
  fallback), and `worldTransform`.
- `switchParentMatrix` is the exact matrix form:
  `inverse(newParent) * oldParent * local`.
- `switchSpace` is the TRS form — and it **refuses shear**: rotated
  non-uniform parent scales produce matrices no TRS can represent, so
  instead of silently approximating, it throws with the measured
  shear (`mat34Shear`) and points at the matrix form. This limit was
  found by the world-scale oracle during development, not assumed.

## Verified (tests/space-switch.test.mjs, 7/7)

Multiply/invert round-trips and TRS compose/decompose round-trips;
world position/scale/matrix preserved to 1e-8 across a switch between
two rotated, scaled parent chains, including a point-level probe;
switch to world space and back returns the original local transform;
after switching, the object follows the new parent and is unaffected
by the old one; mirrored parents keep the mirror as a negative local
scale with exact probe points; shear-producing switches throw at TRS
level while the matrix form stays exact; singular parents error.

## Ledger

`A13 Space switching` gains `tests/space-switch.test.mjs`. Stays
partial: transform math verified — no animator-facing space-switch
UI or constraint blending between spaces. Backup refreshed
(test-output/kernel-backup-2026-10-27).

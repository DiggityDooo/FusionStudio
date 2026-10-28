# A19 soft-body volume constraints (XPBD extension) — 2026-10-27

## Kernel

`src/xpbd.js` gains tetrahedral volume preservation:

- `tetraVolume(positions, a, b, c, d)`: signed volume (1/6 det).
- `addVolumeConstraint(world, a, b, c, d, restVolume, compliance)`: XPBD
  constraint with the analytic volume gradients (cofactor/cross-product
  forms, a-vertex gradient as the negative sum), solved in the same
  substep loop as distance constraints with per-substep multiplier reset.

## Verified (tests/xpbd.test.mjs, now 9/9)

- A crushed tetrahedron (volume < 0.3× rest) is restored to 1e-9, and the
  centroid is invariant under the correction (equal masses: gradient sum
  is zero, so no momentum is invented).
- A 12-tet cube (center-fan fixture, outer-edge distance constraints only,
  so the shell is floppy) dropped on the ground: with volume constraints
  it squashes (height < 1) while keeping volume in [0.88, 1.08]; without
  them it loses at least 8 points more volume. No ground penetration.
- Inflated rest volumes (×1.4, volume constraints only, zero gravity)
  expand the blob to the scaled volume — uniform scaling is the exact
  solution and the solver finds it (final in [1.25, 1.55]).

## Ledger

`A19 Soft-body dynamics` gains `tests/xpbd.test.mjs` alongside its existing
evidence. Stays partial: no shape-matching, FEM, self-collision, or UI
wiring. Backup refreshed (test-output/kernel-backup-2026-10-27).

## Next

A19 kernel depth is now broad (ocean, grid fluid, SPH, XPBD ropes +
soft bodies, particles/fields, Voronoi). Remaining A19 items are mostly
integration-scale (ragdoll on rigid bodies, granular, caches, presets,
debug views). Per the ledger's suggested order, the next high-value move is
back to A8/A6 depth or Part B parity where it unblocks Part A — to be
scoped from the ledger at the start of the next slice.

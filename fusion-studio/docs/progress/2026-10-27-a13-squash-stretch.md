# A13 squash/stretch & stretchy limbs — 2026-10-27

## Kernel

New `src/squash-stretch.js`:

- `volumePreservingScale(stretch, axis)`: axial `s`, perpendicular
  `1/sqrt(s)` — volume preserved to 1e-12 by construction.
- `stretchFactor(distance, rest, {maxStretch, softRange})`: exact
  `distance/rest` up to `maxStretch`, then a tanh ease that never
  exceeds `maxStretch + softRange` (continuity at the boundary
  verified).
- `solveStretchyLimb`: stretch + volume-preserving scale + an honest
  `reached` flag when the soft limit falls short of the target.
- `createSquashSpring`: impact squash driven by the jiggle spring
  (`src/jiggle.js`), recovering through overshoot into stretch and
  settling at 1, volume-preserving at every frame.

## Verified (tests/squash-stretch.test.mjs, 3/3)

Exact volume invariance across stretch 0.25–8 on all axes; exact
reaches below the limit; tanh soft-limit shape value-checked at
moderate overage and bounded at extreme distance; monotonicity and
boundary continuity; compression bulge; impact recovery overshoots
above 1.1 and settles within 0.01 while volume holds every frame.

## Ledger

`A13 Squash/stretch and stretchy limbs` gains
`tests/squash-stretch.test.mjs`. Stays partial: deformer math
verified — no rig/deformer integration or UI. Backup refreshed
(test-output/kernel-backup-2026-10-27).

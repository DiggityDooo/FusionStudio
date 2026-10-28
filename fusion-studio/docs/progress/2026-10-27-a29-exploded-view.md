# A29 exploded views — 2026-10-27

## Kernel

New `src/exploded-view.js`: exploded-view layout for assemblies.

- Modes: `radial` (outward from an origin, offset = direction x
  factor x distance, so factor 1 doubles distances), `axis`
  (separation along an axis by signed depth), and `custom`
  (per-part directions, normalized, scaled by distance).
- Default origin is the parts centroid. A part exactly at the origin
  has no radial direction and stays put instead of producing NaNs.
- Two-stage group explosion: group centers separate from the origin
  at `groupFactor`, parts separate from their group center at
  `factor` (freezing groupFactor isolates within-group spread).
- `explodedAt(parts, options, t)` interpolates the factor for
  animated explode/assemble transitions.

## Verified (tests/exploded-view.test.mjs, 5/5)

Factor 0 is exactly the assembled state; radial positions/directions
exact (3-4-5 diagonal to length 10); centroid default; axis mode
offsets and ordering; group composition arithmetic
(center + groupOffset + localOffset) with within-group spacing
doubling; custom directions normalized with exact offsets; mode and
input validation.

## Ledger

`A29 Exploded views and technical illustrations` gains
`tests/exploded-view.test.mjs`. Stays partial: layout math verified
-- no part meshes/BOM callouts, leader lines, or rendering. Backup
refreshed (test-output/kernel-backup-2026-10-27).

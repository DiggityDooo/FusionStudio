# 2026-10-27 — Composition: BVH-accelerated baking; A20 world partition

## BVH wired into the light baker

- `src/bvh.js` now owns `rayTriangle` (moved from the baker so the dependency flows one way: baker → BVH); `bakeVertexIrradiance` accepts a prebuilt `bvh` for shadow rays. New oracle: BVH-accelerated and brute-force bakes of a two-light shadow scene are **bit-identical per vertex**. The light-bake progress doc's stated next step is done.

## A20 world partition (`src/world-partition.js`)

- Uniform XZ grid: objects register AABBs into every overlapped cell; exact/superset AABB queries; deterministic streaming load/unload diffs with a hysteresis margin; loaded-object enumeration.
- Tests 4/4: spanning objects land in exactly the overlapped cells (including negative-coordinate flooring and boundary-touching); exact queries remove cell-level false positives while cell queries stay a proven superset; re-register/unregister behave; a borderline camera move produces **zero streaming churn** with hysteresis while a teleport swaps the loaded object set exactly, and steady state diffs are empty.

## Ledger

- `A20 Scene streaming/world partition` gains `tests/world-partition.test.mjs` evidence; stays partial (grid bookkeeping only — no async cell loading, LOD/HLOD selection, or renderer integration).

## Verification

- Slices: bake/BVH combined 8/8, world partition 4/4. Full suite run after these slices (see summary).

## Limits

Single-level grid (no hierarchical cells), synchronous diff computation, XZ-only partitioning.

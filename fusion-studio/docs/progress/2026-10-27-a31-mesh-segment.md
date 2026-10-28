# 2026-10-27 — A31 mesh segmentation / smart selection

## Landed

- `src/mesh-segment.js` — dual-graph face adjacency with dihedral angles, `segmentByAngle` (connected components with angle-threshold edge cuts), and `selectPlanarRegion` (seed-normal cone flood selection).
- `tests/mesh-segment.test.mjs` — 3/3: a cube segments into exactly 6 regions at 30° (quad triangle pairs stay together) and 1 region at 120°; a 16-segment tube is exactly 1 region at 30° and exactly 16 at 10°, with the 22.5° segment dihedral verified in the adjacency; planar selection from a cube's top face returns exactly its 2 triangles and does not leak onto a disconnected coplanar cube.

## Ledger

- `A31 Smart selection and segmentation of meshes` gains `tests/mesh-segment.test.mjs` evidence; stays partial (classical geometric segmentation honestly labeled as such under the A31 heading — no learned/ML segmentation, no selection UI; note the ledger area is "AI" broadly, this kernel is the deterministic core a smart-select tool needs).

## Verification

- Slice: 3/3. Full suite run after this slice (see summary).

## Limits

Angle-only regions (no curvature/texture cues), manifold-edge adjacency only (non-manifold edges pair all sharing faces), no hierarchical merging.

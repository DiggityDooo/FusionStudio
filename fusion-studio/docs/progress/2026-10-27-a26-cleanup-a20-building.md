# 2026-10-27 — A26 mesh cleanup + A20 building generation

## A26 mesh cleanup (`src/mesh-cleanup.js`)

- Vertex welding (tolerance-bucketed, normal averaging), degenerate-triangle removal, unreferenced-vertex compaction, and a combined `cleanupMesh` pipeline with exact stats.
- Tests 4/4: a 36-vertex soup cube welds to the 8-vertex indexed cube with **volume still exactly 1** (via `src/mesh-section.js` divergence volume), welding is idempotent, tolerance semantics are exact (0.001-apart vertices weld at tol 0.01, not at 1e-6); exactly the 3 planted degenerate triangles are removed; a dirty-cube pipeline reports exact before/after counts and preserves geometry.

## A20 building generation (`src/building.js`)

- Footprint extrusion with ear-clipped caps (concave-safe), flat and gable roofs (rectangular footprints, ridge along the longer side), outward normals throughout.
- Tests 3/3: flat-roof volume is footprint × height exactly (720), L-shaped footprint volume exact (320, ear-clipping area sum exact), **gable volume = box + triangular prism exactly (580)** with ridge height and up-facing slope normals. Defects caught en route: ear-clipper indices pointed into a reversed copy (volume ⅓), (x,z)-plane CCW maps to downward caps in 3D (cap windings flipped), and gable slope winding bookkeeping was unreliable — slopes now emit, measure their real face normal, and swap if it disagrees with outward.

## Ledger

- `A26 Scene optimization and cleanup tools` gains `tests/mesh-cleanup.test.mjs`; `A20 City/building/architectural generation` gains `tests/building.test.mjs`. Both stay partial (no cleanup UI/batch tools; buildings have no windows/facade detail, setbacks, or city layout).

## Verification

- Slices: 4/4 + 3/3. Full suite run after these slices (see summary).

## Limits

Welding is bucket-quantized (no transitive chain merging across bucket borders); buildings are massing models only — no openings, floor plates, or materials.

# Progress — 2026-10-27 — A24 print/CAM slicing kernel (new files only)

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Mesh slicing to ordered contour loops (segment stitching, duplicate-segment dedupe at vertex-exact planes) | `src/slicer.js` | `tests/slicer.test.mjs` (6/6) |
| Overhang analysis (self-supporting angle, build-plate contact excluded) | `src/slicer.js` | same |
| Print time/material estimation (filament length, weight) | `src/slicer.js` | same |
| Perimeter-only G-code export with layer markers | `src/slicer.js` | same |

Verified: `node --test tests/slicer.test.mjs tests/nurbs.test.mjs tests/sketch.test.mjs tests/feature-tree.test.mjs` -> 38 pass, 0 fail.
Tests caught two real bugs: loops doubling when the slice plane passes
exactly through mesh vertices, and plate-resting faces counted as overhang.

## Addendum — mesh integrity + wall thickness (same day)

`src/slicer.js` extended (tests now 8/8, combined kernels 63/63):
manifold/watertight reports (boundary + non-manifold edge counts),
vertex welding repair (epsilon or exact), and ray-cast wall-thickness
sampling. Verified: a welded box is watertight, one removed triangle opens
exactly three boundary edges, a 2 mm plate and a 1 mm hollow shell measure
correctly. Side finding: feature-tree `boxMesh` emits per-face vertices, so
its meshes are geometrically closed but not index-welded until welded here.

Updated proposed ledger updates:

- `A24 Watertight/manifold mesh checks and auto-repair`: open -> **partial**
  (checks + weld repair in; no hole filling yet). Evidence: `tests/slicer.test.mjs`.
- `A24 Wall-thickness and overhang analysis`: open -> **partial**
  (both analyses in).
- `A24 Slicing: layer height, infill patterns, perimeters, adaptive layers`:
  open -> **partial** (layer height, perimeters and lines/grid infill
  patterns in — `generateInfill` with even-odd clipping; no adaptive layers
  yet). Evidence: `tests/slicer.test.mjs`.
- `A24 G-code generation/preview and printer profiles`: open -> **partial**
  (perimeter-only G-code export in; no preview or profiles yet).
- `A24 Print time/material estimation`: open -> **partial**
  (filament length/weight/time estimates in). Evidence: `tests/slicer.test.mjs`.
- Add `tests/slicer.test.mjs` to the `package.json` test list.

## Still open in A24 after this slice

Hollowing/drain holes, support generation, print orientation optimization,
part splitting with keys, tolerance tools, multi-material, lattice infill,
resin workflows, CNC toolpaths, laser export, textured surfaces,
firmware/network integration.

## Status update (11:14, landed 11:52)

The parallel session's sweep registered all A24 items as partial with its
own `print-cam.js` evidence, so the status flips above are **superseded**.
**Landed after the parallel session stopped:** `tests/slicer.test.mjs` is
in the `package.json` main test list (suite 383/383) and cited as evidence
on the five A24 items above. Dedupe of `src/slicer.js` vs
`src/print-cam.js` remains a future reconciliation choice.

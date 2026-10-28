# Progress — 2026-10-27 — A30 MoGraph kernel (new files only)

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Cloners: grid, radial, spline (on NURBS curves), surface-scatter; clone realization to merged meshes | `src/mograph.js` | `tests/mograph.test.mjs` (7/7) |
| Effectors: deterministic random, step ramp, delay smoothing | `src/mograph.js` | same |
| Fields/falloffs: spherical + linear fields, transform blending | `src/mograph.js` | same |
| Procedural profiles: star, gear, spiral (extrude-verified against polygon area) | `src/mograph.js` | same |
| SVG path import (M/L/H/V/C/Q/Z, abs+rel, flattened curves) | `src/mograph.js` | same |

Verified combined: `tests/mograph.test.mjs + slicer + feature-tree + sketch + nurbs` -> 45 pass, 0 fail.

## Status update (11:14, landed 11:52)

The parallel session registered all A30 items as partial with its own
preview evidence, so the status flips below are **superseded**. **Landed:**
both test files are in the main test list (383/383) and cited as ledger
evidence (kernels at `src/mograph-kernel.js` / `src/metaballs.js`).

## Proposed ledger updates (superseded — see above)

- `A30 Cloner/instance arrays and effectors`: open -> **partial**
  (four cloner modes + three effectors in; transforms are real geometry, no
  GPU instancing path or UI yet). Evidence: `tests/mograph.test.mjs`.
- `A30 Fields and falloffs`: open -> **partial** (spherical/linear fields in).
- `A30 Spline/vector import (SVG, AI)`: open -> **partial** (SVG subset in; AI no).
- `A30 Procedural shape and pattern generators`: open -> **partial**
  (star/gear/spiral profiles in).
- Add `tests/mograph.test.mjs` to the `package.json` test list.

## Addendum — volume builder / metaballs (same day)

`src/metaballs.js` + `tests/metaballs.test.mjs` (4/4): metaball fields,
SDF sphere, field union/intersect/subtract/smooth-union (polynomial smooth
maximum — sign verified by volume ordering), and marching-tetrahedra
polygonization with grid-edge vertex welding. Single-ball meshes verify as
watertight (every edge shared by exactly two triangles) with volumes
matching the analytic iso-radius; merged two-ball blobs stay watertight.
Combined suite across all new kernels: 55 pass, 0 fail.

Additional proposed ledger flip:

- `A30 Volume builder and metaballs`: open -> **partial**
  (field CSG + marching tetrahedra in; no GPU volume rendering or UI).
- Add `tests/metaballs.test.mjs` to the `package.json` test list.

## A30 kernel coverage complete (later addenda)

All 11 A30 items now have kernel evidence in `tests/mograph.test.mjs`
(16 tests): cloners/effectors, fields, SVG import, shape generators,
volume builder/metaballs (`src/metaballs.js`), block text, grease pencil,
toon outlines, presets (`MOGRAPH_PRESETS` + exact easings), audio-reactive
(radix-2 FFT verified on a 1 kHz tone, band energies, envelope follower),
and camera-mapped parallax cards (frustum-exact sizes). Items remain
ledger-partial (no UI wiring of this kernel yet); the math layer is done.

## Addendum — toon outlines (landed later)

`toonOutline` / `toonShade` / `silhouetteEdges` in `src/mograph-kernel.js`:
inverted-hull outlines (bounds expand by exactly the width; signed volume
flips), quantized cel shading bands, and view-dependent silhouette edge
extraction (verified as the equator great-circle on a welded sphere —
welding matters: the raw sphere grid has an index-open UV seam).
Evidence: `tests/mograph.test.mjs`, cited on the A30 toon item.
Full main suite at this point: 391/391.

## Addendum — grease pencil strokes (landed later)

`createGreasePencil` / `addStroke` / `strokeToTube` / `strokeToRibbon` /
`simplifyStroke` / `smoothStroke` / `strokesAtFrame` in
`src/mograph-kernel.js`: layered strokes with per-point pressure radii,
parallel-transport tube meshing with end caps (volume-verified against the
octagonal prism; winding bug found and fixed by the volume test),
flat ribbons, Douglas-Peucker simplification, Chaikin smoothing, and
onion-skin frame queries. Evidence: `tests/mograph.test.mjs`, cited on
the A30 grease pencil item.

## Addendum — block-font 3D text (landed later)

`textToMesh` / `animateText` in `src/mograph-kernel.js`: 5x7 block font
(A-Z, 0-9, basic punctuation), extruded cell boxes, multi-line layout,
per-character meshes with wave/spin animation. Volume-verified against
glyph cell counts; zero-amplitude animation is the identity. Still no
bevel or outline-font support (item stays partial). Evidence:
`tests/mograph.test.mjs`, cited on the A30 text item.

## Coordination update (11:09)

The parallel session overwrote `src/mograph.js` with its own A30 preview
module, breaking `tests/mograph.test.mjs`. The test-verified kernel now
lives at `src/mograph-kernel.js` (test repointed; 63/63 combined green).
Whoever reconciles A30 should treat both modules as evidence: the preview
module for UI scope, this kernel for cloner/effector/field math.

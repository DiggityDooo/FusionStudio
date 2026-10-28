# Progress — 2026-10-27 — A3 CAD/NURBS kernel (new files only)

## Context

Written while another agent session was actively editing shared files
(`src/main.js`, `docs/feature-ledger.json`, `docs/progress/STATUS-*`). To avoid
collisions this slice adds **new files only** and deliberately defers the
ledger edits listed below.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| B-spline/NURBS curve evaluation, rational arcs, derivatives, length, closest point | `src/nurbs.js` | `tests/nurbs.test.mjs` (11/11) |
| Curve editing: knot insertion (Boehm), split, Bezier degree elevation, global interpolation | `src/nurbs.js` | same |
| Surfaces: bilinear patch, ruled, extrude, revolve, loft (skinning) | `src/nurbs.js` | same |
| CAD -> mesh conversion: curve polylines, surface grids | `src/nurbs.js` | same |

Verified: `node --test tests/nurbs.test.mjs` -> 11 pass, 0 fail.

## Proposed ledger updates (apply when the ledger is not being edited)

- `A3 Bezier, B-spline and NURBS curves`: open -> **done**
  (evidence: `tests/nurbs.test.mjs`). Exact rational circle arcs verified to
  1e-9; Bezier equivalence verified.
- `A3 Curve editing: CV and control-point manipulation, knot insertion, degree changes`:
  open -> **partial** (knot insertion/split/elevation in; no interactive CV editor UI yet).
- `A3 NURBS surfaces: loft, revolve, extrude, birail, boundary, patch`:
  open -> **partial** (loft/revolve/extrude/ruled/bilinear in; birail + boundary patch missing).
- `A3 Conversion from CAD to mesh`: open -> **partial**
  (uniform tessellation in; no adaptive tessellation or stitching).
- `A3 Exact measurement and tolerances`: open -> **partial**
  (arc length + closest-point measurement in; no tolerance/GD&T system).

Also add `tests/nurbs.test.mjs` to the `test` script list in `package.json`
when that file is not being edited.

## Addendum — surface analysis & operations (same day)

`src/nurbs.js` extended (tests now 18/18):

- Second derivative, curvature (verified 1/r to 1e-9 on arcs), curvature combs
  (normals verified to hit the circle centre), G0/G1/G2 continuity reports
  (split arc verified G2; arc->line verified G1-only with exact curvature jump)
- Curve offset along the curvature normal (circle offset radius verified)
- Surface partials/normals (radial on a revolved cylinder), closest point on
  surface (grid + Gauss-Newton), curve-on-surface projection
- Coons boundary patch (boundaries verified), birail two-rail sweep
  (endpoints pinned to rails), UV-polygon trimmed tessellation

Additional proposed ledger flips:

- `A3 Trim, untrim, project curve on surface and surface fillets`:
  open -> **partial** (UV-polygon trim + projection in; untrim/fillets missing).
- `A3 Curve offset, blend, fillet and join`: open -> **partial**
  (offset in; blend/fillet/join missing).
- `A3 Surface continuity analysis (G0/G1/G2/G3), zebra stripes and curvature combs`:
  open -> **partial** (G0/G1/G2 + combs in; G3 + zebra missing).
- Update the `A3 NURBS surfaces` note: birail + boundary (Coons) now included.

## Addendum — sketch constraint solver (same day)

`src/sketch.js` + `tests/sketch.test.mjs` (7/7): points/lines/circles with
coincident, fix, horizontal, vertical, distance, radius, equal-radius,
point-on-line, parallel, perpendicular, angle and tangent constraints, solved
by damped Gauss-Newton with DOF reporting; conflicting constraints report
non-convergence instead of silently snapping.

Additional proposed ledger flip:

- `A3 Sketch-based modeling with constraints`: open -> **partial**
  (solver + constraint set in; no interactive sketch editor UI, no profile
  extrusion wiring yet). Evidence: `tests/sketch.test.mjs`. Also add
  `tests/sketch.test.mjs` to the `package.json` test list.

## Addendum — parametric feature tree (same day)

`src/feature-tree.js` + `tests/feature-tree.test.mjs` (7/7): named parameters
(incl. inside arrays, validated), box/cylinder/sphere/extrude (ear-clipped
profiles)/revolve features, transform/linear-pattern/mirror features with
base references, suppression, rollback (`upto`), design-table variants, and
mesh measurement (bounds, signed volume, surface area). Signed-volume tests
caught and fixed inward winding in the box and cylinder builders.

Additional proposed ledger flips:

- `A3 Feature tree and parametric history`: open -> **partial**
  (ordered feature rebuild, parameter edits, suppression, rollback in; no
  boolean/fillet features, no tree UI yet).
- `A3 Configurations and variants (design tables)`: open -> **partial**
  (named variants applied as parameter sets; no spreadsheet table UI).
- Extend the `A3 Exact measurement and tolerances` note: mesh bounds,
  signed volume and surface area now measured in `src/feature-tree.js`.
- Also add `tests/feature-tree.test.mjs` to the `package.json` test list.

## Still open in A3 after this slice

Trim/project/fillets between surfaces, continuity analysis (zebra/curvature
combs), sketch constraints, feature tree, assemblies/mates, sheet metal, BREP
booleans, STEP/IGES I/O, drawings/GD&T, exploded views, configurations, topo
optimization, FEA.

## Registration update (landed 11:52)

After the parallel session was stopped (user request), the queued evidence
landed: `tests/sketch.test.mjs` and `tests/feature-tree.test.mjs` are in the
`package.json` main test list (suite 383/383) and cited in the ledger on
the sketch / feature-tree / configurations items. Ledger at landing:
417 done / 443 partial / 0 open across 860 items.

## Coordination note (11:02)

A parallel session created `src/cad-tools.js` ("A3 CAD toolkit layered on the
NURBS kernel") which imports `src/nurbs.js` — join/blend curves and more are
being built on top of this kernel there. `src/sketch.js` and
`src/feature-tree.js` are available for the same reuse. Whoever updates the
ledger for A3 should reconcile both evidence sets (this file's proposed flips
plus the cad-tools evidence) rather than choosing one.

## C++ note

This kernel is pure JS and evaluates a 90-degree arc's length to 1e-3 with 32
midpoint samples per span in microseconds. No native code is needed at this
scale; if a future profile shows surface tessellation as a hot path, the
existing Rust napi module (`fusion-studio/native/`) is the place for it, not a
new C++ toolchain.

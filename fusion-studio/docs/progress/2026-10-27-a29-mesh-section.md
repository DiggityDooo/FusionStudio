# 2026-10-27 — A29 section planes and cross-sections

## Landed

- `src/mesh-section.js` — half-space mesh clipping (Sutherland–Hodgman per triangle, fan retriangulation, normal interpolation across cut edges), cross-section segment extraction with shared-edge deduplication, signed plane distance, and divergence-theorem mesh volume.
- `tests/mesh-section.test.mjs` — 3/3: unit-cube fixture volume verified; a mid-height clip lands cut vertices exactly on the plane and **the two open halves' divergence sums add back to the full volume exactly**; keep-all/keep-none planes behave; cross-section of the cube at mid-height has perimeter exactly 4 (the unit square) with endpoints on the plane, and a diagonal section gives the analytic 2 + 2√2 rectangle perimeter; normals interpolate through cuts.

## Ledger

- `A29 Section planes, cutaways and elevation views` gains `tests/mesh-section.test.mjs` evidence; stays partial (open cut boundaries — no cap generation or section hatch/elevation rendering yet, no UI plane gizmo).

## Verification

- Slice: 3/3. Full suite run after this slice (see summary).

## Limits

Clipping is per-triangle without vertex welding (output is a triangle soup with duplicated cut vertices), and cut boundaries are left open (no cap generation).

## Addendum (same day): contour stitching and section area

- `stitchContours` orders section segments into polylines (quantized endpoint matching, collinear-run merging — triangulated faces otherwise leave redundant midpoints, 8 points for a square section instead of 4); `crossSectionArea` projects closed contours onto the plane basis and sums shoelace areas. Oracles: cube mid-section closes into 4 corners with area exactly 1; diagonal section area exactly √2; a missing plane yields zero.

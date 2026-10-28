# A29 section caps: watertight clipped solids (2026-10-27)

Kernel: `src/mesh-section.js` (`clipAndCap`, `triangulateContour`).
Tests: `tests/mesh-section-cap.test.mjs` (4/4, plus the existing
`tests/mesh-section.test.mjs` 4/4 unchanged).

`clipMeshByPlane` previously left section cuts open. `clipAndCap`
closes them: section segments are stitched with collinear merging
disabled (so cap edges align 1:1 with clipped wall edges — merged
caps leave T-junctions), each closed contour is ear-clipped in the
plane basis (`triangulateContour`, handles non-convex contours and
either winding), and cap triangles are wound to face away from the
kept half-space with the cap normal attribute set to `-n`.

Exact oracles:
- Capped half cube: divergence volume exactly 0.5; every directed
  edge (position-quantized) appears exactly once with its opposite
  twin (watertight).
- Diagonal plane x+y=1.1: capped triangular-prism volume 0.405;
  cap area 0.9·√2, matching `crossSectionArea`.
- Non-convex L contour (area 3): exact area, all triangle centroids
  inside the L, either input winding.
- The uncapped clip's open divergence is exactly 2/3 (missing cap
  term), and the two open halves sum to 1.

Failure found during testing: planes passing exactly through mesh
vertices create degenerate clipped triangles (pre-existing
`clipMeshByPlane` behavior); the test plane is offset to avoid
vertex-on-plane input, and zero-area cap ears from collinear
contour midpoints are accepted (verified harmless: watertightness
and volume oracles still hold exactly).

Limits: nested section contours (holes, e.g. a hollow tube cross-
section) are detected and rejected with an explicit error; no
multi-plane CSG; caps are flat (single plane per call).

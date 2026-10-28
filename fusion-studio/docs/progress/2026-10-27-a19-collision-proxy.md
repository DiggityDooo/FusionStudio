# 2026-10-27 — A19 collision proxy generation

## Landed

- `src/collision-proxy.js` — proxy fitting from point sets with a containment guarantee: Ritter sphere + farthest-point 1-center refinement, exact AABB, PCA OBB, PCA capsule; containment margins, worst-case containment check, and proxy volumes.
- `tests/collision-proxy.test.mjs` — 4/4: **every fitter contains every one of 400 random points**; cube-corner sphere recovers √3 (Ritter alone measured 2.34 — the 1-center refinement fixed it, containment never lost since radius is recomputed exactly each iteration); sphere-surface points recover radius/center; a 40°-rotated thin box gets an OBB < 60% of AABB volume with principal-axis alignment > 0.99; cylinder points get a capsule of radius ≈ 0.3 (0.327 measured — sample-PCA tilt, documented as statistical; containment exact) far tighter than the bounding sphere.

## Ledger

- `A19 Collision proxies and collision shapes` gains `tests/collision-proxy.test.mjs` evidence; stays partial (fitting only — no proxy-vs-proxy collision queries yet beyond what `src/rigid-body.js` uses, no convex hulls, no editor proxy tools).

## Verification

- Slice: 4/4. Full suite run after this slice (see summary).

## Limits

Sphere refinement is O(iterations × n); OBB is PCA-based (not the optimal rotating-calipers box); capsules fit a single principal axis.

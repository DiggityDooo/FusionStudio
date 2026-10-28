# A23 visibility kernel (frustum / occlusion / LOD / queue) — 2026-10-27

## Context

`src/realtime-engine.js`'s `frustumCull` is a cone test against the
forward vector (ignores aspect, bounding radius, and plane geometry) and
its `occlusionCull` is a 2D distance-plus-height check unrelated to the
camera. `generateLods` reports vertex counts without selecting anything
at runtime. New `src/visibility.js` provides the verified core; the
realtime-engine wrappers remain as-is (their shape-level tests still
pass) and can adopt this kernel later.

## Kernel + verification (tests/visibility.test.mjs, 8/8)

- `frustumFromCamera`: 6 planes from position/forward/up/fovY/aspect/
  near/far, each oriented against the frustum center point (a cross-
  product sign heuristic initially inverted all four side planes — the
  probe caught it, the inside-point orientation cannot).
- `classifySphere` / `classifyAabb`: inside/outside/intersecting via
  signed plane distances and the p-vertex test. Validated against a
  brute-force oracle: 300 random spheres × 400 surface samples each —
  'outside' verdicts have zero samples inside the frustum, 'inside'
  verdicts have all samples inside.
- `sphereOccluded`: angular-disc containment (separation + object disc <
  occluder disc, occluder strictly closer) — exact for opaque spheres and
  conservative. Includes the boundary case that corrected my own test
  geometry (14.1° + 2.8° < 17.5° is still hidden).
- `selectLod`: distance bands with ±hysteresis per edge; hovering at a
  band edge cannot oscillate, teleports settle immediately.
- `sortRenderQueue`: opaque grouped by material then front-to-back,
  transparent back-to-front, stable, non-mutating.

## Ledger

`A23 Occlusion culling and frustum culling` and `A23 LOD generation and
impostors` gain `tests/visibility.test.mjs`. Both stay partial: this is
the CPU visibility core — no GPU occlusion queries, Hi-Z, mesh
decimation for LOD generation, or renderer integration yet. Backup
refreshed (test-output/kernel-backup-2026-10-27).

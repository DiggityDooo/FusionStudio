# A16 character LOD skin reduction (2026-10-27)

Kernel: `src/skin-reduce.js`. Tests:
`tests/skin-reduce.test.mjs` (3/3).

LOD-tier skin shrinking over packed influence arrays
(indices/weights at a fixed stride): `pruneInfluences` drops
sub-epsilon weights, caps per-vertex influences, and renormalizes
with exact accounting of the dropped mass; `jointUsage` measures
per-joint weight mass and vertex counts; `selectJointPalette`
keeps the heaviest joints under a budget (required joints
reserved); `buildLodSkin` composes palette pruning with the
influence cap, sending orphaned vertices to the heaviest palette
joint.

Exact oracles: 0.5/0.8 and 0.6/0.99 renormalizations; dropped
mass 0.22 to the last epsilon drop; total joint mass equals the
vertex count; every output row sums to 1 within the influence
cap and palette. Testing caught a real bug: `buildLodSkin`
destructured `vertexCount` from the raw skin object (where it
does not exist) instead of the checked descriptor, silently
skipping the palette filter — fixed at the root.

Limits: skin data only (no mesh decimation or bone removal in
the skeleton — geometry LOD chains live in `src/retopo.js`),
fallback is global-heaviest joint rather than
nearest-in-space.

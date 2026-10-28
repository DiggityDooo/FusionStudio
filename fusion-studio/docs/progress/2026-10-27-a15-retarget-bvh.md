# Progress — 2026-10-27 — A15 retarget + BVH mocap

## Verdict

Skeleton retargeting and BVH mocap import landed with tests. A13 retarget closed. BVH is partial vs full mocap suite (no FBX/C3D). Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Retarget | `src/retarget.js` | Alias map, rest-relative pose, clip remap, spike cleanup |
| BVH | `src/bvh.js` | Parse, frame apply, timeline keys, scene import |
| UI | `src/animation-ui.js` | Retarget / Import BVH / Cleanup in Animation workspace |
| Tests | `tests/retarget-bvh.test.mjs` | 4/4 |

## Ledger

- A13 Rig retargeting → **done**
- A15 Retargeting → **done**
- A15 Mocap BVH/FBX/C3D → **partial** (BVH + cleanup only)

## Next

1. FBX mocap path or A15 motion matching / state machines
2. Or advance A17+ / Part B first open blocks
3. Do not mark 863-item goal complete

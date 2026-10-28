# Progress — 2026-10-27 — A21 compositor

## Verdict

CPU preview compositor landed (node tree, grading, LUT, effects, mattes, sequence, post volumes). All previously open A21 items moved to **partial**. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Compositor core | `src/compositor.js` | Tree/nodes/links, color spaces, RGBA buffers, AOVs, lift/gamma/gain, curves, LUT create/apply/.cube I/O, tonemap, bloom/grain, vignette/CA/sharpen/denoise, fog/DOF/vector blur previews, cryptomatte/key/roto, stabilize/matchmove stubs, sequence average, post volumes, `evaluateCompositor` |
| UI | `src/compositor-ui.js` | Rendering workspace panel |
| Tests | `tests/compositor.test.mjs` | `npm run test:compositor` |

## Honest limits

- Not a visual Blender/Nuke graph editor
- DOF / vector blur / matchmove are soft stubs
- Live-link is a flag only (no automatic render hook)
- OCIO config parsing still missing

## Next

1. A3 CAD baseline **or** deepen A19 fluids/pyro  
2. Wire render beauty EXR → compositor input  
3. Do not mark 863-item goal complete  

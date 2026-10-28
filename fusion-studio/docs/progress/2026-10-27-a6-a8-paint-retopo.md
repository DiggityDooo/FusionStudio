# Progress — 2026-10-27 — A6 retopo + A8 texture paint

## Verdict

Texture paint document/layers/channels/bake helpers and retopo session/auto/LOD tools landed with Shading + Modeling UI. Most A6/A8 items are **partial** (honest). Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Texture paint | `src/texture-paint.js` | Layers, UV strokes, procedural, smart masks, vcol, mat IDs, bake/cage, triplanar, seamless, atlas, engine export |
| Retopo | `src/retopo.js` | Snap, quad/strip, guides, density, auto-retopo, reproject, games/anim presets, LOD chain, loop hints |
| UI | `src/paint-retopo-ui.js` | Shading paint panel · Modeling retopo panel |
| Tests | `tests/texture-paint.test.mjs`, `tests/retopo.test.mjs` | `npm run test:paint-retopo` |

## Still open / thin

- Substance-style texture node graphs  
- Photo-to-material, de-lighting/stitching, virtual texturing  
- Live viewport paint brush raycast / stencil-clone  
- Production ZRemesher-quality auto-retopo  

## Next

1. A4 geometry nodes baseline **or** deepen A8 viewport paint  
2. A20 environments / remaining A19 fluids  
3. Do not mark 863-item goal complete (**230 done · 198 partial · 435 open**)  

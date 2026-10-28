# Progress — 2026-10-27 — A4 geometry nodes

## Verdict

Geometry-nodes tree authoring + preview evaluator (scatter/instances, attributes, noise/voronoi, curves, volumes/SDF, L-systems, city/road, zones, wrangles, cache) landed with Modeling UI. Most A4 items **partial/done**; no visual node editor yet. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Core | `src/geometry-nodes.js` | Tree/links/eval, attributes, scatter/instance, fields, curve↔mesh, volume/SDF, L-system, city/road, zones, wrangle, cache |
| UI | `src/geo-nodes-ui.js` | Modeling workspace panel |
| Tests | `tests/geometry-nodes.test.mjs` | `npm run test:geo-nodes` |

## Next

1. Visual node editor canvas (B11 / A4 UI)  
2. A20 environments using scatter/city nodes  
3. Deepen field math / VDB  
4. Do not mark 863-item goal complete  

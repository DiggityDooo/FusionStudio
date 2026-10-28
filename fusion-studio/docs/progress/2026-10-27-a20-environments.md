# Progress — 2026-10-27 — A20 environments

## Verdict

World/environment toolkit landed (terrain, foliage, water, sky/TOD, biomes, modular/prefab, partition, interiors, greybox, cull). Most A20 items **partial**; two marked done. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Environments | `src/environments.js` | Heightfield/splat/sculpt, foliage/wind/trees/rocks, water, sky/weather/TOD, biome/season, modular/prefab/HLOD/partition, assets catalog, decals, interior, floorplan, greybox, cull |
| UI | `src/environments-ui.js` | Layout workspace panel |
| Tests | `tests/environments.test.mjs` | `npm run test:environments` |

## Next

1. A21 compositor **or** A3 CAD baseline  
2. Deepen terrain GPU splat + volumetric sky  
3. Do not mark 863-item goal complete  

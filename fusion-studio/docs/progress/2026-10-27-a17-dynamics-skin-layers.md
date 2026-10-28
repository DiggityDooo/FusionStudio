# Progress — 2026-10-27 — A17 dynamics/fur/nodes + A16 skin layers

## Verdict

Hair collision/dynamics (Verlet + spheres), wave/braid/flyaways, fur-from-mesh, mask paint, procedural groom nodes, grass/feather/moss fields, and a skin layer stack (makeup/tattoo/scar/…) shipped with tests. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Dynamics / collide | `src/hair-groom.js` | `simulateHairDynamics`, `collideGuides` |
| Style ops | same | wave, braid, flyaways |
| Fur / fields / mask / nodes | same | `createFurOnMesh`, `generateStrandField`, mask paint, `runGroomNodes` |
| Skin layers | `src/skin-layers.js` | Stack + composite preview |
| UI | `src/character-tools-ui.js` | Dynamics, fur, grass, skin presets |
| Tests | `tests/hair-dynamics.test.mjs`, `tests/skin-layers.test.mjs` | `npm run test:character-tools` |

## Ledger

- **Done:** A17 frizz/flyaways/curl/wave/braid; grass/feather/moss strands
- **Partial:** A17 collision/dynamics, fur, mask paint, procedural nodes, wind/gravity; A16 skin layering; A19 hair sim / sphere collision proxies

## Next

1. A18 cloth tearing/buttons/cache or A19 rigid-body / particles (largest open FX block)
2. Harden A17 mesh SDF collision + Alembic groom export
3. GPU skin-layer paint / UDIM texture sets (A16)
4. Do not mark 863-item goal complete (**224 done · 148 partial · 491 open**)

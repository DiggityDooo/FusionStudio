# Progress — 2026-10-27 — A19 fluids / pyro / ocean / FX

## Verdict

CPU preview solvers for remaining open A19 FX domains landed (SPH/FLIP-lite, pyro/gas, ocean/foam, granular, vehicle, ragdoll, lightning, volumes, RT VFX). Previously open A19 items → **partial**. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Fluids / pyro / ocean / FX | `src/fx-fluids.js` | SPH, FLIP-lite, pyro grid, gas, ocean, foam, granular, vehicle, ragdoll, lightning, fx volume, particle render, RT VFX modules, ASCII density brick |
| UI | `src/sim-ui.js` | Clothing sim panel buttons |
| Tests | `tests/fx-fluids.test.mjs` | `npm run test:sim` (8/8) |

## Next

1. A22 / A23 (still fully open)  
2. Do not mark goal complete  

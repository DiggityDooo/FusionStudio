# Progress — 2026-10-27 — A3 CAD toolkit + ledger wire-up

## Verdict

NURBS kernel (already on disk) verified + extended with CAD toolkit (sketch, history, assemblies, sheet, BREP voxels, STEP/IGES curves, drawings, explode, configs, topo, FEA). All 19 A3 items now **done (1) / partial (18) / open (0)**. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| NURBS kernel | `src/nurbs.js` | `npm run test:nurbs` (18) |
| CAD toolkit | `src/cad-tools.js` | `npm run test:cad` (22) |
| UI | `src/cad-ui.js` | Modeling workspace panel |

## Honest limits

- Not Parasolid/ACIS; BREP is box+voxel
- STEP/IGES are curve-level text, not full B-rep
- Sketch/FEA/topo are preview solvers

## Next

1. A22/A23 or deepen A19 fluids  
2. Do not mark 863-item goal complete  

# Progress — 2026-10-27 — A14 skinning bind / auto-weights / mirror / DQ

## Verdict

A14 foundational skinning slice landed: smooth/rigid bind, heat/envelope auto-weights, weight mirror + transfer, hammer, scale/hammer brushes, dual-quaternion evaluator (tool-side). Ledger: run `node scripts/feature-ledger.mjs` after this doc. Goal remains incomplete (hundreds of open items).

## What shipped

| Area | Files | Evidence |
|------|-------|----------|
| Bind / auto / mirror / transfer / hammer / DQ | `src/skin-weights.js` | `smoothBind`, `rigidBind`, `applyAutoWeights`, `mirrorSkinWeights`, `transferSkinWeights`, `hammerSkinWeights`, `skinVertexDualQuaternion` |
| Brush modes | `src/skin-weights.js` | `scale`, `hammer` added to `brushEdits` |
| Character UI | `src/skin-weights-ui.js` | Auto heat/envelope, Mirror X, Hammer, LBS/DQ method; operators |
| Tests | `tests/skin-weights.test.mjs` | New bind/mirror/transfer/hammer/DQ case; prior suites still green (9/9) |
| Build | `npm run build` | OK |

### Ledger moves (honest)

**Done:** smooth/rigid bind; weight mirror/copy/transfer; weight hammer; painting modes now include scale (and hammer).

**Partial:** LBS+DQ (DQ evaluator + flag; viewport still Three.js LBS); auto-weights (heat-like + envelope; no geodesic voxel); clothing fit/proxy transfer (generic transfer exists; dedicated cloth proxy UI missing).

**Still open under A14:** skin clusters/layers; Delta Mush; wrap/cage/lattice; shrinkwrap; muscle; cloth deform; blendshape tooling suite; wrinkle/tension maps; skin-slide.

## Follow-up in same session — deformers

Also shipped `src/skin-deformers.js` + `src/deformers-ui.js` + `tests/skin-deformers.test.mjs` (4/4): Delta Mush, wrap, lattice, shrinkwrap, cage. Inspector DEFORMERS panel + operators. A14 deformer ledger items updated (sculpt continuous modifier still partial).

## What must be done next

1. **Remaining A14 opens** — skin clusters/layers; muscle; cloth deform; blendshape tool suite; wrinkle/tension; skin-slide.
2. **A15 Animation** — timeline/dope/graph already partial; push next.
3. Optional: DQ viewport shader; geodesic-voxel auto-weights; live shrinkwrap stack entry; skew deformer.
4. **Do not mark the 863-item goal complete** until every open/partial item has honest evidence.

## Commands used

```text
node --test tests/skin-weights.test.mjs
node scripts/feature-ledger.mjs
npm run build
```

# Progress — 2026-10-27 — A13 armature / FK–IK blend / constraints

## Verdict

A13 armature creation slice is landed and verified: biped/quadruped templates, add-bone, L/R pose mirror, FK/IK blend, stretchy limbs, constraints, layers, control shapes, custom attrs, twist joints, foot roll, and space metadata. Ledger audited after update: **863 · done 198 · partial 125 · open 540**. Goal remains incomplete.

## What shipped

| Area | Files | Evidence |
|------|-------|----------|
| Armature module | `src/armature.js` | Templates, orient +Y→child, mirror, constraints, twist, foot roll, stretch, layers, attrs, space |
| IK blend / extras | `src/ik.js` | `captureFkBases` / `applyIkBlend` / `evaluateRigExtras` on solve |
| Editor | `src/editor.js` | `addArmature`, `addBone` |
| Character UI | `src/rig-ui.js` | Armature panel + operators (templates, mirror, blend, constraints, layers, twist, foot roll, attrs, space) |
| Tests | `tests/armature.test.mjs` | 6/6 pass; IK/pose/limits suites still green (28 related tests) |
| Build | `npm run build` | Vite production build OK |

### Ledger moves (honest)

**Done:** skeleton/armature creation & orientation; FK/IK blend; custom attrs + rig panels; biped/quadruped templates; rig mirroring; rig layers; pose libraries + pose mirroring (mirroring added).

**Partial (not over-claimed):** IK solver family (still no spline/spring/HIK); constraints (parent/point/orient/aim/scale/copy/limit/follow_path/spring + IK pole; full child-of/spring soft-body not claimed); control shapes (metadata only); reverse foot (roll channel, not full bank/heel); twist (insert + distribute, not full PSD joint set); spine/tail (quad template only); face/auto-rig (creator/morphs, not Mixamo/Rigify/FACS); modular build (operators, no script API); stretchy limbs (IK scale); space switching (metadata, no drag handles).

**Still open under A13:** retargeting; ribbon/spline IK; muscle/flesh; jiggle; dynamic/soft-body bones; rig proxies; control-rig graph; facial rig transfer.

## What must be done next

1. **Finish remaining open A13 items** that are in scope for the next slice — prioritize **retargeting** (feeds Animation) or **ribbon/spline IK** if character spine work is blocking; otherwise leave muscle/jiggle/proxies/graph for later and move on.
2. **A14 Skinning** — first open A14 is smooth/rigid bind; LBS/DQ already partial. Inspect `docs/feature-ledger.json` A14 + existing `skin-weights` code before inventing a parallel path.
3. **Optional A13 UI smoke** — add `tests/armature-ui.cjs` mirroring `ik-ui.cjs` if Character panel regressions appear (unit coverage already exists).
4. **Do not mark the 863-item goal complete** until every open/partial item has honest evidence.
5. Continue A15+ and Part B (B1–B14) with the same small-diff + evidence + ledger discipline.

## Commands used

```text
node --test tests/armature.test.mjs tests/ik.test.mjs tests/pose-library.test.mjs tests/joint-limits.test.mjs
node scripts/feature-ledger.mjs
npm run build
```

# October 28 — Creator pose preservation during joint refitting

This local continuation repairs a character deformation bug while preserving the full Fusion Studio goal. It retains the previous LOD queue/source-workflow changes. No application/project version, bundled foundation identity, vendor installation or archived release changes in this follow-up. Evidence timestamps use October 29 UTC, still October 28 locally.

## Reproduced problem

The old HM08 creator refit temporarily reset joint quaternions but retained the current joint scales while rebuilding inverse bind matrices. The new binding absorbed those scales. It also overwrote local joint positions with landmarks, losing authored translation offsets. Even adding an explicitly zero-valued body control, which leaves neutral geometry unchanged, altered the posed surface.

The detailed adult fixture measured maximum vertex changes of **0.11540 m** for scaled joints, **0.02000 m** for translated joints, and **0.12403 m** when combined. The joint scale fields still displayed their prior values, hiding the loss of their actual deformation effect. Baseline/current comparison files: `test-output/code-review/creator-refit-before.json` and `creator-refit-after.json`. The baseline was reproduced from the committed pre-repair creator module.

## Repair and preservation contract

- Recover neutral local frames from the persisted inverse binds and mesh bind matrix, independently of the current pose. Move those frames by the change in verified source landmarks, retaining pre-existing rest offsets, axes and scales.
- Preserve authored joint translation offsets in local meters, and keep current quaternion and scale fields exact. Do not bake current pose scales into a newly generated neutral frame. Nonuniform owner transforms and nonidentity mesh bind matrices are accounted for.
- Validate the complete planned binding before installing any joint positions or inverse binds. Synchronize world matrices through `SkinnedMesh.updateMatrixWorld`, including its attached bind-inverse update, before evaluating vertices.
- Hydration reconstructs derived display geometry and populates the evaluation cache while retaining the stored binding and pose. A legacy binding that already absorbed scales is preserved as saved; the repair does not invent lost historical pose information.
- A failed body/appearance update restores the prior joint TRS and inverse binds before reconstructing the previous body. This avoids recovering old geometry against a partially updated rest frame.
- Invalid/singular bindings, incompatible hierarchy, or non-TRS neutral frames produce actionable errors. Detached creator rigs can retain their stored state on load; proportional refitting rejects explicitly and preserves the previous body/pose. Use a separate evaluated copy for unsupported skeleton structures.

This applies to the verified `makehuman-hm08` public creator family. It does not introduce Genesis/Character Creator controller parity, new joint axes, re-aiming, skin weights, corrective libraries or anatomical age/ancestry targets.

## Numeric and workflow evidence

- Build passes. The existing main-bundle warning remains (approximately 2.306 MB JavaScript, 640 KB gzip).
- **1,101/1,101** discovered unit tests pass, with zero failures, skips or cancellations, in 91.21 seconds. Final log: `test-output/code-review/creator-refit-final-suite.log`.
- Seven focused tests in `tests/creator-rig-refit.test.mjs` pass. On both adult presets, an unchanged body retains all checked full-mesh world positions exactly, including a translated and nonuniformly scaled arm under a rotated/nonuniform owner.
- Height/body changes are compared against an independently constructed landmark binding and weighted skinning reference. The test checks every body vertex and rest-joint landmark, including a nonidentity mesh bind matrix. It verifies preserved authored rotations/scales instead of comparing two calls to the same refit routine.
- Legacy scaled bind frames survive three compact save/reload cycles and a zero-valued control edit without changing the evaluated body. JSON's signed-zero normalization is excluded from the stored-number equality comparison; other inverse-bind values are retained.
- Undo/redo, compact project reload, invalid-binding atomicity, late appearance failure and unsupported detached-refit recovery pass.
- An actual `Editor.glb` body export passes the installed glTF validator with zero errors. Reloaded translated/scaled skinning differs by at most **1.7851e-7 m** across the full body. Textured eye/brow attachments are outside this numerical Node probe; full Electron delivery/render tests include them.
- Female desktop evidence: `test-output/character-lods-1793252745245/results.json`. Male desktop evidence: `test-output/character-lods-1793252904225/results.json`. Each uses a 19,158-source-vertex foundation and 26,756-triangle body, a custom shape, contrapposto, arm scale `(1.2, 0.8, 1.1)` and a 0.02 m joint translation offset. Real worker LOD generation, undo/redo, project reload, GLB delivery and Cycles rendering pass.
- The same desktop workflows edit body fat to 0.65 and verify changed neutral geometry while preserving arm scale/quaternion fields and the translation offset. Regeneration retains older artist-edited copies, adds one completed history action, reopens and exports. Sampled corresponding skinned/morphed LOD vertex errors remain zero. Eleven material sidecars and one embedded bump map reach Cycles.

All generated evidence remains local in ignored `test-output/`; no new paid content or decompiled material is included. Existing private Genesis, BMW and vendor-preservation reports retain their original dates and scopes; those broader checks were not rerun for this family-specific repair.

## Actual interactive limits

`tests/creator-interactive-performance.cjs` measured the built Electron application at a **1036 × 729** viewport on `2026-10-29T05:50:43Z`. Source report: `test-output/creator-interactive-performance.json`. The prior report was preserved under `test-output/code-review/creator-interactive-before-refit.json`.

| Character preview | Scene triangles | Warm worker-to-visible previews | Completed edits | Average orbit |
| --- | ---: | --- | --- | ---: |
| Bald | 69,212 | 42.8 / 99.8 / 37.6 ms | 526.6 / 524.1 / 533.1 ms | 53.15 fps |
| Short hair | 437,212 | 37.2 / 112.5 / 32.5 ms | 616.0 / 587.9 / 632.0 ms | 52.57 fps |

The warm measurements start at the real worker post and include a subsequent visible frame; they exclude the 100 ms input debounce and gesture-boundary snapshots. Completed edits include worker/refit/appearance/history and a subsequent animation frame. One short-hair preview misses 100 ms; all measured completed transactions exceed it. Orbit exceeds 30 fps in this probe. These results do not satisfy the complete 50k/100k/200k body/control performance matrix, and they do not establish multiple-character, garment or final-render interactivity.

The male full-body Cycles image was inspected: the body remains intact, with the intentionally scaled limb, but skin and facial shading still lack professional detail. Portrait/full-body realism, general pose/contact quality and the complete original roadmap remain unfinished. This is a correctness repair, not a realism or release sign-off.

Reproduce with `npm run build`, `npm test`, `node --test tests/creator-rig-refit.test.mjs`, `npm run test:character-lods`, and `node tests/creator-interactive-performance.cjs`. Set `FUSION_LOD_SEX=male` to run the public desktop workflow with the male preset. No packages or new asset libraries were installed.

# Worker preparation for linked garments

Status: **0.19.0 source, unreleased; Inspired Fusion behavior.** This follows the [plain-pattern Apply upgrade](2026-10-16-pattern-apply-workers.md). The full unified excellence goal remains active.

## Implemented behavior

Non-fitted linked garments now grade, triangulate, arrange initial vertices and prepare fabric/rest coordinates in the cancellable preparation worker. The main thread captures the evaluated body, colliders and world transform; the worker receives plain immutable inputs rather than a live character. The shared protocol checks project/object IDs, revision, request ID and input hash. Body shaping, posing and panel edits continue through the same scene evaluator and atomic garment transaction.

The retained garment stays available during computation. Cancellation, worker loading failure, foreign replies and expired revisions terminate preparation and restore the prior scene, selected object, frame and history. Source dimensions are copied into the capture so later authoring changes cannot mutate an in-flight body's grading inputs.

The existing synchronous numeric entry point remains for references and process tests. The UI uses the worker. Five pre-refactor preparation hashes remain exact for legacy geometry, current geometry, a detailed 6,222-triangle pattern, a transformed character and optional physical-material settings. Existing native preview geometry and cloth equations are unchanged.

A desktop check also exposed a prior history issue: snapshot undo/redo reset the active timeline frame to 1. History restores now preserve the current frame without re-evaluating or overwriting the saved pose. Direct project restore retains its reset behavior, followed by the project's saved timeline settings. A numeric regression checks both behaviors, and the detailed garment test exercises undo/redo at frame 9.

These frame checks cover undo/redo at the same playhead position. Broader animation/history reconciliation after scrubbing remains unverified.

Clothing also exposes **Drape settings** for preview garments: 1–240 simulation steps and 1–24 solver iterations, applied with a single undoable re-drape. Fitted previews honor the selected values; optional physical fabric keeps its existing Fabric response controls. Cancellation restores the previous settings and drape. Invalid values, transformed linked garments and missing targets fail explicitly.

The broader procedural regression found that a 2.1 m body at the default 160 steps / 10 iterations exceeds the existing native proxy-work budget. Preparation now reports that limit before launching the solve, with an explanation of the available settings; it never silently reduces solver quality or changes the native cap. Choosing six iterations explicitly lets the same body-height workflow complete. The desktop test verifies the failed request retains the original scene, then changes the real controls, checks their undo/redo and completes shaping, posing, panel editing, reopen and rendering. The older warning assertion was updated to recognize the current folds/seams/layered-contact warning.

## Evidence and practical limits

The detailed module-worker test uses a private 50,312-triangle Genesis scene and 6,188 garment triangles. Real preparation cancellation, stale revision, missing-module failure and foreign reply each leave scene SHA-256, history, frame and selection unchanged. Every worker closes. The actual browser-worker output has the same SHA-256 as independent execution of the numeric reference on the captured inputs. Success makes one history entry and survives undo/redo and save/reopen; the source project bytes remain unchanged.

That test intentionally runs **five simulation steps** to exercise preparation and transaction recovery quickly. It is **unconverged**: 71.6 mm seam gap, 26 body/cloth face intersections, two cloth vertices inside the body and 303% maximum local strain. Clothing visibly says **Needs refinement**. Neither its successful execution nor its 25.57° rest-mesh angle is a fit-quality pass. The separate fitted rounded-shirt workflow remains the current fit-quality evidence.

The recorded preparation/placement/five-step solve/commit workflow takes 2.32 seconds, with 158 frame samples and a largest observed 370.1 ms frame gap. Body extraction, request hashing, snapshots and final scene construction still run on the main thread. These numbers do not establish interactive draping or improvement at every phase. Preparation retains its 20-second timeout; native geometry and offline fitted-drape limits are unchanged. The separate older Blender cloth-bake `patternPayload` path still reconstructs patterns on the main thread.

186 JavaScript tests pass, including the independent pre-refactor hashes, bounded settings/work checks and the frame/history regression. The detailed worker recovery test, mixed-history foundation desktop test, procedural body/pose/panel workflow and detailed Genesis pose-placement/save/reopen/render regression pass. Detailed settings checks include fitted previews, retained surface references, cancellation and undo. The build passes with the existing bundle-size advisory. Rust and render-worker source are unchanged; the native module retains the preceding 32-test checkpoint. No new dependency is introduced.

## Reproduction and preservation

`npm run test:drape-preparation` runs numeric preparation/placement tests and the detailed desktop recovery test. `npm test` includes the new numeric regressions. Existing `tests/foundation-ui.cjs`, `tests/hybrid-ui.cjs` and `tests/garment-placement-ui.cjs` cover broader history/body/pose/render behavior.

Private results remain in `test-output/drape-preparation-*`, including unit, serialization, default regression, build, desktop recovery, history, hybrid, placement and preservation logs; `drape-input-before-worker.json` records the original preparation hashes. `drape-preparation-ui-first-results.json` retains the first measured run above. The desktop report names its saved project and runtime. The test code contains original fixtures and private local references, not proprietary mesh data.

Original installations and the immutable inventory baseline remain untouched. Verification continues to report zero changed/missing baseline files, matching sampled hashes and the same three extra DAZ-to-Maya paths, so strict preservation remains false. Prior releases, the source Genesis asset and the private reference project are retained. No 0.19 package or public distribution is produced.

Remaining work includes scene/history responsiveness, the older bake payload path, garment boundary/thickness finishing, robust ordered layers, animated colliders, calibration, dense performance and the broader character/modeling/render/interchange roadmap.

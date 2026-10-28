# October 27 — Animation, sculpt and weight integrity repairs

This continues the authorized Fusion development and bug-fixing goal. The work addresses reproduced data-loss and editing failures in the existing application. It preserves the current Electron/Three.js, native geometry and persistent Blender architecture. The application version remains 0.1.0; no release archive, original installation, source asset, commit or publication was replaced by this checkpoint.

## Implemented behavior

| Area | Behavior and preservation contract |
| --- | --- |
| Animation library | Clip application retains unrelated objects and keys outside the target interval. Existing keys within the target interval require a concrete replacement review; cancellation leaves the timeline/history untouched. Missing target objects and a timeline changed during review produce actionable errors. Applying and evaluating the result is one recoverable history transaction. |
| Curve identity | Interpolation and Bezier handles resolve per object track, with legacy frame-level metadata retained as a fallback. Merging clips or BVH tracks cannot make another object's held curve linear. Source clip definitions are copied rather than edited. |
| Key reduction | Simplification checks original samples against retained endpoints, including morphs, numeric controls, custom shape values, IK targets/poles/enabled state and quaternion angular error. Nonlinear boundaries and unknown channels are retained. A two-million-comparison limit fails before replacing the timeline. |
| Exchange interpolation | Uniform LINEAR and STEP tracks retain their interpolation. Eased and mixed curves use four samples per source frame; mixed hold transitions use adjacent Float32 timestamps. These are explicit approximations, reported before exchange and in the GLB scene's versioned animation report. Editable curves remain in Fusion projects. |
| Evaluated motion | NLA mapping, procedural cameras and persisted follow paths route through evaluated sampling. Existing rig/character dependency baking retains its timeline-rate sampling contract. Sampling suppresses events and restores pose, frame, playing state, direction, accumulator, mixer time and action flags, including on failure. Camera matrices are refreshed after procedural evaluation. |
| Timeline persistence | Versioned metadata retains start/end, FPS, interpolation defaults, loop mode, speed, auto-key and onion settings through history/projects. Follow paths retain their control points and settings. Malformed settings, paths and keyed data reject before replacing an open scene. Retiming that would collapse keys onto duplicate frames rejects without discarding them. Single-frame pingpong is bounded. |
| Blender timing | Real interchange exposed a one-frame offset: Fusion frame 1 is glTF time zero, whereas Blender imports zero seconds at frame 0. `scripts/animation_time.py` reads bounded, explicitly identified Fusion timing metadata and translates newly imported actions/handles and stashed ranges. It preserves seconds at a different delivery FPS. Third-party files without this sidecar retain their ordinary import convention. The helper is included and unpacked by future release configuration. |
| BVH failure recovery | Parse/resample and merge preparation happen in a staging scene. Invalid destination animation cannot leave a partially imported live armature. |
| UV sculpt stamping | Stamps use both UV coordinates, signed strength, radial falloff and a bounded optional grayscale raster. Missing normals are computed on a geometry copy. Topology, UVs, material groups and source buffers remain intact. Masks protect edits; explicit source-vertex copies receive coherent displacement and the strongest seam mask. Invalid or diverged mappings reject before replacing geometry. |
| Protected sculpt sources | Native scenes, modifier stacks, generator/garment links, skinned meshes and shape keys require an explicit static working copy. The existing copy control remains available. A successful stamp is one history transaction and survives project reopening. No automatic topology conversion is introduced. |
| Bulk skin weights | Auto, mirror, hammer and transfer preserve locked influence mass across material copies. Automatic weights only consider joints present in the actual mesh skeleton. Missing or ambiguous transfer mappings reject before replacing geometry. Envelope fallback chooses the nearest capsule rather than the first zero-scoring joint. |
| Weight spatial queries | A bounded immutable KD index replaces quadratic nearest scans for mirror/transfer. Independent brute-force comparisons establish nearest results, cutoff behavior and deterministic ties. This improves spatial lookup, not every cost of full skin validation and rewriting. |

Principal sources: `src/animation-data.js`, `src/animation-export.js`, `src/animation.js`, `src/timeline.js`, `src/animation-ui.js`, `src/editor.js`, `src/compatibility.js`, `src/sculpt-advanced.js`, `src/paint-retopo-ui.js`, `src/point-index.js`, `src/skin-weights.js`, `scripts/animation_time.py`, and `scripts/blender_worker.py`.

## Verification

- Final discovered suite: **1,013 tests passed**, zero failed/cancelled/skipped; about 95 seconds. Log: `test-output/code-review/animation-delivery-suite.log`. Blender fixture tests were run with normal temporary-file access. An earlier restricted review run's fixture-save failures were environmental; they were not counted as passing.
- Normal production Vite build passes. The existing approximately 2.22 MB main-bundle warning remains. No additional ineffective-dynamic-import warning remains.
- The assembled desktop animation/sculpt workflow passes on **101,888 triangles / 51,657 vertices**: actual clip capture/application, replacement review/cancellation, unrelated-track retention, undo/redo, morph-peak reduction, GLB validation and reimport, UV stamping, and project save/reopen. Evidence: `test-output/animation-sculpt-1793151027396/results.json` and `workflow.png`.
- That GLB is 2,894,460 bytes, retains STEP interpolation and a morph target, and differs from the Fusion reference by at most approximately **1.91e-7** in the checked transform/morph values after Three.js reimport. Khronos validation completes with **zero errors**, two non-blocking material warnings for emissive-strength settings with a zero emissive factor, and two unused-UV informational messages. Warnings were retained in the report.
- The actual Blender 5.2.0 LTS importer, through Fusion's worker import function, matches independent transform/morph reference frames at 24 FPS and the corresponding times at 30 FPS. Largest measured checked error is approximately **4.77e-8**. Evidence: `test-output/code-review/animation-blender-final.json`. This checks numeric interchange, not final portrait/render quality.
- The previous desktop regression workflow also passes on the final build: BVH units/import, animation retention, topology-based selection, nested skin binding, undo/redo, collections/units/snap persistence, save/reopen and GLB serialization. Evidence: `test-output/review-ui-1793151038932/results.json`.
- Syntax/whitespace checks and the feature-ledger structural audit pass. Runtime configuration tests verify that every required Blender helper, including the new timing adapter, is present, included and unpacked. No packaged release is claimed.

## Measured costs and limits

- A 100,352-triangle / 50,629-vertex UV stamp took about **65 ms** in the focused CPU run, including validation, normals and bounds. This is one measurement, not a general interactive guarantee. Stamp input is bounded to 300,000 vertices.
- Building the spatial index for 50,000 points took about **46 ms**; 1,000 nearest queries took about **5 ms** in the focused run. Brute-force reference tests also cover non-exact points and distance cutoffs.
- The full detailed auto-weight/lock-validation fixture, 15,617 source / 31,234 split vertices, took about **1.03 seconds**. Bulk skin tools therefore do **not** satisfy a 100 ms interactive target as a whole. Validation, hashing, geometry replacement and worker scheduling need further work.
- Curve exchange and evaluated baking have explicit sample budgets. Sampling is not a lossless representation of arbitrary continuous curves; preserve the Fusion project and inspect the compatibility report.
- NLA remains a source-frame remapping subset, rather than a fully mixed animation-layer system. Motion-path visualization is implemented; onion ghost meshes are not established by a stored frame list.

## Feature-matrix corrections and remaining goal

Twelve additional overstated sculpt entries were returned to partial. Layer records with null deltas, an IMM descriptor, a GPU-budget flag, a projection-source record and similar helpers are not completed editing workflows. The stamp is now an evidenced UV-based implementation, while complete stencil placement/authoring and brush-stroke parity remain partial.

The ledger has **860 unique entries: 399 done labels / 461 partial labels**. The reference parser counts **863 occurrences: 402 done / 461 partial**, because three labels repeat. These are bookkeeping labels, not proof of professional readiness.

The broader requested goal remains active and incomplete. Real sculpt-layer capture/mixing, general native-format fidelity, broader character/garment acceptance, professional visual review, additional real UI integrations and packaged-release gates still require work. Dense generated fixtures do not replace anatomical, portrait, layered-cloth or proprietary-source acceptance. Existing detailed Genesis regression fixtures are local-only evidence; no private asset was added to distributable material.

This checkpoint did not rerun the installation inventory. The previous preservation report and its documented pre-existing DAZ additions remain intact; original installations and assets were not edited by these repairs.

## Reproduction

Use a configured Node runtime and the existing installed Blender:

```text
npm test
npm run test:review-regressions
npm run test:animation-integrity
```

For the separate Blender timing gate, run `tests/animation-exchange-blender.py` in background factory-startup Blender with `-- <generated Animation integrity.glb> <new report.json>`. The desktop result JSON records the generated GLB path. No vendor scene or paid content is needed for this gate.

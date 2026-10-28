# October 27 — Sculpt layers, editor recovery and geometric snapping

This checkpoint continues the user's full integrated Fusion Studio goal and fixes the failures identified in the code review. It does not redefine that goal around the features below. The Electron/Three.js interface, Rust geometry core, persistent Blender worker, original installations, private libraries and previous releases remain in place. The development application remains version 0.1.0 with project schema 2. No commit, push or new release package was made.

## Implemented behavior

| Area | Current behavior and preservation contract |
| --- | --- |
| Sculpt layers | Version-2 documents retain an immutable base, stable topology/source identity and sparse per-layer displacement. Signed strengths mix from retained data; editing never repeatedly bakes previous evaluations. Active selection, visibility, locks, rename, duplication, removal and ordering are available in the Sculpting UI. |
| Layer gestures | Brush strokes, UV stamps, mesh filters, native component transforms and supported deformers record into the active layer. Range previews coalesce, retain the last consistent source, commit once, and cancel exactly. Locked/hidden/zero-strength authoring and incompatible topology changes reject before mutation. |
| Layer persistence | Undo, save/reopen and malformed-document recovery are covered. Old inert layer records load unchanged and migrate explicitly, retaining their original metadata. Exchange preserves the evaluated surface; editable layer recipes remain in Fusion projects with a compatibility warning. |
| Static/source boundaries | Layer editing uses static mesh cages. Native scenes, rigs, generator recipes, garment links and shape-edit copies retain their working-copy protections. Material-split siblings are explicitly warned about: layers currently affect one Mesh, so border edits can open seams. Source arrays, normalized attributes, UVs and material groups are retained. |
| Native component transforms | Rust transforms retain unused vertices and their order, with identity attribute remaps. JavaScript validates finite positions, faces, remap counts/weights and explicit transform identity before accepting results. This prevents topology-preserving edits from silently losing source correspondence. |
| Wrap/shrinkwrap | Corrected scratch-vector aliasing that selected the first triangle and blended from overwritten coordinates. World-space nearest queries now use a BVH over evaluated target vertices, including skin and morph deformation. Strength and normal offsets work; bad targets and singular transforms reject without partial source writes. |
| Neutral character authoring | Fixed the batching guard that rejected every real shape-edit brush stroke. Only the active, project-owned neutral copy may receive staged edits. Native component transforms now work in that session, and the Character workspace exposes component controls. Apply captures one parent transaction and preserves the character's other controls/pose. |
| Shape recovery | Dyntopo/topology-changing shape brushes reject before editing. Stale, cancelled, malformed and failed component replies retain the previous neutral cage. Escape cancels an active neutral stroke first; a later Escape can cancel its session. Project disposal invalidates and removes abandoned copies. |
| Mask history | Clear/Invert buttons and shortcuts use one validated operator. They isolate shared geometry, retain normalized mask values correctly, commit one actual change, update dirty/autosave state, and survive undo/reopen. No-op clearing adds no history. Shape-session masks remain on the neutral staging copy. |
| Stroke recovery | Failed history capture and unsupported Simplify restore the exact retained geometry and layer document. The earlier path cleared its recovery snapshot before a failing commit could restore it. |
| Geometric snapping | Vertex, edge, triangle-center and nearest-surface modes now query evaluated scene geometry instead of substituting a fixed increment. The source hierarchy, invisible targets, hidden material faces, local-view exclusions and locked collections are filtered. World/local drag axes constrain movement. A visible target marker and a 20-pixel world-distance range support object-origin translation. |
| Snap lifetime/history | Target snapshots retain source identity and reject changes in geometry, pose, transforms, project or revision. A complete target-inventory check permits reuse across drags. Real transform gestures produce one history entry; Escape restores the starting transform without one. Workers and other operators cannot overlap a live gizmo gesture. |
| Pipeline UI honesty | Descriptor-only Live Link, build, scanning, AI, collaboration and other sample controls now identify their scope and stop reporting nonexistent external success. Configuration previews do not mark a connection active. Normal/Gimbal orientation labels disclose their existing local-axis approximation. |
| Measured profiling | Replaced fixed example numbers with actual viewport draw/triangle/line/point counters and timed CPU render submission. The previous renderer counter-reset setting is restored. GPU timing remains explicitly unavailable. |

Principal new modules are `src/sculpt-layers.js`, `src/sculpt-layers-ui.js`, `src/shape-session.js`, `src/sculpt-mask.js` and `src/geometry-snap.js`. Integration also changes the existing editor, character UI, component editor, evaluator, operator registry, foundation, keymaps and pipeline panel. Proprietary pseudocode was not copied into these implementations.

## Final verification

- Normal Vite production build passes. The existing large-main-bundle warning remains; the final main bundle is approximately 2.26 MB before gzip.
- The complete discovered unit suite passes **1,055/1,055**, with zero failures, cancellations or skipped tests, in about 113 seconds while desktop checks also ran. Log: `test-output/code-review/gesture-snap-final-suite.log`.
- The unchanged Rust core from the layer checkpoint passed **38 tests**, with one pre-existing manual private-fixture benchmark ignored. Its build/test evidence is `test-output/code-review/sculpt-layers-native-build.log`; this is not a newly repeated native build in the gesture checkpoint.
- `tests/gesture-snap-ui.cjs` passes on the normal build with **101,888 triangles / 51,657 vertices**. It checks actual mask buttons and keyboard shortcuts, autosave, undo/reopen, real pointer drags for all four geometric snap modes, an off-grid vertex result, target feedback, warm index reuse, Escape cancellation, operator locking, measured viewport counters and truthful preview state. It then moves the full **19,158-vertex neutral character cage** with the native component UI, applies **76,632 sparse delta values** as one new transaction, checks undo/redo, and cancels a real neutral brush stroke. Evidence: `test-output/gesture-snap-1793168073808/results.json`.
- Existing sculpt-layer, animation/sculpt and general desktop regression drivers pass against that same final build. Evidence directories: `test-output/sculpt-layers-1793168147350/`, `test-output/animation-sculpt-1793168166129/` and `test-output/review-ui-1793168177281/`. These cover layer changes, source attributes, component transforms, GLB validation, source retention, animation interchange, rig binding and project recovery in their stated scopes.
- Character recovery passes at `test-output/creator-recovery-1793168374354/`. The driver now injects failures into `Worker.prototype.postMessage` on the real persistent worker. Replacing the constructor missed an already-created worker and previously timed out without exercising cancellation. Cancellation, stale replies, malformed results, retry and shape-session cancellation now compare actual scene/history state.
- The existing detailed character workflow passes on the final build, including neutral sculpting, shape undo/redo, controls, save/reopen, validated exchange, hair fitting and both Cycles portrait jobs. Evidence: `test-output/character-creator-1793168391791/` and `test-output/character-creator-ui-results.json`. Two portraits do not establish the broader realism matrix.
- Both user-provided BMW fixtures pass CPU/OptiX native-versus-preserved scene comparisons at **640×360 / 16 samples**. Mean absolute byte differences are approximately **0.00004196 CPU** and **0.00003906 OptiX**, with maximum difference 1 byte. Source SHA-256 and modification time are unchanged. Evidence: `test-output/bmw-render-1793168394958/` and `test-output/bmw-render-results.json`. This is a bounded fidelity regression, not the original BMW benchmark workload or proof that generic GLB shaders are lossless.
- Installation preservation scan: **34,837 baseline / 34,857 current files**, **zero changed**, **zero missing**, **15/15 bounded hashes matching**. The same **20 pre-existing additions** remain; none is newly added relative to the preceding report. The strict aggregate remains false and the baseline was not altered to hide this. The prior generated report is retained at `test-output/code-review/preservation-before-gesture-snap.json`.

## Measured costs and explicit limits

- Dense edge index: **101,888 triangles / 153,542 edges**. The original sorting implementation took roughly 1.2–1.6 seconds to prepare. Contiguous bounds, median selection and numeric edge keys reduce preparation to about **339 ms** in the focused run, **396 ms** in the concurrent final suite. Thirty nearest queries take about **17–18 ms total**. Matching indexes are reused between drags, but first preparation remains synchronous CPU work and is not claimed latency-free.
- Geometric snapping is bounded to **300,000 target vertices**, **300,000 target triangles** and **450,000 target edges**. Exceeding a budget produces an explicit diagnostic instead of a fixed-grid fallback. Instanced targets are reported as unsupported. Object-origin translation is implemented; component snapping, custom pivots, a complete 3D cursor, native polygon-center identity and target-normal alignment remain unfinished. Triangle-center mode is labeled accordingly.
- The final layer fixture has **102,400 triangles**. Enable/author/history costs about **305 ms**; five full strength previews cost about **17.5–31.5 ms** each. Layers are bounded to **300,000 cage vertices / 32 layers / 1,000,000 total sparse delta vertices**. They are per static Mesh and do not yet support layer animation, cross-material-part authoring, multires remapping or GPU sculpting.
- The local detailed Genesis check retains the original source/rig and file hash. Its static working copy totals **50,312 triangles**, while the specific layered material part has **8,350 vertices / 15,416 triangles**. This is not acceptance of unified whole-character seam editing.
- A **6,305-source-vertex / 101,888-target-triangle** wrap checks **498,551 triangles instead of 642,403,840 brute-force pairs**. The concurrent final run still takes about **973 ms** end to end. Wrap remains a bounded CPU operation, not a live GPU deformer.
- History retains the existing 60-million-character snapshot budget. Dense edits can prune older entries, so acceptance counts the single newly added transaction and verifies its actual undo result rather than assuming the cursor always increases numerically.
- The viewport profile fixture measured **15 draw calls / 206,862 submitted triangles / about 1.10 ms CPU submission**. This is a single sample including render passes/helpers; it is not a GPU time, full-frame FPS or general performance guarantee.

## Remaining full-goal work

The unique feature ledger remains **399 done labels / 461 partial labels**; no status was promoted merely for adding a descriptor or passing these narrower checks. Ledger counts are bookkeeping, not a percentage of professional readiness.

The generated portraits still need substantial improvement and review across full bodies, close-ups, varied proportions, light-to-deep skin tones, all included hair categories, expressions and poses under neutral/directional lighting. The public starter and private-character acceptance matrices remain incomplete. The visible skin/hair results are not yet a professional-realism sign-off.

General native `.ZPR` editing, broad native CAD/CC/Marvelous fidelity and lossless roundtrips remain incomplete. Full garment/animation production quality, native dependency capture, dedicated Normal/Gimbal handles, complete node/sculpt/paint coverage, real external pipeline connections and the other roadmap requirements remain active. A new integrated release must wait for their required acceptance rather than inheriting a passing label from these workflows.

## Reproduction

```text
npm test
npm run test:sculpt-layers
npm run test:gestures
npm run test:animation-integrity
npm run test:review-regressions
node tests/character-creator-recovery.cjs
node tests/character-creator-ui.cjs
npm run test:render-fixtures
```

Use the configured Node/Blender runtimes and normal temporary-file access for native desktop/render fixtures. Detailed private fixtures stay local; only verified redistributable foundation data and original generated geometry are used in distributable material.

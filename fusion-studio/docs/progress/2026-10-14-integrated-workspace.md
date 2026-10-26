# Integrated modeling, character and garment upgrade — 2026-10-14

## Delivered behavior

Fusion Studio 0.9.0 keeps modeling, imported character shaping/posing, editable sewn clothing, modifier evaluation, save/reopen and Cycles rendering in one scene and interface.

- `src/evaluation.js` carries project ID, object ID, document revision and an input SHA through dependent work. Superseded results are rejected. Transactions restore the prior scene after cancellation, malformed replies or worker failure.
- `native/src/edit.rs` and `src/component-edit.js` add vertex/edge/face, box and connected selection; component transforms; split, dissolve, merge-by-distance, delete and region extrusion. Responses carry vertex/face source mappings used to rebuild materials and UV attributes.
- `src/modifier-stack.js` evaluates ordered Blender-backed stack entries from a retained source snapshot. Add/update/toggle/duplicate/move/remove and Apply are one-step scene transactions.
- `src/deformation.js` retains sparse morph deltas and stable source-vertex mappings across material-split viewport meshes. Its non-executable formula evaluator supports bounded arithmetic plus linear and TCB spline stages, orders dependencies, detects cycles and reports unsupported operations. Morph controls support search, categories, limits, reset and keys; pose-driven correctives share the same evaluated character state.
- Pattern schema 2 uses stable segment IDs for line/cubic boundaries, holes, internal lines, partial-edge seams and darts. Legacy polygon patterns migrate deterministically. Refinement preserves segment chains and seam correspondence. The preview worker is debounced and cancellable.
- Rust XPBD now includes directional warp/weft/shear compliance, bending, friction, triangle-body contact, triangle self-collision, swept vertex/face roots and swept edge/edge contact. The last valid garment remains visible until a new result succeeds. UI diagnostics show seam gap, strain, clearance/penetration and triangle quality.
- New project documents use schema 2 with a stable project ID and evaluation manifest. Schema-1 documents migrate in memory and are saved to a new versioned file.

## Measured acceptance

- Rust native tests: 6 passed, including fast vertex/triangle crossings, swept edges, moving triangles, topology edits and BVH checks.
- JavaScript core suite: 33 tests passed after adding formula/deformation, schema-2 patterns, revision handling and detailed mesh fixtures.
- Modeling fixture: 18,865 vertices / 36,864 triangles; split and component transform completed in roughly 0.23–0.29 seconds in the recorded run.
- Pattern fixture: 12,458 vertices / 24,616 triangles in roughly 2.6 seconds. Boundaries and the hole do not cross. Minimum triangle angle is 4.79°, which is below a professional quality target and remains an explicit warning.
- Character fixture: Genesis 9 imports as 7 material meshes, 50,312 triangles and 138 bones. Sparse evaluation covers 318 nonzero source deltas and rebuilds evaluated collision triangles in about 44 ms.
- Integrated desktop workflow: Genesis 9 import → morph → forearm pose → linked sewn panel edit → beveled accessory stack → schema-2 save/reopen → 640×360, 16-sample CPU Cycles render. Linked 882-vertex / 1,536-triangle cloth uses the full evaluated Genesis triangle collider and took about 9.3 seconds for 160 steps. Residual results included 3–4 clearance violations and maximum local strain above 160%, so the result is retained for inspection and is not labeled production-ready.
- Existing DSON, IK, worker reuse/crash, BMW CPU/OptiX and installation-preservation checks remain release gates.

The final packaged executable is `release-v0.9.0/win-unpacked/Fusion Studio.exe`. It passed the packaged general worker/save/BLEND/Cycles/cancellation test plus packaged deformation, pattern-v2, integrated modeling and full Genesis/garment workflow runs. The parent workspace launcher is `Launch Fusion Studio 0.9.0.lnk`; previous release folders and launchers remain untouched.

Reports are written under `test-output`, including `integrated-ui-results.json`, `pro-workflow-results.json`, `dson-integration-results.json` and the pattern/deformation UI reports.

## Reverse-engineering evidence boundary

CursorWork exports were preserved. The exporter now writes UTF-8, reports individual function failures, resumes partial runs and creates a strict completion manifest tied to the binary hash and function counts. A clean Ghidra 12.1.4/PyGhidra smoke export passed the 10 protocol tests. Focused static evidence identified DAZ evaluator, Character Creator morph and Marvelous pattern/sewing surfaces; it did not establish algorithm parity. Addresses, versions and evidence limits are recorded in `research/cursorwork-evidence-2026-10-14.md` and `research/cursorwork-revalidation-2026-10-14.json`. Proprietary pseudocode and paid assets are excluded from Fusion source and packages.

## Remaining roadmap work

This release does not complete full feature parity with the four reference programs. Remaining areas include retopology, curves/NURBS, advanced sculpt/paint/UV/node systems, auto-rig and weight authoring, joint limits/full-body controls, exact DAZ HD/joint/graft/shader behavior, native Character Creator and Marvelous project readers, production-quality layered cloth and animated simulation, full animation editors, and broad renderer/compositor parity. Performance limits remain explicit wherever edits or drapes miss interactive targets.

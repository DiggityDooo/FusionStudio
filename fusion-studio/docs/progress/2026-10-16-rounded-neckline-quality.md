# Rounded fitted panels and constrained mesh quality — 0.19.0 source

New fitted drafts in Clothing default to an original rounded Bézier neckline. An explicit **Original angular outline** option remains available, and programmatic calls without a neckline retain the original angular design. Saved garments keep their authored panels and retained fitting references; this does not redraft them on load.

## Behavior

The rounded design pairs physical 2D boundaries with parameter-matched 3D source curves. Its short central interval and curved sides replace the broad angular cut. Arrangement height derivatives flatten at the shoulder joins. Rounded source sampling defaults to 25 mm, and the installed Blender worker reconstructs the flattened boundaries with an explicit 0.5 mm convex-hull approximation bound. Cubic segments, child parameter remaps, partial sewing, pins and panel identities remain editable. No new native project format is required.

Pattern reconstruction now improves deficient triangles without moving boundary or internal-line constraints. Bounded max-min smoothing only activates around angles below 20 degrees. It rejects inversion and excessive edges, then legalizes unconstrained diagonals. When smoothing is insufficient, an interior circumcentre refinement pass inserts points, rejecting boundary encroachment and domain escape. Existing boundary samples and sewing correspondence are never split or moved by this refinement. Generated interior topology can change as part of the expected pattern remesh.

Adequate meshes are left unchanged. Acute authored corners and layouts that cannot satisfy the target without changing constraints still report unmet quality. The measured final minimum angle remains the acceptance check; these routines do not declare success merely because they ran.

Limits are explicit in deterministic per-panel `quality.angleRefinement` metadata: at most eight smoothing passes and two million face evaluations; at most 64 interior refinement insertions and two million refinement face checks. Existing 200,000-triangle pattern, 15,000-triangle fitted-drape, preparation-worker and 120-second offline-drape limits remain. Limits and blocked candidates do not bypass the measured quality check.

## Evidence

- Own detailed 5,000-triangle tests verify minimum-angle improvement, positive orientation, maximum edge length, deterministic results, unchanged boundaries/internal lines/connectivity during smoothing, byte-equivalent already-adequate geometry and bounded evaluation failure without a tentative move.
- A separate 5,001-triangle constrained panel needs three interior insertions. The resulting 5,007 triangles meet the angle target while retaining every original point and constraint, preserving area and avoiding inversion. Existing curve, hole, dart and partial-seam regression tests pass.
- The actual 50,312-triangle Genesis source produces a 4,175-triangle initial rounded garment with **24.45-degree minimum angle**, **28.82% maximum edge strain**, **0.01553 mm mean seam gap**, zero measured body crossings/inside/clearance violations and zero pin drift. Wider-body grading produces 4,453 triangles; a 15-degree upper-arm pose passes with **29.56% maximum edge strain**.
- The authored hem edit and coarser 30 mm remesh produce 3,097 garment triangles with **21.28-degree minimum angle**, **25.03% maximum edge strain**, **0.01707 mm mean seam gap**, zero measured body violations and zero pin drift. The deliberate coarser case complements the detailed source and 4,000+ triangle initial/posed cases.
- A captured earlier corner-profile remesh exposed an 18.95-degree triangle. Interior refinement repaired it to 20.95 degrees without modifying boundary samples. That failed candidate stays private as evidence; acceptance limits were not weakened. The final fuller rounded profile also passes the same workflow.
- The full rounded desktop workflow passes body shaping, posing, authored boundary editing, remeshing, one-step undo/redo, deterministic reopen/refit (**zero measured reopen error**), malformed-reference rollback, cancellation, stale updates, independent working copies, retained-source accessory modifiers, combined save/reopen and same-scene Cycles rendering. Paid source bytes still match.
- A separate read-only inspection of the saved final garment checks 29,802 candidate face pairs in **31.22 ms**: zero crossings, coplanar overlaps, clearance violations or collapsed faces. The minimum tested non-local gap is **9.08 mm** against 6 mm required. This remains the bounded static audit with documented local exclusions, not continuous collision or layer-order proof.

The full-scene render and a 960×720, 32-sample close render were visually inspected. The neckline is curved and no body breakthrough is visible. Edge faceting, shoulder/hem finishing and cloth thickness still need refinement; this is an uncalibrated preview rather than production-cloth certification.

Initial source drafting takes approximately **0.84 seconds**, installed-Blender flattening **1.20 seconds**, and native initial/shaped/posed/edited drapes **27.21 / 28.47 / 27.87 / 19.64 seconds** in this replay. These are single-run, machine-specific offline costs. They do not establish interactive detailed draping. The recorded flattening runtime is **Blender 5.2.0 LTS**.

## Checks and delivery

**176 JavaScript regressions pass**, including the unchanged original 2,154-triangle angular-source fixture and exact legacy native-preview comparison. The rounded workflow and contact/close-render desktop tests pass. The original angular desktop workflow also passes its body/pose/pattern/accessory/undo/reopen/render and failure-recovery checks, with zero measured reopen error. The build passes with the existing bundle-size advisory. Rust source and the native binary are unchanged from the previously tested 32-test checkpoint.

Private evidence: `test-output/rounded-neckline-unit.txt`, `rounded-neckline-regression.txt`, `rounded-neckline-ui-results.json`, `rounded-neckline-inspection-results.json`, `rounded-neckline-angular-regression.txt`, `rounded-neckline-build.txt`, `rounded-neckline-failure-state.json`, `rounded-neckline-remesh-probe.json` and the projects/renders named in those reports. The public test code constructs its own grid geometry; actual paid meshes, source sampling and failed candidates remain outside checked-in or packaged files.

`npm run test:rounded-neckline` runs the detailed quality/drafting tests, the complete rounded desktop workflow and the saved-garment contact/close-render inspection. It requires the existing private local Genesis integration fixture. Ordinary `npm test` includes the numeric tests; it does not launch the desktop workflow.

**0.19.0 remains unreleased.** No new dependency, vendor code, assets or runtime is included. Original-installation verification finds no changed/missing baseline files and all 15 sampled hashes match. The same three extra DAZ-to-Maya paths keep strict preservation false; their provenance remains unestablished and the original baseline/installations are untouched. Previous delivered releases remain preserved.

Native SHA-256 remains `16db463c8bdb978650c7415d555f21bb3c463e60a0c4faf82006d5cce0880d77`. Original Genesis DUF SHA-256 remains `e20b4f3cfbdbfe0f9ef4be685ec3d35853aaac2ad7dbb4d6a5b3448e3406b9a2`.

The full goal remains active: finer garment finishing, calibrated/ordered-layer/animated cloth, dense performance, deeper modeling/UV/sculpt, render and interchange work are not complete. The fitted workflow uses cancellable preparation workers. The subsequent [pattern Apply follow-up](2026-10-16-pattern-apply-workers.md) moves plain-pattern Apply meshing off the UI thread; remaining payload/history/upload costs are still recorded as responsiveness work.

# Cancellable pattern Apply and dense constrained panels

Status: **0.19.0 source, unreleased; Inspired Fusion behavior.** The complete unified product goal remains active.

## Behavior

Plain authored-pattern Apply now validates and triangulates in a disposable module worker. The previous pattern remains visible while computing. Cancel/Escape terminates that worker; malformed inputs, loading failures, expired scene revisions and foreign replies leave the scene and history intact. Successful Apply creates one transaction. Replacing an authored pattern retains its object identity, name, visibility and transform. Applying to a baked result creates an independent authored copy and only hides the baked source after success. Linked garments still use Apply & Re-drape.

The preparation protocol carries version, project/object IDs, document revision, request ID and SHA-256 input hash. Draft, derive, fit and contact-topology preparation now use the same checked reply envelope. Worker startup, timeout, error, cancellation and completion all release the worker. A second check rejects raw target changes made during computation even if no document revision was committed.

Clothing shows cached authored rest-mesh triangle count and minimum-angle diagnostics. These survive undo and save/reopen. They describe the flat rest mesh, not final drape convergence. Detaching parametric metadata also removes this cache.

## Constrained mesh repairs

A detailed holed panel exposed an alternating diagonal cycle during internal-line recovery. Recovery now defers a newly created diagonal until other crossing edges have been tried, retaining the existing bounded failure path. Vertical, reversed, slanted and bent internal lines recover without dropping authored constraints.

Dense initial boundary fans also exhausted the local legalization guard on queued checks. The original ordinary 10,000-check path remains. Only after exhaustion, pending edges are compacted and duplicate pending checks are suppressed. One bounded additional allowance scales with the current face count, capped at 100,000 extra checks; a second exhaustion still fails. Per-panel work counters record checks, flips, compactions, discarded checks and peak local budget/use. No constraint is deleted to achieve the quality target.

The 5 mm own fixture produces **109,252 triangles / 55,206 vertices** with **28.98° minimum angle**. Numeric tests independently verify positive orientation, exact authored area minus the hole, two connected panels, all boundary/internal-chain edges and partial-seam parameter correspondence. Source documents remain unchanged. Crossed internal lines still fail explicitly.

## Evidence and limits

182 JavaScript regressions pass. Desktop tests cover actual worker termination after cancel/stale revisions, a real missing-module failure, foreign context rejection, malformed input, no partial history entries, concurrent target transforms, identity-preserving update, one-step undo/redo, save/reopen, contact inspection and baked working copies. The detailed recovery fixture includes over 100,000 triangles; the desktop failure/transaction fixture uses 23,080 triangles.

The existing plain-pattern sewing/bake/working-copy desktop test passes. The complete rounded Genesis workflow also passes with the checked worker protocol: body shaping, pose, panel edit/remesh, accessory stack, undo, save/reopen, same-scene Cycles render and independent contact/close-render inspection. The paid body has 50,312 triangles. Source bytes are unchanged. This slice changes no Rust code, renderer code or dependencies; the native module remains at the preceding 32-test checkpoint.

One serial desktop density sweep measured the whole Apply operation, including mesh delivery, history and GPU upload:

| Particle distance | Triangles | Minimum angle | Apply time | Largest observed frame gap |
| --- | ---: | ---: | ---: | ---: |
| 25 mm | 4,618 | 28.08° | 0.52 s | 73.4 ms |
| 16 mm | 10,978 | 28.46° | 1.11 s | 20.0 ms |
| 11 mm | 23,080 | 29.07° | 2.44 s | 40.1 ms |
| 8 mm | 42,958 | 30.69° | 5.50 s | 60.0 ms |
| 5 mm | 109,252 | 28.98° | 15.56 s | 149.9 ms |

All sizes complete with one history push per successful Apply. Earlier 8/5 mm failures are retained in the private before-repair report. The 33.3 ms frame target is **unmet**. Worker meshing keeps frames running, but final scene construction/history/upload can still cause a visible pause. These are single-run timings under uncontrolled host load, not a general interactive guarantee or a cloth-simulation benchmark. Preparation retains its 20-second timeout and the existing 200,000-triangle pattern cap. Fitted drape and contact inspection retain their separate, lower limits. Some older non-fitted drape/payload paths still reconstruct patterns on the main thread.

## Checks and preservation

Commands: `npm test`, `npm run build`, `npm run test:pattern-apply`, `npm run test:pattern-apply-performance` and `npm run test:rounded-neckline`. The existing bundle-size advisory remains. Performance output distinguishes data-integrity checks, all requested sizes completing and the unmet frame target.

Private evidence stays under `test-output`: `pattern-apply-regression.txt`, `pattern-apply-build.txt`, `pattern-apply-ui-results.json`, `pattern-apply-ui.png`, `pattern-apply-ui-log.txt`, `pattern-apply-performance-results.json`, `pattern-apply-performance-before-budget.json`, `pattern-apply-rounded-regression.txt`, the rounded workflow/inspection reports, `pattern-apply-preservation.txt` and `pattern-apply-asset-preservation.json`. Public test fixtures are mathematically authored panels, not proprietary meshes or pseudocode.

The installation verifier still reports zero changed/missing baseline files, all 15 sampled hashes matching and the same three extra DAZ-to-Maya paths. Strict preservation remains false; the immutable baseline is not replaced and those original-installation paths are not removed. Previous releases and the original Genesis source are retained. No 0.19 package or publication is produced.

The subsequent [linked preparation follow-up](2026-10-16-linked-garment-preparation.md) also moves non-fitted linked grading/triangulation into the worker and repairs frame retention during snapshot undo. Remaining work includes body capture, the older bake payload, main-thread scene/history costs, broader dense drape performance, garment edge/thickness finishing, ordered-layer and animated cloth, calibration, deeper modeling/sculpt/UV tools and the rest of the unified roadmap.

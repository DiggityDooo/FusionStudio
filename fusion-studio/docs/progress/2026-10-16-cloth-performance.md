# Cloth contact work and timing diagnostics — 0.19 development

0.18.0 remains the delivered release. The full unified-excellence goal remains active. This checkpoint improves original physical cloth evaluation and makes its cost inspectable in the existing Clothing workspace.

## Implemented behavior

Contact support guesses are retained only within one native drape request. Every guess is checked against the current coupled displacement and normal reaction. A reused guess gets eight bounded passes; if that fails, the original cold guess gets its full eight-pass budget. Final exhaustion remains an explicit failed diagnostic. Source geometry, project IDs and topology never enter a global cache. Contact loss clears the affected guess. Sparse and PCG independent tests cover the reduced work, loss of contact and bad-guess fallback.

Physical cloth/body face tests now conservatively reject triangles wholly separated by a face plane. The margin exceeds the existing narrowphase tolerance with scale-dependent roundoff padding. Grazing and degenerate cases retain the original intersection path and ordering. The comparison corpus covers 4,096 varied pairs at three scales, reversed winding, near-grazing offsets and degeneracy. The old preview still uses its existing face-contact path.

Clothing exposes a collapsed **Solver timings** view for fabric/support, floor/proxy, body-vertex, body-face and self-contact work. Native results also record sparse assembly/factorization/substitution times, the actual sparse factorization kind, reused support guesses and cold restarts. Timings are diagnostics; they do not feed simulation decisions. Existing saved results without these fields still display normally.

## Detailed physical fixture

The sequential benchmark uses the same private, owned 50,312-triangle Genesis body and 3,186-triangle edited shirt, with identical inputs and unchanged fit/motion/linear-accuracy gates. The preserved accepted baseline native hash is `29b99735f4b8b3bc87ef4aa4ade70d33247ee850e2802be37a3e31f6ff002015`.

The latest pair records **38.11 s baseline / 32.75 s current**. The maximum position difference is **0.651 nm** (the fixture agreement bound is 10 micrometres). Coupled linear solves fall from **1303 to 1192**. The current result has zero measured body crossings/inside/clearance violations, no incomplete contact sets or stalled projections, 16.30% maximum edge strain, 0.01961 mm mean seam gap, 0.011589 m/s maximum speed and 1.852e-13 recomputed relative residual.

| Current native phase | Measured time |
| --- | --- |
| bodyFaceContact | 3.833 s |
| bodyVertexContact | 2.287 s |
| floorAndProxies | 0.123 s |
| materialAndSupports | 22.312 s |
| selfContact | 4.143 s |

Other pairs varied substantially (including a 34.36 / 33.77 s pair). These are single-run native timings on this machine, with no CPU affinity or system-load control; they do not establish a general speedup or interactive physical draping. The job limit remains 120 seconds. Body/contact work and sparse factorization remain significant.

## Numerical experiments retained as evidence

The optional private-matrix benchmark compares automatic, simplicial and supernodal factorization on the detailed shirt and 2,000 / 8,000 / 18,000-triangle membrane matrices. Automatic selection already chooses supernodal and remains unchanged. Forced simplicial was slower across these cases. The manual benchmark is ignored by default because it needs private fixture preparation; it does not run as an ordinary unit test.

A further old-factor preconditioner trial met local residual/fit checks but changed the shirt by **7.49 mm**, failing the independent geometry-agreement check. It was rejected. A stricter trial required matching contact frames and 1e-12 relative / 1e-14 N absolute residuals; it found no reusable factors on this body case. That experiment and its extra cache/algorithm are **not included** in the final source. Available evidence stays private so it is not repeated as an assumed improvement.

## Verification and remaining work

The final native build passes **28 tests**, with one manual profile benchmark ignored; the manual policy benchmark separately passes its 12 configurations. **162 JavaScript regressions pass**, including the exact 0.18 preview comparison and detailed material/thin-limb references. The desktop fabric test passes its phase-timing display, actual strip evaluation, fit gates, cancellation, failure rollback, undo/redo, save/reopen and exact preview restoration. The full combined workflow replay also passes; details follow below.

No baseline installation files changed or disappeared; all 15 sampled hashes still match. The same three extra DAZ-to-Maya paths keep the strict inventory result false. Previous 0.15–0.18 archives/native/helpers and the original Genesis character still match. No original installation or private asset was changed or published. No dependency was added, and no 0.19 package was produced.

Boundary smoothing, robust layered/animated contact, empirical fabric calibration and interactive dense evaluation remain unfinished. The broader modeling/character/render/interchange roadmap remains active.

Final native SHA-256: `48bc864300e61c428331224ef9369729f5f949f1cd42dd92cab4146f0ce55746`.

Private evidence: `physical-performance-results.json`, `cloth-performance-regression-tap.txt`, `cloth-performance-final-build.txt`, `fabric-ui-results.json`, `sparse-policy-results.json`, `cloth-factor-reuse-results.json` (rejected), `cloth-strict-factor-results.json` (not retained), `cloth-performance-asset-preservation.json` and `research/preservation-verification.json`.

The optional `npm run test:physical-performance` requires the accepted baseline copy at `test-output/cloth-performance-baseline.node` with the hash above, and the private accepted request at `test-output/physical-sparse-probe.json`. Neither binary nor paid mesh fixture is checked in or packaged. Default tests skip the private matrix benchmark; its prepared request list is `test-output/sparse-policy-fixtures.json`.

## Final combined workflow

The uninterrupted desktop replay passes explicit two-second settling, actual body shaping, a 22-degree upper-arm pose, authored hem edit/refinement, exact pattern undo/redo, retained-source accessory stack, save/reopen and a same-scene Cycles render. Each completed gesture adds one history push, allowing normal old-entry eviction at the existing snapshot memory bound. No page errors occur. The timing expander was reopened from the saved project and visually inspected; all five phase values are visible within the Clothing sidebar. The resulting render was inspected with no visible body breakthrough. Neckline/hem refinement remains needed.

Final garment: **4418 triangles**, **28.07-degree minimum angle**, **21.81% maximum edge strain**, **0.02072 mm mean seam gap**, **4.592e-6 m/s maximum speed**, **1.219e-9 recomputed relative residual**, zero measured body crossings/inside/clearance violations or pin drift, and zero unfinished contact sets/stalled projections. Stage native times are **42.6 / 45.3 / 41.4 / 65.6 seconds** for settling/shaping/pose/refinement. These are offline preview figures, not production-cloth certification.

Final evidence: `test-output/physical-spine-ui-results.json` (passed), `cloth-performance-spine-ui.txt`, `cloth-performance-timings.png`, `fabric-ui-results.json` and the saved project/render referenced by the report. The final native hash remains `48bc864300e61c428331224ef9369729f5f949f1cd42dd92cab4146f0ce55746`.

# Retained garment render finishing — 0.19 development

0.18.0 remains the delivered release. This is original, Inspired Fusion behavior in the existing Character/Clothing workspace. The full unified excellence goal remains active.

## User-visible behavior

**Render finishing…** adds editable thickness, inside/center/outside offset and bounded sewn-vertex joining to a linked garment. The rendered shell has outer/inner surfaces, rim faces at unsewn boundaries and consistent area-weighted normals across sewn panels. This smooths sewn shading; it does not subdivide or smooth the geometric silhouette. Individual UV corners and material assignments retain explicit source mappings.

The simulation surface is retained separately inside the garment geometry. Repeated finishing changes always start from that source. Disabling restores its positions, UVs, normals, groups and strain data. Body morphs, poses and panel remeshing regenerate simulation and finishing together. A failed dependent finishing operation restores the character, garment, frame and history. Static copies and GLB rendering retain visible finished geometry but remove the private simulation cache; exporting does not modify the original project.

The dialog warns before applying that thickness and seam adjustments may intersect a body or another layer. Fit, strain and cloth-contact diagnostics explicitly refer to the retained simulation surface. The finished shell is **not collision-validated**. Summary text reports joined/separate sewing pairs, maximum seam adjustment and ambiguous flat-component orientation. Contact highlights use source triangles, not rendered face indices.

Selected characters now show their linked garments' measured fit status and an **Inspect garment fit** button. A body change that leaves excessive strain remains visibly marked **Needs refinement** while shaping. Inspection reaches the existing drape controls in the same workspace.

## Evaluation and limits

Finishing runs in the checked disposable preparation worker with scene identity, revision, request ID and input hash. Cancellation terminates the worker. Stale, foreign and failed replies leave the prior scene and history intact. Results validate topology, finite attributes, material coverage, source remaps and diagnostics before committing one gesture. Saved projects validate the retained cache before replacing the existing scene.

Limits are 60,000 source vertices, 50,000 source triangles, 4,000 sewing pairs and 120,000 finished vertices/triangles. Thickness is 0.1–5 mm; seam tolerance is 0–1 mm. Transitive joining cannot move a source point farther than the selected tolerance. Collapsed faces, pinched/nonmanifold joins, inconsistent orientation and locally inverted thickness faces fail explicitly. A garment must have one static mesh and identity linked transforms; modifier-stack work uses a static working copy.

This does not establish global self-intersection freedom, correct orientation for arbitrary open surfaces, production fabric calibration, layered/animated cloth, silhouette subdivision or parity with Marvelous Designer.

## Dense morph failure and final contact correction

The owned detailed Genesis workflow exposed a genuine fit failure after reducing the independent authored width control from 1 to 0.75. The same 6,764-triangle garment had 51.1225% maximum absolute edge strain and 2.7862% mean strain. One underarm edge exceeded the unchanged 50% preview threshold. No body violations were measured at the original 160-step / 10-iteration settings. Finishing remained linked; the raw drape was correctly marked unconverged.

Increasing iterations explicitly to 20 reduced strain to 46.1613%, but the former solver left five body-face intersections and two vertices inside the body. Throttled contact work ran every third iteration and could skip the final fabric update. Native evaluation now always performs the scheduled body/self-contact work on the final iteration, in addition to the existing every-third-iteration passes.

The scheduling correction alone passed body/strain checks but failed the independent cloth audit with two non-adjacent face crossings near a sewn side. The vertex/edge distance-neighbour mask can skip features of an actually intersecting face pair. A new final-iteration static recovery checks crossed face pairs that share no sewn vertex. It chooses a separating plane by inverse-mass-weighted displacement, retains the previous side where available and never moves pins. Sewn groups move together with their combined mass; a pin on any member fixes that group's contact degree of freedom. This prevents recovery from removing crossings by opening a seam. Infeasible pinned contacts remain unresolved and visible. Broadphase recovery has a two-million-candidate budget per pass; it runs once per timestep. Existing swept vertex/face and edge/edge contacts still run during the solve. Static recovery does not establish continuous or ordered-layer correctness.

Preview drapes with triangle self-contact now also include the bounded final cloth audit already used by physical cloth. Its crossings, overlaps, gap failures and incomplete coverage feed the normal fit status; zero strain/body violations alone cannot imply passing checks.

On the captured identical dense input at an explicitly selected 20 iterations, the final implementation measured **33.7796% maximum strain**, 1.6243% mean strain, 0.019158 mm mean seam gap, zero pin drift and zero measured body intersections/inside vertices/clearance violations. The final and independent audits both checked 80,458 candidate pairs with zero crossings, overlaps or clearance violations. Their minimum tested gap is 5.999427 mm against 6 mm with the existing 1 µm numerical tolerance. All 202 finishing joins are retained: the largest sewing gap is 0.426320 mm, inside the selected 0.5 mm tolerance. The finished shell has 13,840 triangles. Native work took 87.27 seconds in that run. These are offline fixture observations, not an interactive performance claim. The default is unchanged: the user explicitly requests more iterations through Drape settings. A higher iteration count alone is not a guarantee for arbitrary garments.

The native SHA-256 is `f45bc4a564de7356f3ea247fa853ff702c35865a6b7c6f90f09127d0f908843b`; the prior accepted module is retained privately. The physical material remains optional and uncalibrated. Existing diagnostic thresholds have not been weakened.

## Verification

Seven numeric tests cover detailed constant-volume sheets, mixed-winding sewn cylinders with distinct UVs, curved/holed panels, material remaps, malformed/pinched/collapsed/oversized inputs, local shell inversion, deterministic source retention, strain remapping, project roundtrips, disabling, dependency fingerprints and worker identity/topology checks. Finishing parameters participate in dependent garment input hashes, so changing thickness alone creates a different fingerprint.

Native tests include a crossed-face recovery case with fixed pins and sewn-neighbour exclusions. A 5,184-triangle independent fixed-layer regression demonstrates that a preview with exactly zero native strain and pin drift still reports its crossings. Cross-language position comparison permits only 1e-14 m JSON parsing roundoff; the native pin-drift check remains exactly zero.

The final source/native combination passes **194 JavaScript tests and 33 Rust tests** (one manual sparse-policy profile remains explicitly ignored). The frontend build passes with the existing bundle-size advisory. No dependency is introduced.

The desktop finishing test covers visible warning/cancel, real worker termination and failure recovery, foreign/stale replies, source-buffer equality, one-step frame-preserving undo/redo, labelled simulation contact inspection, project storage, GLB cache stripping, disabling, same-scene Cycles rendering, pose retention, failed dependent rollback and denser remeshing. The private source character has 50,312 triangles. The posed/remeshed garment has 6,864 simulation triangles and 14,040 finished triangles.

The saved posed garment independently reconstructs with zero Float32 position error and exact face/source mappings. Geometric closure analysis welds coincident UV/normal splits at 1 nm for analysis only: 7,016 geometric vertices, 14,040 faces, one component and zero boundary edges. This does not imply welded viewport UVs or collision certification. The final retained simulation contact audit checked 83,913 candidate pairs with no crossings, overlaps or clearance violations. The 960×720, 48-sample CPU render was visually inspected; shoulder and hem faceting still need geometric refinement.

The separate pure-kernel size sweep produced 4,352 / 16,896 / 37,632 / 101,120 finished triangles from 2,048 / 8,192 / 18,432 / 49,928 source triangles in 21.13 / 92.14 / 176.30 / 512.74 ms. JSON results were approximately 0.20 / 0.83 / 2.46 / 7.50 MB. Each point is one run after a small warmup under uncontrolled load; pattern reconstruction, worker transport, history, GPU upload and simulation are excluded. No interactive target is claimed.

Reproduction: `npm run test:garment-finishing` runs numeric, recovery/pose/remesh, inspection and shaping/refinement desktop gates in sequence. It requires the owned private Genesis workflow prepared by earlier surface-drafting tests. `npm run test:garment-finishing-performance` runs only independently authored size fixtures. Default regression is `npm test`; native checks use `scripts/build-native.ps1 -RunTests`.

Private reports, projects, meshes and renders stay under `test-output/garment-finishing-*`. No proprietary content or new dependency is added to package inputs. No 0.19 package or public distribution is produced.

## Final workflow verification — October 18

The strict desktop shaping test passes the original 1 → 0.75 authored width change, visible unconverged default diagnostics, an explicit 10 → 20 iteration refinement, all body/contact/strain/mesh gates and **every** seam within the selected finishing tolerance. The current scene's independent Float32 audit checked 80,479 candidate pairs with zero crossings, overlaps and gap violations. The two gestures survive undo/redo at frame 9, saving, reopening and a 960×720, 32-sample same-scene CPU render. No sewing pairs are omitted from finishing. Both final shirt renders were visually inspected. They show continuous seams; shoulder/hem silhouette faceting remains visible and is unfinished work.

The separate saved posed/remeshed inspection also passes, including exact reconstruction and closed geometric topology. The BMW CPU and OptiX preserved-scene regressions pass at 640×360 / 16 samples, with mean absolute RGB-byte differences of 0.0000419560 and 0.0000405093 against their native references (gate <0.1). Both original `.blend` hashes and modification times remain unchanged. Generic GLB shader conversion remains approximate.

Preservation verification at `2026-10-18T07:31:04Z` reports **zero changed or missing baseline files** and all 15 sampled SHA-256 checks matching. Strict preservation remains **false** because the same three extra DAZ-to-Maya paths remain in the inventory; their provenance has not been established. The immutable baseline was not edited and no files were removed to change that result. Selected Genesis and BMW source hashes and the 0.15–0.18 release archives/native/helpers independently match prior evidence. `test-output/garment-finishing-asset-preservation.json` records those comparisons; `research/preservation-verification.json` records the separate installation limits.

The full roadmap remains open: geometric finishing, collision-aware rendered thickness, reliable layer ordering, animated colliders, calibrated materials, dense responsiveness and deeper character/modeling/render/interchange capabilities are still required. Missing dependency/runtime notice review also remains a public-distribution gate. No 0.19 package, publication or full-goal completion is claimed.

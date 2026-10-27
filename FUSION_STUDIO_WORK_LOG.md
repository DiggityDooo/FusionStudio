# Fusion Studio — Work Log and Requirements Record

Last updated: October 26, 2026

Current release label: **v0.0** (package/application version **0.0.0**), set at the user's request on October 26, 2026 for the current source snapshot, previously 0.19.0. The UI, new-project application metadata, npm lockfile and future package output path use this baseline. Previous packaged releases and historical evidence remain intact; **0.18.0** remains the most recent previously packaged milestone. This labeling change creates no new installer/package and does not mark outstanding acceptance work complete.

Earlier sections retain historical results; the latest record supersedes older descriptions of missing topology, morph/formula, modifier-stack, advanced-pattern, authored joint-limit, pose-library and weight-editing foundations.

## Current follow-up: Fusion Character Creator

The user requested a realistic **adult male/female generator within Fusion**, with extensive body/face shaping, custom Blender-like shape keys, skin tone/appearance, hairstyle/color fitting, artistic poses and nude/underwear/clothed views. They approved the detailed Character Creator plan and then requested continued goal work. Both a redistributable starter and compatible private libraries are required; full-body and close-up quality must pass together. Existing Electron/Three.js, Rust core, persistent installed-Blender worker, shared scene/history/projects remain approved. No cloud generation or full grooming editor is included. Original installations, paid assets and previous releases stay preserved; no publication or paid-content redistribution is authorized.

Unreleased 0.19 source now includes a pinned CC0 HM08 foundation, versioned definitions/recipes, **229** body/face controls, search/numeric/reset/favorite/lock/symmetry/seeded randomization, neutral isolated custom-shape sculpting/mirroring/mixing/keyframes, 24 continuous skin tones, texture-preserving appearance, separately shaded eyes/brows/lashes, authored scalp-guide hairstyle previews and artistic poses. Character workers reject malformed/stale/cancelled results and completed gestures share one scene transaction with dependent garments. Public body and strand buffers rebuild from immutable source/recipe rather than repeatedly filling the history budget. Cycles receives a typed material sidecar; coverage and render subdivision remain derived outputs. Original code and licensed asset data stay separate.

General Material-panel body color, roughness and metalness now edit the retained recipe, so refitting or reopening does not erase them or recolor eyes/hair. Skin indicates custom tints and returns to its palette when a tone is chosen. Neutral shape editing rejects direct delete/extrude before mutation; exchange compatibility reports editable recipe loss explicitly.

October 23 continuation adds dense seeded scalp bindings, keeps generated strand identities through reopening, diagnoses/replaces the default male texture's painted eye sockets, and makes the creator panel primary in Character. Fitted clothing uses the verified HM08 joint mapping and a pelvis-centred torso axis carried through grading; forward male hands previously shifted the bounding-box centre outside the torso. A real initial male six-panel drape passes measured fit with 25.95% maximum strain, about 0.0793 mm mean seam gap and zero measured body/contact violations; later integrated gates are recorded only when complete.

**15 creator/hair/history-image tests, 32 focused persistence/weight checks and 216 broader JavaScript regressions pass.** Actual desktop slider undo, cancellation, stale/malformed rollback, shape cancel and save guards pass. Dense hair survives two-character undo, recipe reopening and a Cycles portrait. Painted bodies preserve authored weights; identical skin image payloads are shared in history while saved projects remain self-contained. Image encoding and generated-buffer allocation are avoided when unchanged or reproducible. Genesis 8 male/female source-preserving import checks pass with visible skinning/subdivision/Iray limits. BMW CPU/OptiX preserved-scene comparisons pass with unchanged source hashes/timestamps.

The **complete male creator/body/clothing/pose/undo/reopen/render workflow passes**. The female initial draft fails 81% local strain at 10 iterations and 69% at the now-visible 20-iteration setting, despite zero measured penetrations; the problematic patch is over the front bust. An explicit 8% global panel enlargement worsens strain/contact and is rejected, retained only as a test working copy. No fit gate was loosened. Female front-panel shaping/contact remains required before packaging.

A numerical 50k/100k/200k refined-body sweep reaches 42.76 ms median at 200k triangles/64 targets, excluding workers/history/rig/hair/viewport. After removing per-strand temporary allocations without lowering the 8,000-strand detail, completed desktop edits measure **0.55–0.73 seconds** and the bald/dense-hair scenes average about **55 fps orbit**. Separately measured warm previews take **157–168 ms bald / 297–313 ms with hair**, excluding the 100 ms debounce and gesture-boundary snapshots. The requested 100 ms warm-preview target still fails. Professional portrait acceptance, full female clothing workflow and full private-library authoring also remain unfinished. Direct delete/extrude now stops before altering neutral shape-key topology, and export compatibility explicitly reports that generator recipes remain in Fusion projects. Details and failure evidence are retained in the dated progress report.

Full implementation, provenance, user requirements, tests and remaining work: `fusion-studio/docs/progress/2026-10-23-character-creator.md`. No new package, commit or publication was made. **0.18.0 remains the delivered release.** October 23 preservation finds zero changed/missing baseline files and 15 matching sampled hashes; strict inventory remains false for the same ten extra DAZ paths already recorded before this continuation.

## Previous follow-up: Reusable component implementation

The user requested five hours of research-only integration instructions, then authorized implementation with **“Put this into action.”** The research guide remains at `fusion-studio/research/2026-10-18-reusable-building-blocks.md`. The first adoption checkpoint implements official Khronos glTF validation before imports and completed GLB jobs, private reviewed-resource snapshots, F3 read-only scene inspection, direct validated GLB UI export and opt-in MikkTSpace normal-map tangents on temporary exchange geometry. A related project-loader repair preserves image IDs through load/undo. No source character/garment edits are required by inspection/export.

**215 JavaScript tests pass**, with detailed desktop import/cancel/stale/changed-source/undo/reopen checks, a private 70,296-triangle Genesis/garment inspection, a 32,768-triangle normal-map tangent export and Cycles render, and an unpacked ASAR worker/module/notice harness. The private scene reports zero glTF errors and seven visible skin-hierarchy warnings. A cold-worker sweep through 204,800 triangles records 115–232 ms end-to-end inspection; this is fixture evidence, not an interactive guarantee. Details: `fusion-studio/docs/progress/2026-10-18-reusable-interchange.md`. Meshoptimizer, xatlas, viewport tangents, cross-renderer parity and the wider roadmap remain unfinished. Existing pending garment refinement/native audit changes were preserved. **0.19 remains source-only and unreleased; 0.18.0 remains the delivered package.**

The latest preservation scan finds no baseline file changes/missing files and all 15 sampled hashes match. The strict inventory flag remains false: ten additional DAZ plugin/documentation/resource paths are now present, compared with three in the previous scan. Their provenance is unconfirmed; the additions and baseline were left intact. Full paths remain in `fusion-studio/research/preservation-verification.json`.

## Current follow-up: Retained garment finishing and sewn contact recovery

The one Fusion workspace now includes **Render finishing** for linked garments: editable thickness/offset, bounded sewn joins, smoothed sewn normals and rim faces, retaining simulation buffers and explicit UV/material/strain source maps. Disabling restores the source. Morph/pose/remesh updates include finishing in their transaction; worker cancellation, stale/foreign replies and dependent failures retain recoverable scenes/history. GLB/static copies retain the visible shell and remove the private simulation cache. Character selection exposes linked fit warnings with direct inspection. Finished surfaces remain explicitly outside collision certification; geometric silhouette refinement, layers, animation and fabric calibration remain unfinished.

Detailed Genesis testing exposed an underarm strain failure, a skipped final contact pass, two missed non-adjacent crossings and seam opening during recovery. Final-iteration contact, bounded face recovery and mass-aware movement of whole sewn groups address these cases without weakening thresholds or changing default drape settings. The same 6,764-triangle shaped source at an explicitly selected 20 iterations reaches 33.78% maximum strain, 0.01916 mm mean seam gap, zero measured body/cloth violations and all 202 finishing joins within 0.5 mm. Native work remains offline (87.27 seconds in the captured run). The rendered shell has 13,840 triangles. Details and limits: `fusion-studio/docs/progress/2026-10-17-garment-finishing.md`. The full unified excellence objective remains active; 0.18.0 remains the delivered release, and no 0.19 package or publication is claimed.

Final October 18 verification passes **194 JavaScript and 33 Rust tests**, detailed finishing recovery/pose/remesh and strict shaping/refinement/undo/save/reopen/render workflows, independent saved-shell reconstruction/contact inspection, and BMW CPU/OptiX comparisons. Finishing settings are included in dependent request fingerprints. All 15 sampled installation hashes match and no baseline files changed or disappeared. Strict preservation still reports the same three extra DAZ-to-Maya paths; the baseline and extra files remain untouched. Selected Genesis/BMW sources and prior release archives/native/helpers match their previous hashes. These checks do not establish production cloth or complete the broader roadmap.

## Current follow-up: Linked garment worker preparation and frame-safe undo

Non-fitted linked garments now grade, triangulate and prepare rest/placement inputs in a cancellable worker from a retained evaluated-body capture. Five pre-refactor reference hashes remain exact; the real 50,312-triangle Genesis recovery test uses 6,188 cloth triangles and verifies actual worker termination, foreign/stale rejection, atomic undo, frame 9 retention and project reopen. Its deliberately short five-step drape remains visibly unconverged and is not fit-quality evidence. Preview steps/iterations are editable in Clothing, with explicit work-limit reports and atomic re-draping for fitted and non-fitted previews. Snapshot undo/redo now keeps the active frame; direct project loading retains its own saved-frame behavior. **186 JavaScript tests pass**. The mixed-history, body/pose/panel and detailed pose-placement/render desktop regressions pass. Body extraction/hash/history/upload costs and the older bake payload remain main-thread work. Details and measured limits: `fusion-studio/docs/progress/2026-10-16-linked-garment-preparation.md`. No new dependency or native change, no 0.19 package and no full-goal completion are claimed.

## Current follow-up: Responsive pattern Apply and dense constraints

Plain authored-pattern Apply now validates/triangulates in a cancellable worker, retaining the previous scene until one successful history transaction. Checked project/object/revision/request/hash replies reject stale or foreign results; failure, cancellation and concurrent target edits retain the consistent scene. Clothing shows saved rest-mesh quality. Internal-line recovery avoids a diagonal cycle, and bounded queue compaction lets dense initial panels complete without dropping constraints. **182 JavaScript regressions pass**, including independent constraint/area/sewing checks above 100,000 triangles. A desktop density sweep completes 4,618–109,252 triangles; the finest case takes 15.56 seconds with a 149.9 ms maximum frame gap. The 33.3 ms frame target remains unmet. Desktop undo/reopen/recovery and the rounded Genesis/accessory/render workflow pass. Original baseline files/hashes and prior releases are unchanged; the same three extra DAZ-to-Maya paths keep strict preservation false. Details: `fusion-studio/docs/progress/2026-10-16-pattern-apply-workers.md`. 0.19.0 remains unreleased; dense drape, garment finishing and the full roadmap remain active.

## Current follow-up: Final cloth contact inspection

Added final physical-drape crossing/overlap/gap diagnostics and a read-only Clothing inspector for authored and linked patterns. Detailed local-path exclusions fix fine flat-sheet false contacts while retaining returning-fold and independent-layer checks. Work limits explicitly report incomplete coverage; overlays cannot enter saved/exported geometry and reject expired results. A 4,096-triangle physical layer fixture retains the requested 6 mm clearance. Final verification passes 170 JavaScript and 32 native tests, the read-only inspection desktop tests and the combined body/pose/pattern/accessory/save/reopen/Cycles workflow. The final 4,418-triangle drape has zero measured body/non-local cloth violations; its final static audit takes 44.38 ms. Regression evidence and remaining limits are recorded in `fusion-studio/docs/progress/2026-10-16-cloth-contact-inspection.md`. The full application goal remains active and 0.19.0 remains unreleased.

## Current follow-up: Rounded panels and constrained mesh quality

New fitted drafts default to a rounded Bézier neckline with matching source arrangement and bounded curved flattening; the original angular option and saved designs remain available. Adaptive interior angle smoothing/refinement preserves authored boundaries, pins and sewing samples. Detailed numeric checks and the full rounded Genesis/body/pose/hem/remesh/accessory/undo/save/reopen/render loop pass, along with an independent contact/close-render inspection. Final input/rest minimum angles are 24.45° initially and 21.28° after the deliberate coarser edit; all measured body and final non-local cloth violations are zero. 176 JavaScript regressions pass. No native code or dependency changed. Detailed evidence, offline timings and remaining production/animation/finishing work: `fusion-studio/docs/progress/2026-10-16-rounded-neckline-quality.md`. 0.19.0 remains unreleased and the full goal remains active.

## Standing product direction: unified excellence

The user supplied `CODEX-UNIFIED-EXCELLENCE-PROMPT.md` as the standing brief. Fusion owns one character → garment → accessory → render workspace. Success means those core jobs work well together, with Exact / Compatible / Inspired fidelity labels and measured acceptance; reproducing every reference-program menu or proprietary algorithm is no longer the product objective. The character-control foundation has advanced through joint limits, weight editing, safer dependency coverage and reusable pose workflows. The current priority is garment quality/contact/grading, followed by modeling depth, rendering and interchange; broader character production work remains. Original installations, paid assets and private decompilation remain protected.

## Current development: Physical fabric response, 0.19.0 unreleased

Optional SI fabric response, a known-load material study and transactional re-draping are implemented in Clothing. Retained local face supports now participate in the coupled energy solve. Original sparse assembly uses MIT-licensed faer Cholesky, with bounded numerical memory, explicit PCG fallback and recomputed true linear residuals. Solver choice/contact penalty and actual backend diagnostics persist with projects. Existing preview geometry remains byte-equivalent to the preserved 0.18 native core on the regression fixture.

The edited/posed 50,312-triangle Genesis body and 3,186-triangle shirt now meet the current numerical preview gates: **16.30% maximum edge strain, 0.01961 mm seam gap, 0.01159 m/s maximum speed**, zero measured body crossings/inside/clearance violations and zero pin drift. Final relative solve residual is **1.955e-13** against 1e-5 requested. A separate 5,000-triangle cloth on a detailed 8 mm limb and the 2,000 / 8,000 / 18,000-triangle independent material studies pass. Final regression: **162 JavaScript tests and 28 Rust tests**. Desktop undo/save/cancel/failure recovery, exact preview restoration and front/back same-scene Cycles renders pass. BMW CPU/OptiX comparisons pass. The material remains uncalibrated; neckline/hem refinement and broader layered/animated behavior remain unfinished. The full physical workflow now passes after explicit two-second settling: body shaping, 22° upper-arm pose, a denser 4,418-triangle authored hem edit, one history push per gesture, exact undo/redo, accessory stack evaluation, save/reopen and same-scene Cycles render. An independent seven-particle support-release fixture justified raising the bounded contact passes from four to eight; exhaustion still fails diagnostics. The final dense garment has 21.81% maximum edge strain, 0.02072 mm seam gap, 1.479e-6 m/s maximum speed, 4.613e-10 recomputed relative residual and zero measured body violations. Native stages take about 47–72 seconds; interactive physical draping is not established.

**0.19.0 is not packaged or released.** Delivered version remains 0.18.0. Fresh preservation checks report no changed/missing baseline installation files and 15 matching hashes; the strict gate remains false because the same three extra DAZ-to-Maya documentation/plugin paths are present. Their provenance remains unestablished; originals/baseline are left untouched. Prior 0.15–0.18 release archives/native/helpers and the original Genesis DUF still match. No private assets or vendor code were published. Detailed implementation, evidence and limits: `fusion-studio/docs/progress/2026-10-16-physical-fabric-wip.md`.

## Current follow-up: Cloth contact work and timing diagnostics

Verified request-local contact guesses reduce repeated coupled solves, with a full cold fallback when needed. Conservative body-face rejection retains grazing/degenerate behavior. Clothing now displays measured native phase timings. The latest detailed paired run is **38.11 s baseline / 32.75 s current**, with **0.651 nm** maximum geometry difference and **1,303 → 1,192** coupled solves. Other timing pairs varied; no general speedup or interactivity is claimed. An old-factor preconditioner experiment failed geometry agreement and was left out; a stricter variant found no useful reuse on this body. Automatic sparse factorization remains unchanged after actual matrix benchmarks.

All **162 JavaScript and 28 native tests** pass. The full body/pose/refinement/accessory/undo/save/reopen/Cycles workflow passes again. Its final 4,418-triangle garment has **21.81% max edge strain, 0.02072 mm seam gap, 4.592e-6 m/s max speed**, no incomplete contact solves and zero measured body violations. New native stages take about **41–66 seconds** in the combined replay. The expanded timing panel and render were inspected. Original assets and 0.15–0.18 releases remain unchanged; the strict install inventory still reports the same three extra DAZ-to-Maya paths. **0.19.0 remains unreleased**. Boundary smoothing, robust layered/animated contact and the broader roadmap remain open. Evidence/limits: `fusion-studio/docs/progress/2026-10-16-cloth-performance.md`.

## Latest delivered execution: Fitted panel drafting and surface grading, 0.18.0

Resumed development as requested and first committed the surface-flattening/reconstruction checkpoint (`347cd91`). Source now implements **Draft fitted shirt panels…** in Clothing, with reviewed bind joints, ease/length/density/clearance controls, an independent six-panel working copy, persistent UV/3D/body attachments, worker preparation and bounded offline draping. The Pattern & Sewing Editor retains physical authored panels through remeshing, sewing and body/pose changes; placement/identity redesign has an explicit independent flat-copy path. Standard exchange strips fitted body-reference metadata. The separately packaged 0.18.0 application passes combined acceptance; 0.17.0 and earlier releases remain intact.

A single torso-ratio grader failed a deliberately authored 6%-width/3%-depth Genesis morph at 60.04% maximum local strain. Original panel-specific surface-metric grading now passes that same case: 4,462 triangles, 28.81° minimum angle, 28.11% maximum strain, 0.01177 mm mean seam gap and zero measured body/inside/clearance violations. The updated packaged initial draft has 4,246 triangles, 25.98° minimum angle, 28.69% maximum strain, 0.01250 mm seam gap and zero measured violations. These are uncalibrated preview gates, not production certification.

Save/reopen drift was traced to imported quaternion matrix decomposition. Snapshots now retain exact authored TRS values for automatic transforms while preserving manual shear matrices. Reopened prepared requests and displayed drapes match exactly. Native stages and preparation terminate on cancellation/stale work; malformed references and wrong fitting-patch attachments reject before exposing partial results. The expanded packaged workflow passes, including a 15° upper-arm pose, sewn boundary edit, remeshing, malformed-input/cancel/stale recovery, retained-source accessory stack, combined save/reopen and rendering. A separate reopened project retains the edited 3,186-triangle garment and renders front/back at 960×720 / 32 samples; both views were inspected. The density sweep passes preview gates at 1,730 / 3,030 / 4,246 / 6,410 triangles, with native times about 14 / 23 / 30 / 44 seconds. The finest case reaches 49.57% maximum strain, so resolution is not a demonstrated quality improvement.

151 JavaScript tests pass; the native core remains unchanged from its 11-test baseline. Real 20,480-triangle curved / 9,282-triangle holed flattening tests pass, including physical units, deterministic repeats, context, malformed geometry, cancellation and recovery. BMW CPU/OptiX comparisons pass again. The final 0.18.0 package passes smoke and legacy detailed character/formula/weight/pose/pattern/accessory/render regressions. All 34,837 installation records and 15 sampled hashes remain intact; earlier release archives and unpacked helpers/native modules match their recorded hashes. No source installations, paid assets or prior releases were modified.

Implementation, completed evidence and remaining roadmap: `fusion-studio/docs/progress/2026-10-15-surface-drafting.md`. The earlier foundation checkpoint remains in `2026-10-15-surface-drafting-wip.md`. Launch `Launch Fusion Studio 0.18.0.lnk` in this workspace. Release integrity and numeric acceptance are recorded in `fusion-studio/docs/releases/0.18.0.json`; ASAR SHA-256: `3107b9b20efef6d779fa45cff5a1747e14f2033e8163433ef4ea05498cb13b69`. This is a local release; no publication or paid-content redistribution occurred. The full goal stays active: production fabric/contact/animation, deeper modeling/sculpt/UV, character authoring, rendering and interchange remain unfinished.

## Previous execution: Source-surface garment pose placement, 0.17.0

Continued the active full-goal development after the resumed 0.16.0 milestone. Clothing now offers **Enable pose-aware placement** for garments linked to imported skinned bodies, with **Rebuild pose attachment** and **Use static source placement**. Existing garments keep their prior mode until changed. This is an original Inspired preplacement stage; it does not claim production cloth fit or animated simulation.

New typed Rust `bindGarment` / `placeGarment` requests find body triangles, retain barycentric attachments/offset frames and reconstruct the source arrangement on the current evaluated skin before the existing drape. Body identity, counts/connectivity and the complete canonical source-input SHA protect cached bindings. Flat pattern distances remain the rest reference; previous drapes are never repeatedly baked into the source. Bindings persist through project versions and are stripped from ordinary GLB exchange. Pose-independent source grading and private posed capture support positive uniform scale plus rigid root transforms; attached skin matrices are refreshed before collision extraction.

The source/evaluated/collision/rest simulation coordinates in this optional mode are canonicalized to 0.1 µm without rewriting source or viewport geometry. This prevents save/reopen matrix noise from choosing different contact branches. The final packaged saved/reopened re-drape reproduces every displayed vertex coordinate exactly. Bind, place and drape share one scene transaction; combining evaluator/operator abort signals prevents later stages from starting after Cancel. Damaged caches, mismatched topology, collapsed target triangles and excessive attachment distance report actionable errors while retaining the prior scene/history. The UI can rebuild or return to static mode.

The six-panel measured-shirt prototype advances drafting research: separate bodices/sleeves, source-arm sections and matching armholes close its mean seam gap to 0.379 mm, but 127.0% maximum strain, 12 body crossings and nine clearance violations still fail fit. It is not shipped as a template. Private meshes/probes remain under ignored test output. Conditions and findings are recorded in `fusion-studio/research/garment-fit-2026-10-15.md`. Developable panel shape and collar/shoulder length, with a bounded Blender UV flatten/relax comparison, are the next priorities for measurement-based drafting.

Verification: **134 JavaScript tests and 11 Rust tests pass**. Detailed analytic attachment fixtures use 32,768 body triangles and up to 22,500 garment points; a 60,000-point / 180,000-triangle request verifies real helper cancellation and recovery. The actual 50,312-triangle Genesis workflow covers enable/undo/redo, corruption rollback/rebuild, linked upper-arm posing, save/reopen/re-fit, exchange stripping, same-scene rendering, static fallback/undo and source project preservation. The posed optional-mode garment has 2,482 triangles, zero measured body crossings/inside/clearance violations, but 94.01% maximum strain and 6.580 mm mean seam gap; fit is still unconverged. Source body measurements, all character controls, retained-source accessories and the complete static-mode integration also pass. Existing static regression geometry/metrics are unchanged.

Fresh packaged native Cancel/Escape/retry, failed-fit diagnostics/strain undo, worker/save/BLEND/Cycles/concurrency and BMW CPU/OptiX checks pass. BMW mean RGB-byte errors are 0.00003328 / 0.00004340 against <0.1, and original scene hashes/modification times remain unchanged. Preservation passes all 34,837 installation records and 15 sampled hashes, plus the original Genesis DUF. Previous release archives and unpacked native/helper bytes are unchanged.

Release: `fusion-studio/release-v0.17.0/win-unpacked/Fusion Studio.exe`, launcher `Launch Fusion Studio 0.17.0.lnk`. ASAR SHA-256 `8061d045db2a0883113f7f5b2f034cf9ec8cd87f82c2ec4e232dc6f2013d6563`; all 4,725 inventoried paths pass private-content/vendor-host/paid-scene exclusions. Native component version is 0.17.0; source/package bytes match. Evidence: `fusion-studio/docs/progress/2026-10-15-pose-placement.md`. No publication or push occurred.

The full unified-excellence goal remains active and incomplete. Measurement-based drafting/grading, collar/shoulder fit, calibrated materials, robust layered/animated contact and finer drape budgets remain required, followed by deeper modeling/sculpt/UV, render/sequence controls, broader character authoring and interchange.

## Previous execution: Resumed development and source-shape body measurements, 0.16.0

Latest user instruction: **“resume development”** after the earlier pause. Continued toward the standing unified-excellence goal, preserving the existing UI/native-Rust/private-Blender architecture. No original installation or paid asset was modified, copied into the package, or published. This milestone adds a usable measurement inspection foundation; it does not claim that the full program or garment fit is finished.

The Character workspace now inspects hips/waist/chest source sections at adjustable height levels. Triangle intersections, one-micrometre endpoint welding and closed-loop tracing produce actual surface girths plus width/depth, with an X/Z contour preview. Open, branched, ambiguous, crossing, coincident or oversized sections report problems. Separate limb contours are excluded. Dependencies are evaluated on a private skeleton copy, retaining current resolved morphs and active correctives while excluding bone pose. These are Inspired geometric sections, not vendor measurement parity or anatomical landmarks.

Preview runs in a dedicated debounced worker with revision/input/request checks, a 10-second timeout and cleanup on Cancel/Escape/close. Reviewed snapshots save in one metadata delta, preserving the current frame and geometry through undo/redo and project versions; ordinary GLB exchange omits them. Existing garment grading remains unchanged. Source Y must be upright, source height 1.2–2.2 m, scale positive and uniform; source counts are bounded at 200,000 triangles / 500,000 vertices. Refresh saved snapshots after shaping.

On the owned 50,312-triangle Genesis fixture, source height is 1,701.142 mm and default geometric girths are hips 913.825 mm, waist 740.393 mm, chest 950.694 mm. Analytic 6,144 / 24,576 / 131,072-triangle cases verify perimeter accuracy and record timings. The packaged desktop gate covers contour display, rapid/invalid level edits, Cancel/Escape without document changes, one-step undo/redo, save/reopen, malformed data, stale replies, worker failure/retry, exchange and asset preservation. The full packaged body → garment → accessory → save/reopen → render workflow retains measurements alongside morphs, drivers, edited weights, limits, poses and source cages. The reviewed garment still fails fit: 102.9% maximum strain and 6.89 mm mean seam gap, with zero measured body crossings/inside vertices/clearance violations. It took 14.65 seconds.

A bounded installed-Blender cloth probe used full body triangles and a flat rest shape, but failed the seam/strain gate. A first measurement-based width warp closed seams while making strain/body crossings worse. Neither trial is shipped as an improved fit option. Conditions and figures are in `fusion-studio/research/garment-fit-2026-10-15.md`; private geometry and probe scripts remain under ignored test output. Next work must address drafting, source measurement grading, arm pose and initial wrapping together.

Verification: **127 JavaScript tests and 9 Rust tests pass**. Packaged measurement, combined workflow, failure diagnostics/strain undo, actual native Cancel/Escape/retry and worker/save/BLEND/Cycles/concurrency checks pass. Fresh BMW CPU/OptiX image differences are 0.00004774 / 0.00004340 against the <0.1 gate; original scene hashes and modification times remain unchanged. All 34,837 recorded installation entries and 15 sampled hashes pass preservation, and the original Genesis DUF is rehashed unchanged.

Release: `fusion-studio/release-v0.16.0/win-unpacked/Fusion Studio.exe`, launcher `Launch Fusion Studio 0.16.0.lnk`. ASAR SHA-256 `be22d576efef9c7e1c2473fe6210ecbf9b04051f5f1d042a1de703f84f160a82`; all 4,725 inventoried paths pass private-content/vendor-host/paid-scene exclusions. Packaged/unpacked native and worker files match source; the native component remains unchanged at its own 0.15.0 version. The previous release archive is unchanged. Details: `fusion-studio/docs/progress/2026-10-15-body-measurements.md`. No push or publication occurred.

The full goal remains active. Fit-aware drafting/grading and pose-aware sleeve placement are next, then renewed fit/contact gates, robust layered/animated cloth, calibration, finer drape budgets and the remaining modeling/render/interchange roadmap.

## Previous execution: Native cancellation and sewn collision continuity, 0.15.0

Native geometry now runs in an owned disposable helper process, with Electron utility processes in the desktop app and hidden Node children in command-line tests. Cancel, timeout, failure and completion confirm process exit before releasing the operation. Request identities reject stale replies. The workspace has a visible Cancel control and Escape cancellation; the last valid garment, selection, frame and undo history recover. In the final packaged detailed scene, Cancel/rollback measured 145 ms and Escape 111 ms, with the actual native process gone. Earlier worker threads could continue native CPU work for about 14 seconds after rejecting a request. Garment transactions now also reject late aborts and prevent stale rollback from replacing a newly opened project.

Version-2 sewn vertices and local neighbors share collision adjacency while retaining separate editable mesh/UV/material/pattern identities. A 10,000-triangle sewn-layer gate confirms unrelated interiors still collide. The neutral detailed Genesis fixture's maximum local strain falls from 104.31% to 78.83%, with zero body crossings/inside vertices, but its 6.70 mm seam gap and one clearance violation still fail fit gates. The final edited/posed packaged case has zero measured crossings/inside/clearance violations, 102.9% maximum strain and 6.89 mm mean seam gap: its peak is slightly lower than 0.14, while its seam gap is worse. No production-fit claim is made. Measurement/pose-aware placement and convergence remain required work.

Verification passes 121 JavaScript tests and 9 Rust tests. The original v1 capsule/BVH golden hash remains unchanged through a fixed legacy fixture, now included in the standard test command. Actual native process timeout/crash/cancel/recovery, detailed pattern and driver regressions, packaged worker/save/BLEND/Cycles/concurrency/cancel and the full 50,312-triangle Genesis → sewn garment → source-edited accessory → save/reopen → render workflow pass. A fresh packaged session checks failed-fit diagnostics, strain colors/undo and saved fixture preservation. The final render has no earlier chest breakthrough in the inspected view, while neckline/sleeve fit still needs refinement.

Release: `fusion-studio/release-v0.15.0/win-unpacked/Fusion Studio.exe`, launcher `Launch Fusion Studio 0.15.0.lnk`. ASAR SHA-256 `7b0f54bf339ba7d6d8e9720f1c0e011e0f34c380c93d7dbae7bf79b18ab04201`; all 4,724 archive paths pass private-content/vendor-host/paid-scene exclusions and the helper entrypoint is unpacked. Packaged helper/native hashes match source files. Both BMW CPU/OptiX image gates pass; 34,837 recorded installation entries and 15 sampled hashes remain unchanged, and the Genesis DUF is rehashed unchanged. Previous releases remain preserved. Details and public references: `fusion-studio/docs/progress/2026-10-15-cancellation-and-fit.md`; original fit experiments: `fusion-studio/research/garment-fit-2026-10-15.md`. Nothing is published or pushed.

The full goal remains active. Next priorities are measurement/pose-aware garment placement and fit convergence, evaluation of the existing Blender cloth Bridge for offline quality, robust layered/animated contact, calibrated fabric and finer drape budgets. Deeper modeling/sculpt/UV, render controls/sequences, broader character tools and interchange remain unfinished.

## Previous execution: Garment mesh quality and body contact, 0.14.0

Continued into the garment lane after the verified character foundation. Version-2 panel meshing now samples interiors and legalizes local unconstrained edges while preserving stable boundaries, holes, internal lines, pin IDs, material groups and partial sewing. The preview exposes a 20° angle target and unmet-target warnings. A detailed 23,430-triangle gate reaches 29.07° and verifies boundary counts without hanging edges; impossible acute corners remain explicitly unmet. New live T-shirt presets use v2; existing v1 documents and saved geometry are not silently converted on load.

Imported-body fitting recovers initially embedded placement with nearest-surface/parity queries and adds body crossings through cloth-face interiors to contact response and diagnostics. The compatibility notice explains initial panel/pin placement corrections and closed-body assumptions. The final packaged Genesis workflow now reports zero measured face intersections, inside vertices and clearance violations on its 2,478-triangle garment, minimum angle 27.14°. The rendered view no longer has the previous chest breakthrough. Fit remains unfinished: maximum local strain is 108.8%, mean seam gap 6.18 mm, sleeve/neckline refinement is needed and diagnostics are visibly unconverged. The final drape took 15.59 seconds.

Verification passes 110 JavaScript tests, 8 Rust tests, a 16,128-triangle thin-body/5,000-triangle cloth recovery gate, packaged detailed pattern preview/apply/undo/save/cancel, character-driver regression, worker/save/BLEND/Cycles/concurrency/request-cancel and the complete character → garment → source-edited accessory → save/reopen → render workflow. A fresh packaged session reopens the saved scene, checks visible failure diagnostics, toggles/undoes strain colors and preserves saved fixture bytes. Increasing-size meshing and five-step drape timings remain explicit rather than advertised as interactive. A separate cancellation probe found request rejection at 1.04 seconds but native-thread exit at 14.40 seconds; releasing native CPU work promptly is required next.

Release: `fusion-studio/release-v0.14.0/win-unpacked/Fusion Studio.exe`, launcher `Launch Fusion Studio 0.14.0.lnk`. ASAR SHA-256 `fc2b0acf971c0cb37aa59d24d21a0c9e98c0815e63ebb41e1398b8a28f0dd5bb`; all 4,724 inventoried paths pass private-content/vendor-host/paid-scene exclusions. Both BMW CPU/OptiX image gates pass; 34,837 recorded installation entries and 15 sampled hashes remain unchanged, as does the Genesis DUF hash. Original installations/assets and earlier releases remain intact. Source, public algorithm references, numeric/visual evidence, performance and limitations are in `fusion-studio/docs/progress/2026-10-15-garment-quality.md`. Nothing is pushed or published.

The full goal remains active. Native cancellation/resource recovery, sewing/strain convergence, robust layered contact, measurement grading and animated collider drape remain required before production garment quality. Deeper modeling/sculpt/UV tools, rendering/sequences, broader character controls and interchange also remain unfinished.

## Previous execution: Safer dependencies and imported rotation drivers, 0.13.0

Resumed development on request after the explicit pause. Character shaping now has a Dependencies inspector, authored/evaluated values, searchable outputs and diagnostics, plus undoable pause/resume of imported rules. Qualified local asset identities and verified unit-scale rotation frames bind the supported DSON subset. The owned detailed Genesis fixture retains 20 formulas, 137 verified frames and 16 driven joints; its eye control moves by 3°. Iterative bounded evaluation detects cycles/unsupported operations, propagates authored limits downstream and stages complete rotation/morph updates before committing. Correctives, garment collision and sampled animation see the evaluated pose.

Authored poses remain separate from driver offsets through FK, pose reuse, history and project reopening. Failed playback, sampled export and IK previews restore the previous physical state; conflicting IK/driver hierarchies produce an actionable report. Corrective clearing/keying cannot leave partial history after dependency failure. Standard exchange warns before baking evaluated motion and strips editable graph/frame caches to avoid double application on reimport. Fusion projects retain authoring metadata; legacy imports need a fresh editable source import for verified frames. Root hip, non-unit/unverified frames, unsupported output bindings and pose-corrective-to-rotation chains remain explicit limits.

Acceptance passes 108 JavaScript tests, 6 Rust tests, 33 Blender modeling jobs, source IK animation, packaged formula/weight/limit/pose UI regressions, packaged worker/save/BLEND/Cycles/concurrency/cancel and the combined Genesis → garment → accessory → save/reopen → Cycles workflow. A separate direct-source-pose Blender reference agrees within 8.82e-7 m across the 50,312-triangle skin and 8.95e-8 radians at tested joints; this is not native DAZ deformation parity. The check exposed and repaired the bridge's rest-pose export default by explicitly exporting current poses. Warm formula medians at 128/1,024/4,096 dependencies are 2.4/12.8/58.8 ms; detailed Genesis evaluation is about 9 ms, excluding display/history/cloth. Large graphs exceed an interactive frame budget.

Release: `fusion-studio/release-v0.13.0/win-unpacked/Fusion Studio.exe`, with `Launch Fusion Studio 0.13.0.lnk`. ASAR SHA-256 `dc3b113873a7bc1dfcc6a4fa7ad9d011cea08f9adbf83a2b6cdb0dce928f24e3`; all 4,724 inventoried archive paths pass the private-content/vendor-host/paid-scene exclusions. Both BMW CPU/OptiX image gates pass; 34,837 recorded installation entries and 15 sampled hashes are unchanged. Previous releases and user assets remain preserved. Evidence, public specification links and unsupported cases are in `fusion-studio/docs/progress/2026-10-15-formula-drivers.md`. Nothing is published or pushed.

The full goal is not complete. The packaged garment still fails production fit: visible chest/side breakthrough, uneven neckline, three clearance violations, 199% maximum local strain and `converged:false`. The next priority is quality-constrained garment meshing/contact, then measurement grading and animated collision; broader character tools, deeper modeling/UV/sculpt, render controls/sequences and interchange remain open.

## Previous execution: Source-aware skin weights, 0.12.0

Continued the standing unified-excellence goal with skin-weight authoring in the Character workspace and viewport. Replace/Add/Subtract/Smooth brushes, precise inspected-vertex assignment, persistent joint locks, normalization and explicit four-influence removal review now operate on imported production rigs. DSON source identities synchronize verified material/UV seam copies; unprovable or conflicting mappings block instead of silently welding different skin. The shaded heatmap and surface brush cursor are separate preview objects, excluded from snapshots, GLB and rendering.

Each stroke stages data until release. Escape/pointer cancellation discards it. Current input hashes cover topology, source IDs, skin/bind data, pose world transforms, morphs and locks. Commit prepares independent replacement buffers and re-drapes linked garments within the same undo boundary; failures/cancellation restore the prior scene. Compatible procedural body resizing retains authored weights and path/name lock identities. Schema-2 projects save actual buffers and reject malformed incoming lock metadata before replacing the open document. General-weight GLB export is numerically checked; exact DAZ/vendor skinning is not claimed.

Release gates include 97 JavaScript tests, 6 Rust tests, detailed Genesis desktop tests (25,182 source / 27,087 split vertices, 138 joints, 50,312 triangles), actual mouse strokes, pruning review/cancel, locks, undo/redo, occlusion/explicit through-paint, failure recovery, project roundtrip and GLB weight comparison. The combined packaged workflow edits a blended forearm twist weight, shapes and poses the figure, re-drapes sewn clothing, edits an accessory source cage, saves/reopens and renders in Cycles. Weight preparation and commit remain hundreds of milliseconds on increasing detailed fixtures; a 523-vertex region traversal measured 2–5 ms, which excludes picking, display, snapshots and cloth. Limits remain explicit at 300,000 viewport vertices, 2,048 joints, 1,024 parts and four influences.

Release: `fusion-studio/release-v0.12.0/win-unpacked/Fusion Studio.exe`; launcher `Launch Fusion Studio 0.12.0.lnk`. Packaged worker/render/cancel, pose/limit and pattern regressions pass. BMW CPU/OptiX image comparisons remain within the fixture gate. All 34,837 recorded installation entries and 15 sampled hashes remain unchanged; the original Genesis DUF hash matches. Package scanning excludes private dumps and paid scenes/assets. Source, evidence and limits are in `fusion-studio/docs/progress/2026-10-15-skin-weight-editing.md`. No publication or push occurred; earlier releases remain available.

The overall goal remains active. Safer formula binding/coverage is the next character priority. Weight symmetry/transfer/auto-rig, broader rig controls and production garment meshing/contact/grading/animated collision remain unfinished. The garment acceptance render still has visible body breakthrough, three clearance violations and high local strain; successful rendering is not acceptable final garment fit.

## Previous execution: Character limits and reusable poses, 0.11.0

Continued under your unified-excellence brief after the requested pause/resume. Fusion's Character workspace now includes original authored local XYZ limits and a reusable pose library. FK, two-bone/longer IK and per-frame animation export honor bounds. Pose capture retains joint rotations with named hierarchy/rest-axis fingerprints; incompatible rigs are blocked, and applying beyond current bounds or releasing enabled IK requires explicit review. Pose files are bounded plain JSON written to new Fusion-owned files. Body shaping, skin weights, object transforms and animation keys remain independent.

Limit/pose changes and linked garment re-drapes form one recoverable edit. Cancellation, worker failure, formula failure and a newly opened project are guarded before committing. Undo/redo retains character selection. Procedural body resizing retains limits and saved poses. Exports warn that editable limits require the Fusion project, then retain evaluated motion without embedding pose/shaping libraries.

Acceptance includes 89 JavaScript tests, 6 Rust tests, real Genesis desktop tests (138 joints, 50,312 triangles), IK animation exchange, shaping/source-cage/pattern regressions, packaged worker/render/save/cancel tests and the complete Genesis shaping → bounded pose/preset → sewn garment → source-edited accessory → save/reopen → Cycles workflow. An authored 80° forearm request clamps to 10° with measured quaternion error 0 rad. Pose reuse reproduces detailed skinned vertices within 1.11e-7 m while preserving weight buffers. Evaluation samples at 50,312 / 100,624 / 150,936 triangles record collision extraction around 37 / 44 / 49 ms on this PC. Static-pose cloth still needs roughly 10 seconds per re-drape (longer under concurrent load), retains three clearance violations/high local strain in the acceptance scene, and is explicitly unfinished.

Release: `fusion-studio/release-v0.11.0/win-unpacked/Fusion Studio.exe`; launcher `Launch Fusion Studio 0.11.0.lnk`. Previous releases remain preserved. Both BMW CPU/OptiX image gates still pass; all 34,837 installation entries and 15 sampled hashes remain unchanged, and the original Genesis DUF hash matches. Package scanning finds no vendor scenes/assets, CursorWork dumps or Ghidra artifacts. See `fusion-studio/docs/progress/2026-10-15-character-controls.md` for fidelity labels, limits, evidence and remaining work. Nothing was pushed or published. The overall goal remains active; weight editing and safer dependency coverage are the next character priorities, followed by production garment quality/contact/grading.

## Previous execution: New decompilation index and original implementations, 0.10.0

You supplied `CursorWork/output-v2/CODEX_INDEX.json` and asked to proceed using the decompiled binaries. All four indexed manifest/completion/binary/record identities were verified. The exports contain bounded selected subsets: DAZ4 64/170 matched functions, CC5 21/21, Marvelous 64/3,288 and Blender 5.2 64/532. Some selected bodies are only static string initialization, so no solver-parity claim follows from their completion markers.

The findings guided original implementations of:

- Retained modifier source-cage component editing with one-step edit/evaluation undo and rollback. View switching and project reload preserve the source; export, rendering and Apply use the evaluated mesh even during source display.
- Modifier capability metadata, stable-ID validation, before/after geometry/channel reports and lost-attribute warnings. Boolean operands resolve evaluated stacked geometry even when hidden or displaying a source cage. Direct brush/material/UV/shading paths and transform gestures cannot silently corrupt the cached projection. Normalized integer vertex attributes retain their encoding during component remaps.
- Character shaping presets with SHA-256 source/topology/rest/morph identities; authored values stored separately from evaluated outputs; grouped capture/apply/reset, exact-ID subset review, incompatible-base blocking, undoable project storage and new-file export/read-only import.
- Adaptive physical seam-length measurements for line/cubic/partial sewing, signed delta/ease, mismatch warnings and visible correspondence-direction arrows. The measurements remain identical across mesh refinement.

Evidence and limits are in `fusion-studio/research/codex-index-*-2026-10-15.md` and `fusion-studio/docs/progress/2026-10-15-index-guided-features.md`. Private dumps, QtWebEngine analysis, paid assets and vendor installation files remain preserved. Raw pseudocode is excluded from source and packages.

At your request, all current source, tests, documentation and analysis scripts were committed before further work in initial checkpoint `94e376e`. Generated builds, private decompiler outputs/databases, downloaded tool sources and user assets are ignored rather than included in Git. Nothing was pushed or published.

The 0.10.0 release is packaged at `fusion-studio/release-v0.10.0/win-unpacked/Fusion Studio.exe`, with `Launch Fusion Studio 0.10.0.lnk` in the parent workspace. The packaged worker/save/render/cancel test, retained-source/Boolean tests, shaping preset tests, pattern-v2 desktop tests and complete Genesis/preset/garment/accessory/save/reopen/Cycles workflow passed. Release gates: 73 JavaScript tests, 6 Rust tests, 33 modeling-worker jobs including restart/recovery, BMW CPU/OptiX preserved-render comparisons, and preservation of all 34,837 recorded installation entries with 15 matching sampled hashes. Residual cloth clearance/high-strain diagnostics still prevent any production-ready claim.

## Latest execution: Integrated modeling, character and garment upgrade, 0.9.0

After the request to implement the combined plan and continue through refinement, Fusion Studio gained one connected scene-evaluation path:

- Project/object/revision/input-hash worker tickets, dependency ordering, stale-result rejection and atomic rollback. New project files use schema 2; schema-1 files migrate without overwriting the original version.
- Vertex, edge and face selection; box and connected selection; component transforms; split, dissolve, merge-by-distance, deletion and region extrusion in the Rust core. Material groups and UV/source seams are rebuilt through explicit vertex/face remaps.
- Persistent Blender-backed modifier stacks with add/update, reorder, enable/disable, duplicate, remove and Apply. Every parameter change evaluates the retained source mesh instead of baking over the last result.
- Searchable categorized imported morph controls with limits, reset and keying; stable sparse source-vertex mappings across material splits; safe arithmetic/linear/TCB DSON formula chains; cycle and unsupported-operation diagnostics; pose-driven correctives.
- Pattern schema 2 with stable line/cubic segment IDs, holes, internal lines, partial-edge sewing and darts, plus deterministic migration from existing polygon patterns and seam correspondence through refinement.
- Directional XPBD fabric, bending, friction, triangle body/self contact and swept vertex/face and edge/edge checks. Re-drape is cancellable and retains the last valid garment until successful replacement. Strain, seam, clearance/penetration and mesh-quality diagnostics remain visible.
- CursorWork exporter repair: explicit UTF-8, resumable output, per-function errors and completion manifests tied to binary hashes and function counts. A fresh Ghidra 12.1.4/PyGhidra smoke export and all 10 protocol tests passed. Focused DAZ/CC/Marvelous findings are recorded as static evidence, not algorithm parity.

Detailed acceptance uses a 36,864-triangle modeling mesh, a 24,616-triangle curved/holed pattern fixture and a real Genesis 9 scene with 50,312 character triangles and 138 bones. The integrated desktop test imports Genesis, changes a sparse morph, poses `l_forearm`, edits an eight-seam garment, evaluates a beveled accessory stack, saves/reopens schema 2 and completes a 640×360, 16-sample CPU Cycles render. Triangle-based garment re-drapes took about 9.3 seconds for 160 steps on this PC. The garment still reports 3–4 clearance violations and high maximum local strain; the 4.79° minimum pattern triangle angle is also below the quality target. Fusion presents these as inspection diagnostics rather than production-ready output.

Original vendor code, pseudocode and paid assets are excluded from distributable Fusion code. Installed programs were not launched for this upgrade except the already-authorized isolated Blender worker. Current evidence and remaining parity work are in `fusion-studio/docs/progress/2026-10-14-integrated-workspace.md`.

Release: `fusion-studio/release-v0.9.0/win-unpacked/Fusion Studio.exe`; launcher: `Launch Fusion Studio 0.9.0.lnk`. The release executable passed the general packaged worker/save/BLEND/Cycles/cancel test and the packaged deformation, pattern-v2, integrated modeling and complete Genesis/garment workflow tests. Final gates: 53 JavaScript tests, 6 Rust tests, Blender interchange/cloth, all source UI regressions, BMW CPU/OptiX preserved-scene comparisons, 10 CursorWork export-protocol tests, and 34,837 installation records with zero changed/added/missing paths plus 15 matching SHA-256 checks.

## Latest execution: Hybrid Roadmap, 0.8.0

After you requested “Exucute roadmap plan” and “Continue,” the following was implemented:

- Original native Rust/napi-rs module with bounded half-edge topology validation, a collision BVH, spatial hashing, and an XPBD cloth preview. The full editable geometry kernel is not finished.
- A linked Fusion body and T-shirt: change height/proportions or a pose preset, automatically regrade the original panels, re-drape, and render the current scene without switching apps.
- Persistent character/garment IDs and original panel data; one-step body-plus-garment undo/redo, save/reload with subsequent re-fit, and atomic rollback on a failed native job.
- Pattern editor works on clearly labeled original panels at a 1.8 m reference size. Apply re-drapes the same garment; Cancel discards the draft. No extra garment copy is created for a linked pattern edit.
- Strain heatmap with a blue-to-red legend, persistent display state, and correct return to ordinary fabric colors for export/render.
- Static posed capsule/ellipsoid body proxies, seam ramping, triangle/edge contact samples, compatibility warnings before creating a linked preview, and fit metrics in Clothing.
- Private Rust/compiler setup inside the project; native code and dependency inventory packaged without the compiler downloads, vendor installations, or test assets.

The reviewed default shirt has 882 vertices / 1,536 triangles. Its mean seam gap reduces from approximately 69.36 mm after initial placement to 0.0203 mm. Mean absolute edge strain is approximately 1.83%, maximum local strain 32.3%, with zero pin drift and zero vertices inside the test body proxies. Re-fit takes about 1.2–1.3 seconds on this PC. A relaxed pose has higher local strain; production cloth quality and the 50k-triangle interactive target remain open. Earlier failed drapes were inspected visually and corrected; numeric seam closure alone was insufficient.

Validation: existing 33-unit suite, five native/JS hybrid tests, three Rust tests including 1,000 BVH-vs-linear queries, desktop linked-workflow tests, real Cycles output, save/reload, pattern editing, heatmap, undo/redo and failure rollback. The packaged application is tested separately; latest pass reports live under `fusion-studio/test-output/hybrid-*-results.json`. Original-install verification remains 34,837 records unchanged and 15 selected SHA-256 checks matching.

Current release path: `fusion-studio/release-v0.8.0/win-unpacked/Fusion Studio.exe`. Detailed scope and unresolved limits are in `fusion-studio/docs/progress/2026-10-13-hybrid-slice.md`. This milestone does not complete the overall roadmap or full feature-parity goal.

This file records the project direction, the requests that shaped it, work completed so far, validation performed, and the major work still required. It describes Fusion Studio honestly as an original application inspired by established 3D workflows; it does not copy or embed the proprietary implementations of Blender, DAZ Studio, Marvelous Designer, or Character Creator.

## Your requests and decisions

| Request / decision | Project response |
| --- | --- |
| Build an ultimate 3D modeling tool from software already installed on the PC. | Created Fusion Studio as a new Electron and Three.js desktop application in `fusion-studio`. |
| Use Blender 5.2, DAZ Studio 4, Marvelous Designer Enterprise, and Character Creator 5 as references. | Studied safe runtime-facing capabilities and built original equivalents, import paths, and workflow-inspired tools. |
| Do not modify original files on the C: drive. | All program operations use private temporary profiles, private scripts, output folders, and verification. Original installations and selected assets remain unchanged. |
| First usable workflow: an all-in-one modeling workspace with character and clothing handoffs. | The application has a Blender-inspired single workspace, character tools, pattern/sewing tools, import/conversion, and rendering. |
| Combine them into one new and improved program, with no application switching. | Fusion Studio owns the editor UI. Blender is used only as an isolated private worker for file conversion, baking, and rendering where enabled; its UI is never used as a required handoff. |
| Use Blender as direct UI inspiration. | Implemented Blender-style viewport, outliner, properties panels, mode-oriented tools, timeline, operator search, transform controls, and panel layout persistence. |
| Include all feature categories from the source programs; warn before mesh compatibility issues. | Added compatibility preflight and warnings before lossy import/conversion, topology-changing operations, native-scene detachment, and unsupported combinations. Full feature parity remains in progress. |
| You may use locally owned paid assets and characters for testing. | Local DAZ/BMW assets were used only for private verification. They are not packaged, published, or included in the source project. |
| Follow the supplied next-steps plan while reaching the larger goal. | The supplied `NEXT-STEPS-PROMPT.md` informed the staged architecture, feature coverage tracking, and honest roadmap. |
| Continue the existing app with a Rust/WASM mesh core and persistent Blender worker. | The persistent Blender worker and native Rust topology/cloth/attachment core are implemented. A WASM target remains future work. |
| Plan for open-source code under an appropriate license. | The original Fusion Studio code is MIT-licensed. Proprietary programs, paid assets, and copied runtime contents are excluded. |
| Create replicas through heavy inspiration, rather than copying software. | Implementations are independently written. No vendor UI/source/DLL implementation is embedded. |
| Keep going until all features are added and refined. | Work is ongoing; this document lists what is complete and what remains. |
| Use the supplied BMW CPU and GPU `.blend` files for render testing. | Both supplied BMW files are used as private render fixtures and are protected with hash/mtime checks. |
| Use CursorWork decompilation and Ghidra where needed to accelerate major changes. | Repaired and revalidated the evidence pipeline, then used focused static findings only to guide independent implementations; private pseudocode remains outside distributable source. |
| Implement the combined modeling, character and garment plan in one release. | Delivered the 0.9.0 vertical workflow and acceptance tests described above, while keeping remaining feature-parity gaps explicit. |
| Use detailed 3D meshes for testing and target professional quality. | Added 24k–50k triangle fixtures and real Genesis end-to-end testing. Quality diagnostics now prevent unconverged/high-strain/poor-angle results from being presented as production-ready. |
| Commit before continuing; pause when requested, then resume development. | Work was checkpointed before resuming; the full goal is active and release milestones are committed locally. No publication is implied. |

## Safety, ownership, and preservation

- Source installs remain at:
  - `C:\Program Files\Blender Foundation\Blender 5.2`
  - `C:\Program Files\DAZ 3D\DAZStudio4`
  - `C:\Program Files\Marvelous Designer Enterprise Network Offline`
  - `C:\Program Files\Reallusion\Character Creator 5`
- A preservation scan currently tracks 34,837 installation records. The latest verification reported zero changed, added, or missing files and matched SHA-256 hashes for 15 selected files.
- Blender runs only as an owned background process with a private user profile, private temporary directory, private scripts/extensions, disabled auto-execution, and no source-file saves.
- Original `.blend` fixture files are verified before and after test work. The CPU and GPU BMW sources have retained their expected SHA-256 hashes.
- No paid asset, character, installation runtime, or proprietary source is packaged into Fusion Studio or prepared for publication.
- An abandoned private DAZ runtime copy is excluded from packages and retired. It has not been deleted because automatic review blocked that deletion attempt.

## Delivered application releases

The project has preserved iterative Windows releases from 0.2.1 through 0.8.0. The current release is:

- Launcher: `Launch Fusion Studio 0.8.0.lnk`
- Application: `fusion-studio\release-v0.8.0\win-unpacked\Fusion Studio.exe`

No installer, source repository publication, pull request, or asset upload has been created.

## Architecture delivered so far

Fusion Studio is an Electron desktop application with Three.js as its interactive scene/editor representation. It uses a guarded IPC/core layer and an optional persistent Blender 5.2 worker for supported conversion, baking, and native-scene rendering tasks.

- The editor maintains its own scene, selection, history, viewport, material controls, animation state, compatibility state, and project serialization.
- Worker jobs are isolated, serialized, authenticated with private protocol tokens, cancelled/closed by the app, and operate on fresh job data. A worker crash is recoverable without replaying a dangerous write operation.
- `.fusion` documents persist editor content and embedded native Blender scene resources where appropriate. Generic GLB exchange excludes private native-scene payloads.
- The current document format is JSON-based. Binary persistence and the Rust/WASM geometry kernel are not yet implemented.

## Hybrid-roadmap direction adopted for future work

The attached hybrid roadmap clarifies the product's central vertical slice: change a body shape, re-fit a garment from its original patterns, drape it in the current pose, and render the single scene without export/import handoffs. This remains the organizing objective for the unfinished work.

- Build the geometry foundation before expanding the worker-operator list: half-edge topology, BVH, spatial hash, sparse vertex deltas, and a constrained 2D triangulator.
- The existing Rust/WASM intent is refined to a native Rust `napi-rs` module for the Windows desktop app, where threads and SIMD are useful. A WASM build can remain an optional future web target.
- Evaluate permissively licensed components for narrow, auditable roles: Manifold for booleans, meshoptimizer, OpenSubdiv, and Rapier/Bullet for collision. License compatibility must be confirmed before inclusion.
- Evolve garments into non-destructive scene nodes that retain patterns, seams, fabric, and simulation settings, rather than treating their draped mesh as the source of truth.
- Target an XPBD cloth solver with stretch, shear, bend, seam, pin, pressure, friction, and self-collision constraints. Add fit and tension/strain diagnostics alongside the solver.
- Build the character path around a native skeleton format, skinning, sparse morph deltas, pose-space correctives, body measurements, pose/expression libraries, skin shading, and eventually strand-based hair.
- Make auto-regrade after body morphs, live 2D pattern edits, pose-and-bake, garment fit transfer, and a single Character/Garment/Prop/Material scene graph first-class hybrid workflows.
- Prioritize modeling in this order after the geometry core: edit mode, sculpting, then UV authoring.
- Keep the private Blender worker for Cycles-class final renders; later add a strong real-time/WebGPU preview path.
- Add golden-mesh tests for morph and cloth systems before they become large, and establish interactive-performance budgets such as a 50k-triangle garment target.
- Before distributing any converter or bundled compatibility layer, review relevant DAZ, Reallusion, Marvelous Designer, and asset licenses. Public branding should state factual file compatibility rather than using vendor product names.

## Core editor and modeling work completed

### Workspace and basic editing

- Blender-inspired single-window workspace with viewport, outliner, properties, panels, command/operator search, status/log area, and persisted panel layout.
- One live 3D viewport is preserved across area resize, swap, maximize, join, and document reload actions.
- Primitive creation, object selection, object transforms, transform gizmos, numeric transform entry, copying, deletion, and scene organization.
- Face-level coplanar extrude/delete, draw/inflate/smooth tools, planar smart UV projection, and PBR material controls with presets.
- Command history with transform/insert deltas, snapshot fallback, undo/redo, large-scene safeguards, and operation preflight messages.
- Operator registry, parameter validation, locked-operation state, F3 command search, and last-operation adjustment support.

### Mesh operations

The following 18 worker-backed operations are available as configurable, independently defined operators:

1. Subdivide
2. Bevel
3. Decimate
4. Solidify
5. Mirror
6. Remesh
7. Array
8. Wireframe
9. Weld
10. Triangulate
11. Smooth
12. Twist
13. Bend
14. Taper
15. Stretch
16. Recalculate normals
17. UV operation
18. Boolean difference, union, and intersect

Operations use a working-copy transaction model so a failed job does not overwrite the live editor state. Blender is not treated as a long-lived authoritative scene cache.

### Interchange and projects

- Tested GLB, FBX, OBJ, and BLEND intake paths.
- GLB export supports selected objects, animation inclusion, and native-proxy exclusion.
- Compact geometry serialization avoids needless duplication across material splits while retaining indices, UVs, skin weights, and morph data.
- Imported GLB animation clips are preserved with loop/clamp behavior and stable timeline scrubbing.
- `.blend` import offers two explicit modes before import:
  - **Preserve native scene:** keep a private packed Blender scene for high-fidelity rendering, with evaluated viewport proxies.
  - **Editable mesh/rig interchange:** create generic editable geometry/rig data with known shader and feature approximation limits.
- Compatibility messages are displayed before known fidelity loss, unsupported topology use, data detachment, and conversion risks.

## Character and DAZ-inspired work completed

- Parametric 17-bone humanoid creation, FK posing, body proportion controls, and static character copies.
- IK system with hierarchy paths, analytic two-bone pole solving, CCD chains of 3–8 parents, optional orientation control, target/pole handles, and a visible skeleton helper.
- Rig editor controls to create end or chain rigs, configure targets/poles, enable/disable solvers, release/delete rigs, and key IK properties on the timeline.
- Rig-aware history, undo/redo, serialization, and generic interchange baking. Export preflight identifies when active IK needs baking.
- Dense evaluated animation sampling for nodes and morphs, with safety limits and restoration of editor state after export.
- Demonstrated very low hand-target error on a locally tested Genesis 9 import. This confirms the implemented IK solver path, not full character-system equivalence.
- Direct DSON/DUF/DSF reader for supported uncompressed or gzip JSON forms, built without launching DAZ Studio. It supports selected Genesis 8/9 topology, UV/material groups, sparse base morphs, bones, and skin weights.
- The Genesis 9 test asset loaded with its documented vertex/face/bone/mesh/morph counts in the private test report.

Not yet equivalent to DAZ/CC character systems: ERC/formula evaluation, HD morph workflow, grafts, conforming behavior, vendor shader compatibility, full hair systems, weight painting, joint limits, retargeting, morph-curve authoring, and full-body production rigging.

## Clothing and Marvelous-inspired work completed

- Pattern designer UI with drawing and editing support for polygons.
- Concave polygon triangulation, uniform midpoint refinement, pin controls, full-edge sewing, placement, duplication, fabric choice, and a T-shirt starter pattern.
- T-shirt starter includes a 14-point body outline, 8-point sleeves, 68 spring joins, and back/shoulder pin setup.
- Approximate cotton, silk, and denim presets for the current solver.
- Baked cloth path using the private Blender worker and a static drape/seam validation workflow.
- Measured private test result reduced mean seam gap from approximately 0.44 m to 0.00837 m over 80 frames with zero measured pin drift in that fixture.

Not yet equivalent to Marvelous Designer: curved pieces, holes/darts, grading, layered garments, production collision behavior, animated cloth authoring, MD file formats, full sewing pattern authoring, and validated anti-penetration targets.

## Rendering and BMW fixture work completed

### Generic scene rendering

- Cycles-backed rendering from the app with selected device setting, resolution, samples, denoise controls, and current/source or viewport camera selection.
- Device selection supports CPU, CUDA, and OptiX. GPU requests verify a matching device rather than silently falling back to CPU.
- Render output is written only to a private job folder.

### Preserved native Blender scene rendering

Version 0.7.0 added a protected native-scene bridge for `.blend` imports:

- The imported Blender scene is packed into a private, embedded resource inside the Fusion project.
- Native scene bytes are validated by size, format header, Base64 syntax, SHA-256 hash, and bounded transform values before rendering.
- The bridge renders original Blender materials, lighting, world settings, camera, color management, and source camera directly from the packed private scene.
- File-output compositor nodes are muted in the private render copy to prevent imported scenes from writing outside the job output directory.
- Evaluated static viewport proxies let the native scene appear in the Fusion viewport.
- Fusion-created ordinary geometry can be added to a native-scene render; this was demonstrated by adding a green sphere to the BMW fixture scene.
- Native root transforms are supported by freezing constraints at the imported frame in the private render scene. The UI warns that world-space appearance can change when this is done.
- The app detects modified native viewport proxies and blocks a misleading native render. It tells the user to undo or make an editable converted working copy first.
- “Make converted working copy” retains the original native scene hidden and creates an explicit editable approximation, with confirmation and undo/redo support.

### BMW CPU/GPU private test result

The supplied BMW CPU and GPU files were rendered privately at 640×360, 16 samples, with denoising. This is a fidelity fixture, not an official performance benchmark.

- The source files use Cycles, 35 source samples, 1920×1080 at 50%, Standard view transform, 53 objects, camera `Camera`, and world `World`.
- The native preserved render route matched private direct Blender reference images with mean absolute RGB-byte difference near 0.00004, below the test gate of 0.1.
- CPU and OptiX fixture paths passed. The tested GPU was an RTX 4060.
- Approximate reference times were 3.1 seconds CPU and 1.9 seconds OptiX for isolated single renders, excluding application startup. These figures are not a fair system benchmark.
- A generic GLB conversion was also measured and visibly lost vehicle-paint/lighting fidelity, confirming why the preserved native mode is required for this content.
- A transformed native scene passed the bridge’s world-matrix error check below 1e-4. The test does not require pixels to remain identical after a world transform, since world-space shaders and environments can legitimately change.

## Automated and manual verification completed

- Current JavaScript test suite: 33 passing tests.
- Native scene tests cover resource checksum/header/transform validation, fingerprint behavior, geometry/material change detection, and serialization edge cases.
- Packaged Electron UI test covers BMW import warning, native OptiX render, ordinary geometry added to native render, save/reload, root transform, detachment cancellation/proceed flows, and undo/redo.
- Real Blender integration tests cover GLB/OBJ/FBX/BLEND import, mesh operations, rendering, and import round trips.
- Editable BLEND interchange was manually verified on a rigged fixture with skins present and no native-scene resource attached.
- Packaged ASAR contents were checked for the native-scene script and exclusion of private runtime copies/test outputs.
- BMW output and native preserved renders were visually inspected; original orange car paint, dark glass, lighting, and the added green Fusion sphere appeared as expected.
- All test-created Fusion processes and temporary jobs were closed/cleaned after validation.

## Documentation and evidence already in the project

- `fusion-studio\README.md` — setup and project overview.
- `fusion-studio\FEATURE-COVERAGE.md` — current feature coverage and explicit gaps.
- `fusion-studio\docs\ROADMAP.md` — staged future work.
- `fusion-studio\docs\progress\2026-10-13-bmw-render.md` — historical generic interchange render evidence and limitations.
- `fusion-studio\docs\progress\2026-10-13-preserved-rendering.md` — native preserved-scene render evidence, metrics, and limitations.
- `fusion-studio\research\preservation-verification.json` — installation/asset verification output.
- `fusion-studio\test-output\bmw-render-results.json` — private BMW test metrics.
- `fusion-studio\test-output\native-scene-packaged-results.json` — packaged UI/native-scene results.
- `fusion-studio\test-output\blend-interchange-results.json` — editable BLEND interchange result.

## Historical 0.9 limitations and subsequent roadmap

The following is still required before Fusion Studio can honestly be called feature-complete relative to all requested categories:

1. Native Rust geometry core: half-edge mesh, BVH, spatial hash, sparse morph deltas, constrained panel triangulation, and a stable scene-node model.
2. A vertical hybrid slice: one body, a T-shirt pattern set, a height/body-morph slider, automatic pattern regrade, live re-drape, pose support, and one-scene final rendering.
3. Non-destructive garment nodes with XPBD cloth, seam/pin/fabric constraints, self-collision, tension/fit diagnostics, curved panels, darts, grading, layers, animated caches, and production collision behavior.
4. Character authoring: native skeleton/skin data, weight painting, joint limits, advanced constraints, retargeting, morph and corrective authoring, face/pose libraries, skin shading, hair, and character-control rigs.
5. Native per-object mesh and material editing while retaining native Blender render fidelity. Current preserved scenes use static viewport proxies; direct proxy edits are intentionally detected and blocked before native rendering.
6. Native animation/controller synchronization, multi-scene composition, and broader external-library/physics-cache fidelity assessment.
7. Full edit-mode tools, sculpting, UV seams/editor, non-destructive live modifier stacks, lighting/camera editors, render sequences, cancellation, and a real-time/WebGPU preview path.
8. Full Blender-like area/editor coverage, customizable keymaps/preferences, binary project persistence, and further operation migration.
9. Broader import/export coverage and validation for STL, PLY, USD, Alembic, and complex production files.
10. Golden-mesh regression tests, performance budgets, continued usability refinement, licensing review, packaging polish, and eventual open-source release preparation.

## Historical 0.9 status

Fusion Studio 0.9.0 is a working original application with a unified Blender-inspired editor and an integrated modeling, imported-character, pattern-clothing and rendering workflow. It now has native component topology edits, retained-source modifier stacks, sparse morph/formula/corrective evaluation, curved/holed/partially sewn patterns, triangle-contact cloth, revision-safe transactions, schema migration, protected `.blend` rendering and detailed end-to-end evidence. It is not yet a finished replacement for Blender, DAZ Studio, Marvelous Designer, or Character Creator. Remaining priorities are advanced modeling/sculpt/UV/material tools, full character authoring and exact vendor deformation, production-quality layered/animated cloth, native CC/MD project support, richer animation/render editors and editable native-scene data without silently sacrificing fidelity.

## 2026-10-26 — GitHub overview and verified workflow gallery

- User request: update GitHub with a full app description and carefully presented real screenshots/workflow videos.
- Replaced the root overview with the integrity-preserving intermediary purpose, current features, accurate per-format scope, setup, architecture, validation, performance context, limitations and licensing boundaries. Current package is 0.1.0; historical v0.0 notes remain preserved and linked.
- Added `fusion-studio/docs/WORKFLOW-GALLERY.md`, 11 full-resolution screenshots, three captioned 1920×1080 H.264 videos (native 22.87 s; sculpt 24.24 s; character 49.20 s), container chapter markers, WebVTT captions and a silent GIF reel. Dated capture/media manifests retain checks and file hashes.
- Native demonstration: newly authored 80-mesh / 70,720-triangle optical instrument; actual preserved .blend import and 64-sample Cycles OptiX render; original SHA-256 unchanged.
- Sculpt demonstration: newly authored 156,672-triangle closed stoneware mesh; actual Draw Sharp/Smooth strokes and numeric-position undo/redo checks. Signed zero is canonicalized for the numeric hash because JSON normalizes -0 to 0.
- Character demonstration: verified CC0 foundation only; body/face/skin/hair/pose controls, isolated neutral-space custom shape sculpt, influence mixing, keyframe, save/reopen recipe equality. Full-body capture uses the explicitly labeled coverage preview shell. No private Genesis or paid assets published.
- Validation: current Vite build passed; documentation scripts passed syntax checks; all three MP4s decoded in full without error; generated media inventory records resolution, duration, hashes and sizes. These capture gates do not replace full release regression or certify remaining garment/portrait/native-format gates.
- Capture and fixture generators write into ignored test-output using isolated app profiles. The first fixture launch unexpectedly loaded user Blender add-ons and sandbox-blocked configuration writes; fixture generation was rerun with factory settings, disabled auto-execution and workspace-local configuration. No product implementation or release version was changed by this documentation task.

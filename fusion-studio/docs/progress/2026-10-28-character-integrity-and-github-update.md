# October 28 — Character integrity and GitHub development update

The user requested review of the newly implemented code, continuation of the full Fusion Studio goal with bug repairs, then a GitHub push containing all current changes. This checkpoint preserves that goal. It publishes source and documentation; it is not a declaration of feature parity, a new binary package, or completion of the original modeling/character/garment/interchange acceptance requirements.

## Changes included in this update

- Modeling and sculpting: functional version-2 static-cage sculpt layers, sparse displacement mixing, layer controls, reversible masks/stamps, neutral character shape editing, geometric snapping, and component transforms that retain unused source vertices. The October 27 progress notes contain detailed limits and evidence.
- Animation and skinning: clip merging, overlap review, bounded key reduction/retiming, source-rate-aware BVH import, Blender frame-origin/FPS translation, weight locks and spatially indexed weighting operations. Save/reopen, cancellation and history contracts received targeted regression coverage.
- Wider workspaces: additional material, lighting, camera, UV, rigging, simulation, environment, CAD and pipeline modules. Some are working kernels or metadata previews rather than complete artist workflows. The feature ledger explicitly remains partial where acceptance is missing.
- Character appearance version 2: separate sclera aperture, iris annulus, recessed pupil and closed cornea cap. New characters use v2. Legacy recipes retain their prior surfaces until an explicit, undoable upgrade; source cages, shape correspondence and legacy asset identities remain intact.
- Texture/render integrity: installed Three.js 0.186.1 exports embedded `EXT_materials_bump` data, but the installed Blender 5.2 importer does not reconstruct it. An independent bounded adapter restores supported embedded PNG/JPEG maps through explicit Fusion material IDs, UV sets/transforms and Non-Color image data, and packs the bytes into the new Blend output. This does not establish universal extension support. See the [official Three.js exporter documentation](https://threejs.org/docs/pages/GLTFExporter.html).
- Character material sidecars now accompany supported delivery jobs as well as rendering. Managed shader nodes/subdivision are reapplied idempotently. The bump adapter retains existing normal and character-microdetail links. Missing UVs and unsupported required data reject with diagnostics rather than guessing material names or reading arbitrary external paths.
- Recovery: attachment rebuilds stage off-scene before replacement; partially successful texture loads are cleaned up. Finite collapsed worker output rejects before mutating the body; failed caches are invalidated before recovery. Public project documents are isolated copies, so editing a returned document cannot mutate live character or material metadata before a failed load.

## Review findings repaired before publication

**Pose reflection.** The old quaternion signs incorrectly negated the scalar component. A simple 0.6-radian rotation produced approximately 68.75 degrees of error. Reflection now operates on authored rotation deltas in the owner's neutral frame, then maps into each destination bone's own rest axes. It supports differently rolled bones and lower-case/DAZ-style side names. Plans are validated before mutation; ambiguous names, invalid unit rotations, unsupported rig scales and active IK reject explicitly. The owner transform is outside the local mirror plane. This mirrors rotations, not translated/scaled pose channels or every vendor control rig.

The former mirroring test contained `|| true` and did not verify a mathematical result. Its replacement compares all three axes to an independent matrix-reflection reference, checks two reflections restore the pose, checks rolled rest frames, and verifies rejection leaves rotations intact. A second tautological aim-constraint assertion was also replaced with a real orientation-change check.

**Neutral expressions.** Presets now reset the supported facial preset family before applying new values. Neutral clears that family; unrelated body controls/morphs remain unchanged. Imported channels use their authored neutral defaults. Named compatible custom creator shape keys are evaluated through the creator, rather than only changing metadata. Unsupported expressions reject, partial bindings are reported, and invalid control ranges reject before edits. UI actions run through the shared dependency transaction, including garment refresh, cancellation, recovery and one history entry per completed action. Pose mirroring also joins the existing garment dependency transaction when links exist.

**LOD remains unfinished.** Review confirmed that the current LOD handler discards generated geometries and persists only counts. Stride sampling also removes triangles rather than producing production-quality simplification, and material groups are not remapped. This checkpoint does not claim to repair that larger subsystem. The next implementation must create usable scene/export assets using topology-aware reduction, preserve UV/material boundaries and rig/morph correspondence through explicit remaps, retain the original source and report achieved reduction/error. Unit tests that only count triangles are insufficient acceptance.

## Verified evidence

- Normal Vite build passes. Main bundle is approximately 2.27 MB before gzip; the existing large-bundle warning remains.
- `tests/character-expression-ui.cjs` passes against the normal build in an isolated profile. It uses the public 19,158-source-vertex / 26,756-body-triangle foundation, real expression buttons, named shape evaluation, Neutral, one history boundary, undo/redo, pose reflection, rig history, save/reopen and actual GLB delivery. Evidence: `test-output/character-expression-1793174857239/results.json`.
- Detailed creator unit checks compare evaluated body positions against the retained neutral reference, retain an unrelated custom shape, verify immutable foundation data, and inject dependent failure/cancellation. Both restore the exact serialized scene and history position.
- The discovered full regression suite passes **1,066/1,066**, with zero failures, cancellations or skipped tests, in approximately 104.1 seconds. Evidence: `test-output/code-review/github-update-final-suite.log`.
- The final assembled build repeated the expression/mirror desktop workflow successfully at `test-output/character-expression-1793175134500/results.json` and passed the broader desktop review regressions at `test-output/review-ui-1793175149923/`. The normal source build remains version 0.1.0; its main bundle is approximately 2.27 MB, with the existing warning still visible.
- Earlier October 28 appearance acceptance: real legacy/v2 upgrade, undo/redo, source preservation and Blend delivery passed at `test-output/creator-appearance-ui-1793173209703/results.json`. The delivery contains 11 character-material records and one restored bump image.
- Shader preservation passed at `test-output/character-materials-1793171656941/results.json`: a 101,888-triangle fixture, original 2K image SHA-256, second UV set/transform, packed image reopen, normal/microdetail chaining, idempotent nodes and unchanged source geometry. The saved bump factor is approximately 0.00035. A render-only factor of 0.04 is a deliberately amplified visibility probe (mean byte difference approximately 0.802), then restored before save. The original-factor 256-pixel comparison was only approximately 0.00948. Neither observation establishes portrait realism.
- Existing detailed character, worker recovery, gesture, sculpt-layer, animation/sculpt and general desktop regression workflows passed on the appearance build. The creator/hair fixture has 507,364 triangles. Its portraits still need substantial visual improvement.
- Character/clothing integration passed for the recorded male fixture: curved six-panel draft, body update, pose, dependent garment replacement, undo/redo, save/reopen and full-body Cycles render. No body face intersections/inside vertices were reported in the checked result. Its approximately 5,071-triangle drape took about 64.9 seconds, so this is asynchronous evidence, not interactive draping or general production-cloth acceptance. Evidence: `test-output/creator-garment-male-results.json`.
- Both user-supplied BMW fixtures passed the preserved-scene comparison at 640×360 / 16 samples on October 28: mean byte difference approximately 0.00004196 CPU and 0.00003617 OptiX. Source files remain unchanged. Generic GLB shader conversion is approximate. Evidence: `test-output/bmw-render-results.json`.
- Installation scan at `2026-10-28T07:45:52Z`: 34,837 baseline / 34,857 current files, zero changed/missing baseline files, 15/15 sampled hashes matching. The same 20 pre-existing additions remain; strict aggregate is still false. The baseline was not rewritten to conceal them. This is a recorded scan, not a claim that every installation byte was hashed today.

## Remaining full-goal gates

Professional close-up/full-body realism across both bases, proportions, all tones/hair categories and lighting remains unproven. Eye gaze, aqueous/tear layers, dedicated teeth/tongue material libraries and higher-quality hair need further work. Age-detail shading is not an age or ancestry geometry generator. Public/private foundation acceptance and complete creator performance matrices remain open.

Usable topology-aware LOD, complete sculpt/paint/node tools, production garment/contact behavior, broad native ZPR/CC/Marvelous/CAD fidelity, verified general lossless roundtrips and release-wide acceptance remain unfinished. Generated final render detail never replaces the editable source cage.

No paid/private asset, proprietary decompiled pseudocode, local Ghidra database, vendor installation, generated job cache or test profile is part of the new publication payload. Existing public workflow media remains linked; this checkpoint does not add new media or rebuild downloadable releases.

## Reproduction

```text
npm run build
npm test
npm run test:expressions
npm run test:appearance
npm run test:gestures
npm run test:sculpt-layers
npm run test:animation-integrity
node tests/creator-garment-ui.cjs
node tests/bmw-render.cjs
```

Desktop/native checks require the documented local runtimes/foundations; private fixtures stay local. These commands cover different stated scopes and must not be treated as universal format or feature acceptance.

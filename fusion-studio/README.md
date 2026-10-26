# Fusion Studio v0.0

The user reset the current build's release label to **v0.0** on October 26, 2026. Its package/application version is **0.0.0** and future packages target `release-v0.0`. This names the current development snapshot, previously 0.19.0; it does not certify the remaining character, garment or performance gates. No new Windows package was created by this version change. Earlier packaged releases remain preserved.

An integrated Windows 3D editor with a Blender-style layout. Modeling, sculpting, character shaping/posing, clothing design/simulation, animation and rendering share one scene and interface. Supported workflows require no application switching. Blender runs fixed background processing jobs; supported DAZ DUF/DSF data is read directly by a new importer.

The standing brief prioritizes the excellence of the integrated character → garment → accessory → render pipeline. The Feature Coverage dialog and `FEATURE-COVERAGE.md` identify Exact / Compatible / Inspired behavior and remaining requirements.

## Launch

The **Character Creator is available in the current v0.0 source** under Character → Create female / Create male. It includes body/face controls, neutral shape-key sculpting, skin tones, fitted hairstyle previews and artistic poses. It is still undergoing portrait, private-library, clothing and performance acceptance; it is not in the preserved 0.18.0 package. [Scope and current limits](docs/progress/2026-10-23-character-creator.md).

The **current v0.0 source** also includes pre-import glTF validation, F3 **Inspect scene glTF / GLB compatibility**, direct validated GLB export reports, and the Export Scene option **Generate missing MikkTSpace tangents for GLB normal maps**. These changes are available by running `npm run build` then `npm start` in this folder. They are not part of the preserved 0.18.0 package. See [evidence and remaining work](docs/progress/2026-10-18-reusable-interchange.md).

To run the earlier packaged **0.18.0** release, double-click **Launch Fusion Studio 0.18.0.lnk** in the parent workspace, or run `release-v0.18.0/win-unpacked/Fusion Studio.exe`. That archived package does not contain the current v0.0 source changes. Keep the complete `win-unpacked` folder together. Earlier applications and launchers are preserved; the 0.1 guide is `README-v0.1.md`.

0.18.0 adds **Draft fitted shirt panels…** in Clothing for supported imported skinned bodies. Review the bind joints and physical design options, then create an independent six-panel working copy. Editable physical panels retain UV/body references through shaping, posing, sewing, boundary edits and remeshing; panel-specific neutral-surface grading preserves the source design. Save/reopen and mixed undo retain exact authored transforms. Cancel/stale/error recovery keeps the last valid scene. Fitted drapes are explicitly offline with a 120-second limit. Detailed Genesis, four-density, packaged combined-project and front/back render gates pass. **Fabric calibration, fine-mesh strain and production layered/animated cloth remain unfinished.** See `docs/progress/2026-10-15-surface-drafting.md` and `docs/releases/0.18.0.json`.

0.17.0 adds **Enable pose-aware placement** to linked imported-body garments in Clothing. Source panels attach to the body surface and follow the current skin pose before draping; cached attachments are checked against source shape, topology and body identity. Rebuild an attachment or return to static placement in the same workspace. Flat patterns remain the strain reference, and the last valid garment/history recover after failure or cancellation. Source grading excludes bone pose; saved caches survive reopening and are omitted from ordinary GLB exchange. This remains an Inspired static-pose preview; production fit and measurement-based drafting were still unfinished at that milestone. See `docs/progress/2026-10-15-pose-placement.md`.

0.16.0 adds **Body Measurements** in Character for imported skinned bodies. Inspect adjustable hips/waist/chest source sections, actual surface girths, width/depth and contour previews. Preview runs in a cancellable worker; open, ambiguous or crossing sections produce reports. Save a reviewed snapshot in one metadata undo step, preserving the current frame and geometry. Snapshots survive project reopening and are omitted from ordinary GLB exchange. Refresh after shaping; current garment grading is unchanged. These are Inspired geometric measurements, not anatomical or medical measurements. See `docs/progress/2026-10-15-body-measurements.md`.

0.15.0 adds a visible **Cancel** control and Escape cancellation during work. Native geometry runs in an isolated helper process; cancellation and timeout wait for actual exit before releasing the operation, preserving the previous garment and undo history. Sewn neighborhoods now share collision adjacency while their editable mesh/UV identities stay separate. A detailed Genesis probe reduces maximum local strain from 104% to 79%; unrelated cloth layers still collide. Garment strain, seam gaps, robust layering/animation and measurement grading remain unfinished. See `docs/progress/2026-10-15-cancellation-and-fit.md`.

0.14.0 improves garment meshes and body contact. Pattern previews report a 20° minimum-angle target; constrained interior sampling and local edge flips preserve curves, holes, pins, internal lines and partial sewing. A detailed 23,430-triangle fixture reaches a 29.1° minimum angle. New live T-shirts use stable version-2 patterns. Imported-body fitting can recover initially embedded placement and checks body crossings through cloth faces; the live panel reports face intersections, inside vertices and initial placement corrections separately from clearance. Open/overlapping bodies, difficult folds, excessive strain and seam gaps remain explicit limitations. **Production garment fit is still unfinished.** See `docs/progress/2026-10-15-garment-quality.md`.

0.13.0 adds **Dependencies** in Character shaping: inspect imported formulas, authored/evaluated values, verified joint frames and actionable errors; pause/resume imported drivers in one undoable edit. Supported DSON rotation drivers now move the imported figure and feed correctives, collision, animation and rendering. The real Genesis fixture retains 20 formulas driving 16 joints; changing its eye focal-point control moves the eyes by 3°. Qualified asset identities prevent similarly named controls from silently cross-driving. Failed playback and IK previews restore the previous pose; IK/driver conflicts are explicit. Project files retain editable rules; exchange warns and samples evaluated motion without duplicating the graph. Reimport an editable DSON source to obtain verified rotation frames for older imports. See `docs/progress/2026-10-15-formula-drivers.md` for evidence and supported limits. Garment production fit remains unfinished.

0.12.0 adds **Skin weights** in Character and **Weight Paint** in the viewport mode selector. Paint Replace/Add/Subtract/Smooth, inspect a vertex with Ctrl+click, assign a precise target, and lock joint weights. The shaded heatmap and brush cursor stay outside the saved/rendered scene. Verified source identities synchronize material/UV seam copies. Weights normalize into four slots; removing an existing influence requires review. One stroke and its linked garment re-drape share undo and failure recovery. Save/reload and GLB retain the edited skin, and procedural body resizing preserves compatible edits. Limits and measured timings are in `docs/progress/2026-10-15-skin-weight-editing.md`.

0.11.0 adds **Joint limits** and a **Pose library** in the Character workspace. Author local XYZ bounds from imported rest axes or a captured neutral pose; FK, IK and sampled animation respect them. Capture rotation-only poses, review matching rig hierarchy/rest axes, save/open pose files, and explicitly approve clamping or IK release before applying. Pose/limit changes and linked garment updates share one undo step. These are original Inspired tools; automatic anatomical limits and retargeting are not implemented. See `docs/progress/2026-10-15-character-controls.md` for measured Genesis gates and remaining work.

0.10.0 uses the new `CODEX_INDEX.json` findings to advance three workflows. In a modifier stack, choose **Edit retained source cage** to make component edits while retaining the stack; rendering/export use its evaluated result. Per-entry counts and lost attribute warnings show what the engine changed. Character **Shaping presets** capture/control groups, review base compatibility, apply/reset, and save/open Fusion preset files. Sewing inspection measures curved/partial seam lengths, signed ease and correspondence direction independently of mesh refinement. See `docs/progress/2026-10-15-index-guided-features.md` for evidence and limits.

0.9.0 connects modeling, imported character deformation and pattern clothing through one revision-aware scene evaluator. It adds component selection/editing, persistent source-based modifier stacks, searchable sparse morph controls, bounded DSON formula evaluation, pose correctives, version-2 pattern documents and detailed triangle-contact cloth. Save/reload, undo and rendering preserve the combined workflow. The real Genesis 9 acceptance scene uses 50,312 character triangles; its 882-vertex garment takes about 9 seconds per 160-step re-drape on this test machine, so this remains a static-pose quality preview rather than interactive high-resolution cloth.

The Rust module includes triangle topology validation and edits, component transforms, attribute remaps, a collision BVH, directional cloth constraints, friction, swept vertex/face and edge/edge contact, triangle self-collision and bounded jobs through napi-rs. Constrained pattern meshing supports curves, holes, internal lines, darts and refinement, but the 0.9.0 detailed fixture reached only a 4.79° minimum triangle angle and is reported for inspection rather than called production-ready. `npm run package` builds the native module first; the private build toolchain is excluded from releases. See `docs/progress/2026-10-14-integrated-workspace.md`.

0.2.1 repairs save/undo loss of sculpted primitive positions, UV edits, and transforms made before a render. New snapshots preserve actual geometry; this can increase file size and history cost. It cannot recover edits omitted from an older saved file. The next-phase audit and proposed decisions are in `docs/AUDIT.md` and `ARCHITECTURE.md`. The user approved a Rust/WASM core and persistent installed-Blender worker. The Rust/WASM kernel remains future work. Version 0.4.0 implements a reusable background Blender process with private stdio IPC; each request still imports a fresh scene. Version 0.3.0 delivers the first Phase 1 foundation slice, not full Phase 1 or feature parity.

The installed Blender at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` supplies background processing. Source libraries are read in place. No CC, Marvelous or DAZ host is started by this release.

Development: `npm ci`, `npm run build`, `npm start`. Browser mode shows the canvas; local file and engine operations use the desktop app.

## Working tools

- **Layout / Modeling:** vertex/edge/face selection, box and connected selection, component transforms, split, dissolve, merge-by-distance, deletion and region extrusion with explicit material/UV source remaps. Blender-backed modifiers can be ordered, disabled, duplicated, removed and applied while evaluating from retained source geometry. Primitives, imports, transforms, snapping and the prior 18 engine operations remain available.
- **Sculpting:** live draw/inflate and smoothing; radius/strength; Shift inverts Draw. Rigs/morphs require a frozen working copy for topology operations.
- **UV Editing / Shading:** UV inspection, planar/Smart UV projection; colors, roughness, metallic and surface presets.
- **Character:** searchable categorized morph controls with limits/reset/keys, sparse source-vertex maps across split materials, bounded arithmetic/linear/TCB DSON formula chains, cycle diagnostics and pose-driven correctives. Parametric characters, FK, hand/foot IK and imported rigs remain supported. Imported evaluated triangles can drive linked cloth collision.
- **Clothing:** stable segment-based pattern documents with line/cubic boundaries, holes, internal lines, partial seams, darts, pins and deterministic legacy migration. Refinement preserves seam chains; XPBD adds directional stretch/shear, bending, friction, swept contact and triangle self/body collision. Re-drape keeps the last valid garment until an atomic replacement is ready and reports strain, seam, penetration and triangle-quality diagnostics.
- **Animation:** object/bone/IK target keys, interpolation, scrub/playback and supported imported clips. Scenes with animated IK export evaluated transform/morph tracks once per frame through the timeline End frame; exchange files omit editable IK controls. Keep the .fusion project.
- **Rendering:** Cycles images, CPU/CUDA/OptiX device selection, denoising and output settings. Imported .blend scenes preserve embedded native shaders/world/lights and source-camera rendering; additional Fusion objects render in that scene.
- **Assets:** about 41,000 local entries were indexed here. Add folder includes other libraries. Native CC/Marvelous formats show adapter pending before processing.

Shortcuts: G/R/S transform; Tab Object/Edit; E extrude; F frame; I keyframe; Space playback; F3 command search; Ctrl+S save; Ctrl+Z undo; Ctrl+D duplicate. Middle/Alt drag orbits; right drag pans; wheel zooms.

## Compatibility and assets

Warnings precede affected operations: rigs, morphs, animation, parametric controls, material regions, UVs, uneven/negative scale, cloth context and native fidelity. Dense/unsupported cases can block. Cancel preserves the scene. Static copies evaluate the pose/morphs and retain the original object.

In Assets, search **Genesis 9.duf** or **Genesis 8 Basic Female.duf**. Review preflight before import; Character exposes its joints and supported referenced shapes. Missing mandatory dependencies/invalid geometry prevent import. Source files remain read-only.

The direct DSON reader reconstructs base topology, material groups, UV seams, sparse morphs and general weights from JSON/gzip DUF/DSF. Tested G8/G9 imports have functioning rigs/morphs. Arithmetic, linear and TCB spline dependencies are evaluated without executing scripts; unsupported formula operations are reported. HD subdivision, exact joint corrections, graft/conforming behavior and full vendor shaders remain omissions. Preset-only files without a resolvable base scene currently fail. See `research/dson-support.md`.

GLB/glTF, FBX, OBJ, BLEND, STL, PLY, USD and Alembic routes exist. Runtime tests cover GLB/FBX/OBJ/BLEND and DSON; the other routes were not separately exercised. Native `.ccAvatar`, `.iAvatar`, `.ccProject`, `.zprj`, `.zpac` remain catalog-only.

## Data and preservation

Development data: `runtime-v2`. Packaged data: `release-v0.18.0/win-unpacked/Fusion Data`. Saves/jobs create new uniquely named directories. New `.fusion` projects use schema 2 with a stable project ID and evaluation manifest; schema-1 projects migrate in memory and save as new versions. History retains up to 200 commands. Object transforms, primitive insertion and character rig edits use deltas; other edits use uncompressed scene snapshots, trimmed around 60 million retained characters with at least the last command retained. Dense mesh edits can shorten undo history. Compressed snapshots and binary persistence remain required work.

The delivered program never patches installation files or source assets. Blender uses factory startup, disabled auto-execution and dedicated config/temp paths. DSON reads sources only. Commercial runtimes/paid assets are not packaged.

A development-only DAZ headless probe started its normal shared CMS service. That route was retired after the side effect was observed. The delivered reader has no DAZ/CMS execution path. Install checks still found all 34,837 recorded files unchanged by path/size/mtime, with 15 selected SHA-256 matches; tested DSON dependency hashes matched. This covers the listed installs/assets, not unrelated OS/database activity.

The unused private DAZ copy at `runtime-v2/native-engines/daz` remains because automatic approval review blocked its optional deletion. It and its disabled helper are excluded from packaging.

## Validation and code

`npm test` covers schema migration, topology edits, revision/stale handling, sparse deformation/formulas, v2 patterns, detailed meshes, rigs and preserved scenes. `npm run test:upgrade` exercises the combined desktop features. `tests/pro-workflow.cjs` imports real Genesis 9, shapes and poses it, edits sewn clothing, evaluates an accessory stack, saves/reopens schema 2 and performs a Cycles render. `node tests/bmw-render.cjs` retains the CPU/GPU Blender fidelity gate. Reports and screenshots are in `test-output`; each UI test uses new test data. Existing user app sessions are not controlled.

`src/` contains the editor/tools/timeline/compatibility UI; `electron/` handles local files/assets; `scripts/blender_worker.py` processes geometry/physics/rendering; `scripts/dson_importer.py` implements the independent DSON subset. Research records evidence, measured behavior and unresolved engine gaps.

The UI follows the arrangement in the [Blender window system](https://docs.blender.org/manual/en/latest/interface/window_system/index.html). DSON reconstruction follows the [public specification](https://docs.daz3d.com/public/dson_spec/start); support notes link detailed primary references.

## Editor foundation in 0.3.0

Move/numeric transforms, six primitive additions, face extrusion, undo/redo and rendering use the operator registry. F3 exposes migrated operators; F9 adjusts the last transform without adding another undo entry. Other features still use their earlier handlers while migration continues. Extrusion uses snapshot fallback; primitive creation and transforms use deltas. A mixed-operation regression covers branching/undo/redo and save boundaries.

The new editor header offers horizontal/vertical Split, editor type, Maximize/Restore and Join. Drag or arrow-key the separator to resize. Workspaces remember their layouts across restart. This first area implementation has exactly one live viewport and additional Info/History editors (up to six areas); switching to 3D swaps the existing viewport. Multiple simultaneous 3D viewports and the other editor types are not implemented yet. Ctrl+Space maximizes/restores the viewport.

`npm test` includes a 200-transform undo/redo test on 1M triangles. Latest evidence in `test-output/delta-history-results.json` measures Node heap growth after forced GC and separately estimates entry sizes; neither is a GPU/whole-application memory measurement. `npm run test:ui` includes actual split/resize/swap/restart, F9, compatibility Cancel and copy/extrusion tests plus a real Render operator. Layout/undo screenshots are in `test-output/foundation-ui.png`.

Original Fusion Studio code is MIT-licensed in `LICENSE`; third-party notices, commercial programs and paid content retain their separate terms. Open-source intent is recorded, but nothing has been published. See `docs/DEPENDENCIES.md` and the machine-readable dependency inventory.

## Engine reuse and modeling in 0.4.0

Properties and F3 share a bounded operation catalog. Settings are remembered for the current session. Geometry processing warns before execution, preserves a working source, and is one snapshot undo step; errors and cancellation roll back the whole transaction. Outputs are baked meshes, not a live modifier stack.

The worker is reused across jobs and stops after 60 seconds idle or when Fusion closes. Cancellation terminates only Fusion's worker; the next job starts a fresh one. Set `FUSION_ENGINE_ONESHOT=1` for the retained one-shot fallback. `npm run test:modeling` checks actual geometry, axis mapping, worker reuse/recovery, dialogs, undo and persistence. See `docs/progress/2026-10-13-modeling-engine.md`.

## Polygon clothing in 0.5.0

Open Clothing → Pattern & Sewing Editor. Draw straight-edged panels or start a T-shirt; set placement, seams, pins and fabric, then Apply Pattern. Simulate selected garment shows compatibility information before generating a separate baked drape. You can reopen patterns from saved projects; editing a baked garment preserves it and creates a fresh pattern object.

Limits: 16 panels, 64 points per panel, 64 edge seams, 60,000 generated triangles. This is an approximate static-pose Blender cloth solve, not full Marvelous parity. Curved edges, internal holes, sewing subsegments, darts, graded sizes, layers and animated cloth remain pending. Collision and seam gaps require inspection; pinning both seam sides apart prevents closure. See `docs/progress/2026-10-13-polygon-clothing.md`.

## Rigging and interchange in 0.6.0

In Character, select an end joint and chain length, then Add IK target. Review the preflight. Move target / Move pole attach the viewport gizmo; numeric positions use character-local meters. Two parents use an analytic limb solver; three to eight use an iterative solver without pole control or joint limits. Unreachable positions are shown as a remaining distance. Disable keeps the current pose for FK editing. Active overlapping drivers and nonuniform/negative rig scales are rejected. Auto-rigging, joint limits, facial systems, full-body constraints and retargeting remain pending.

Target/pole and enabled state are stored with inserted character keyframes. Export samples the timeline at its frame rate (one-million node/frame limit); this is baked animation, not a transferred constraint system. Imported clips hold their end pose until the timeline loops. The tested 24-frame GLB roundtrip reproduces hand positions within 0.00000004 m. Real Genesis 9 hand targeting, skinning, viewport drag, one-step rig undo and project reload are exercised by `tests/ik-ui.cjs`. Interchange import now discards unused vertices in split primitives while retaining weights, UVs and morphs, avoiding a large repeated-buffer save failure.

The BMW CPU/GPU scenes are render fixtures. Version 0.7.0 preserves embedded Blender scene data for native rendering; both CPU/OptiX fixture outputs match their references with mean absolute RGB-byte error below 0.1. The generic GLB exchange route remains approximate. Evidence and limitations: `docs/progress/2026-10-13-preserved-rendering.md`.

## Preserved Blender scenes in 0.7.0

Import .blend through the normal file picker, review the warning, and keep the preserved scene for native shader rendering. The viewport shows an evaluated static proxy with approximate materials. Rendering offers the source or viewport camera and an explicit device. Saved .fusion projects embed the snapshot and validate its checksum. Whole-scene transforms and added Fusion objects are supported; native per-object geometry/material editing, native animation synchronization and multiple-scene composition remain pending. Make converted working copy in Properties to edit proxy materials or geometry; the original is retained with a warning. Compositor file-output nodes are muted to keep render outputs in Fusion's job directory.

`node tests/bmw-render.cjs` now checks both preserved images against the native reference at 640×360, 16 samples. `tests/native-scene-ui.cjs` exercises the actual import warning, OptiX rendering, an added sphere, render after save/reload and explicit detach/cancel/copy. This is fixture-specific acceptance, not full rendering parity.

# Fusion Studio audit — 2026-10-13

Scope: current 0.2 source, installed Blender 5.2 and read-only Genesis 9 data. The supplied next-steps prompt's v0.1 heading is stale. README-v0.1.md is historical and its external-app handoffs do not describe today's product. No commercial host/CMS was launched for this audit. Architecture recommendations are proposals, not completed features.

## Module map (observed)

| Module | Responsibility / boundary |
|---|---|
| src/main.js | Entire renderer shell, side panels, event handlers, menus/F3, compatibility dialogs, autosave and job orchestration; no operator registry |
| src/editor.js | Three.js scene, cameras/lights, selection/transforms, primitives, import/export, whole-scene history, project serialization |
| src/mesh-tools.js | Coplanar face selection, extrusion/deletion, draw/inflate/smooth, pointer handlers; all synchronous in renderer |
| src/character.js | Independent parametric rigged body and FK presets |
| src/garments.js | Three parametric patterns and triangulated garment meshes, pins/UVs, schematic SVG |
| src/timeline.js | Transform/bone key values in root userData, interpolation, mixers and GLB tracks |
| src/compatibility.js | Imperative warning predicates; no stable rule IDs or importer capability registry |
| src/style.css, blender-ui.css | Fixed shell/workspace styling; no split-tree area model |
| electron/main.cjs, preload.cjs | Sandboxed renderer bridge, IPC file dialogs, catalog and job endpoints; main process owns files |
| electron/core.cjs | Known executable metadata, unique output directories, v1 project validation, one-shot Blender spawn/log/cancel/timeout |
| electron/assets.cjs | Bounded read-only directory catalog; format availability and previews; added roots currently not persisted |
| electron/dson.cjs | Isolated Blender Python preflight subprocess, no DAZ host |
| scripts/blender_worker.py | Fixed Blender job dispatch: conversions, applied modifiers, static collider cloth bake, Cycles still/export |
| scripts/dson_importer.py | Bounded JSON/gzip reader, path confinement, geometry/UV/material/sparse morph/rig reconstruction and omissions report |
| electron/daz.cjs, scripts/daz_worker.dsa | Retired experiment; disabled helper and script excluded from packaged workflow; leftover copied runtime untouched |

## Geometry (observed)

The authoritative mesh is Three.js BufferGeometry, usually indexed triangles, sometimes non-indexed imports. Attribute arrays carry positions/normals/UVs, skin weights and morph targets. Material groups refer to ranges of triangle indices. There is no persistent polygon/corner/edge entity model, half-edge connectivity, manifold diagnostic system or stable edit-element ID layer.

`canonicalGeometry()` welds vertices by positions rounded to 1e-6 and retains only the first UV per merged position. `coplanarFaces()` scans the entire mesh for matching normal/plane, not just connected neighbors. Thus disconnected coplanar surfaces can join one selection; seam/attribute preservation is not adequate for a full modeler. Extrude rebuilds position/UV/index arrays and collapses material arrays; delete clears groups. Vertex/edge selection, non-manifold-aware edit operations and multires are absent. These are observed limitations, not evidence the future Rust kernel will automatically solve them.

Sculpt copies positions each dab, scans all vertices, recomputes full normals/bounds, and Smooth builds Set-based adjacency each dab. Raycast selection has no explicit BVH acceleration. The 300k interactive editing gate avoids some stalls; it is not a tested 500k edit-mode performance target. Cloning a mesh is not a topology correspondence map.

## Persistence defects found and repaired

Three failing tests reproduced: (1) immediate numeric transform commits used stale local matrices, (2) sculpt/UV edits on generator primitives serialized the original generator recipe, losing edits after restore, and (3) added groups/morphs on such geometry could disappear. The fix updates matrices and serializes the actual primitive buffers through a read-only buffer view. Geometry IDs and live attribute references are retained. Existing v1 files still load; edits already omitted from old files cannot be reconstructed from those files alone.

`tests/serialization.test.mjs` proves immediate transforms, actual sculpted position/UV arrays, groups/morphs and undo/redo. The repair does not replace the scene schema or add delta undo. Saving correct dense data costs more than saving an incomplete generator recipe; the misleading initial benchmark is retained separately in `test-output/perf-before-serialization-fix.json` and is not used as a performance improvement claim.

## Undo and save (observed)

`commit()` calls JSON.stringify on the entire scene after every change. Up to 25 strings are stored. The 60-million-character trimming condition retains at least two states, so it is not a hard memory ceiling. Restores rebuild Three.js objects, reset mode/selection and timeline frame, and invalidate object references. Camera/current frame settings are outside history snapshots. Embedded images multiply the payload. Save pretty-prints a full JSON document synchronously in Electron main, and IPC also copies it. Renderer recovery uses synchronous localStorage with swallowed quota errors.

On 500k triangles, one corrected snapshot is 49,275,840 characters, median commit 481.5 ms; retained two states total 98,551,680 characters. String storage alone is approximately 98.6–197.1 MB depending on engine representation, excluding transient arrays, parsed objects, GPU storage and overhead. This is a calculated range, not measured resident memory. No 200-step delta history exists yet.

## Reproducible performance baseline

Command: `npm run test:perf`. Raw data: `test-output/perf.json`. Fixtures/harness: tests/audit-performance.cjs, audit-main.cjs, audit-preload.cjs, audit-fixture.html/js. Unique run: `test-output/audit-1791882621922/`.

Hardware: Intel i7-10700K, 8 cores/16 threads, 68,532,719,616 physical RAM bytes (~63.8 GiB). `nvidia-smi` reports RTX 4060, 8188 MiB VRAM, driver 616.92. WebGL explicitly reported the RTX 4060 via ANGLE/D3D11. Windows AdapterRAM is a 32-bit value and was not used for VRAM capacity.

One run with warm filesystem caches. Synthetic indexed UV spheres, 1200x750 drawing buffer, standard editor lights/shadows. CPU medians from three samples; orbit samples 120 frame intervals after 20 warmup frames. Real Editor/render loop in an isolated harness, excluding production side-panel rebuilding and autosave. Load is JSON parse + restore + initial commit of an in-memory project, not cold disk/native import. Save includes document serialization, IPC and new-file write. Brush numbers are direct single dabs, excluding pointer raycast, UI and final history. Boolean uses a low-resolution overlapping sphere cutter, full installed-Blender process/import/compute/export, plus separately measured GLB input serialization; no viewport reimport timing. These are workload-specific baselines, not maximum throughput or interactive editing guarantees.

| Metric | 100k triangles | 1M triangles | Genesis 9 base + referenced base morphs |
|---|---:|---:|---:|
| Project parse/restore/commit | 72.0 ms | 687.8 ms | 87.6 ms |
| Orbit FPS / p95 frame | 100.1 / 10.1 ms | 100.1 / 10.1 ms | 100.1 / 10.1 ms |
| Inflate median dab | 21.0 ms | 125.6 ms* | Blocked on live rig |
| Smooth median dab | 34.0 ms | 339.9 ms* | Blocked on live rig |
| Snapshot commit median | 94.4 ms | 969.0 ms | 54.2 ms |
| New save end-to-end | 187.8 ms | 2044.3 ms | 242.3 ms |
| Pretty JSON bytes | 21,084,983 | 212,689,814 | 24,163,165 |
| Boolean engine job | 2270.8 ms | 9914.7 ms | Blocked on live rig |
| Boolean input serialization | 99.0 ms | 1005.6 ms | Not run |

*1M dabs were deliberately measured directly by the harness; the real UI currently blocks sculpt above 300k triangles. A live Genesis rig requires a static copy before topology/sculpt operations. HD Genesis performance is **not measurable in this importer** because HD subdivision deltas are omitted. Native G9 base conversion took 2909.3 ms plus preflight and viewport import; raw measurements record those separately. It is not an HD benchmark. All six hashed DSON dependencies matched after the run.

At 1M triangles the history retained two states totaling 198,318,892 characters (~198–397 MB string storage only). 200 snapshots would be unsuitable; delta history and binary persistence are prioritized. Viewport frame cadence is display/scheduler-limited here and must not be read as a dense-sculpt FPS claim.

## Test inventory and gaps

| Suite | Demonstrates | Does not demonstrate |
|---|---|---|
| npm test (14 tests) | Outputs/new versions, malformed project rejection, rig/pattern basics, extrusion/sculpt, warning predicates, transform keys, repaired serialization, subprocess allowlist/config arguments | Comprehensive fidelity rules, true memory ceiling, crash recovery, full import fuzzing |
| npm run test:ui | Real desktop controls, pre-operation cancel, proportions/pose/pattern, transforms/keys, save/load, coverage dialog; fresh current fixture | Area splits, user keymaps, all button/keyboard routes, large-scene responsiveness |
| npm run test:integration | Current fixture conversions, modifiers/render, OBJ/FBX/BLEND source-preserving roundtrip, extended mesh/UV/cloth bake | Every supported format, graph/material fidelity, persistent worker, cancellation/crash recovery |
| tests/mesh-desktop.cjs | Actual face click/extrude/sculpt and Boolean (prior 0.2 evidence) | Full vertex/edge modeling, manifold stress corpus |
| tests/dson-integration.cjs / desktop-native.cjs | Prior base G9 rig/morph/UV import, source hashes, native controls/warnings/save/render | HD/ERC/grafts/full vendor shaders, full dressed scene |
| npm run test:perf | New measured dense synthetic/base G9 baseline | Full production UI overhead, 200-step history, cold-start or HD workloads |

The integration command previously used a stale v0.1 `starter.glb` and omitted the v0.2 cloth suite. It now consumes the current UI fixture and runs both integration suites. Run UI first; the fixture dependency is explicit.

Process regression uses intercepted spawn calls and asserts exact allowed executable paths, isolated environment and disabled script execution. It does **not** claim to monitor every OS process or prove vendor binaries never spawn descendants. Actual benchmark imports use the inspected Blender/Python route; no vendor-host launch is present. Original installation manifest and source-hash audits are separate evidence.

## Priority findings still open

1. Route all commands through transactions; prevent New/Open and other mutations while a scene-writing job is active. Existing `busy` handling is incomplete.
2. Replace renderer-wide snapshots; define resource lifetime and migration before heavy feature work.
3. Treat compatibility modal Escape/X as a resolved Cancel; current closure removes UI but can leave a Promise unsettled. Assign stable rule IDs and test every rule.
4. Preserve corner/weight/morph attributes and connected selections in topology operations; do not infer topology from position-only welding.
5. Move sculpt/serialization/heavy imports to workers with progress/cancel and size budgets. DSON preflight currently lacks a timeout/cancel/bounded stdout transport even though its reader has document limits.
6. Expand file validation and symlink/reparse-point confinement testing. `writeNew()` itself uses lexical confinement; Electron owned-file reads and Python worker output checks use additional canonical-path checks.
7. Persist asset roots/preferences/layouts, add migration fixtures and visible recovery errors, and audit full transitive licenses before distribution.

UI labels or catalog entries are not evidence of native CC/MD support. Current warnings do not meet the entire supplied fidelity specification. Full parity remains unfinished.

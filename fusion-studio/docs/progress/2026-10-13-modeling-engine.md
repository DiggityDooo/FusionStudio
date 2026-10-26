# Fusion Studio 0.4.0 — reusable engine and modeling breadth

User steering: prioritize independently implemented workflows inspired by the installed applications, with ArtCraft as an example, and reduce repeated implementation/research. Keep one interface and warnings before mesh loss. This delivery brings forward a bounded modeling slice and the already-approved persistent worker; it does not finish Phase 1/2 or four-product parity.

## Reuse strategy

The [ArtCraft app family](https://getartcraft.com/apps) describes independent creative applications in Rust, several labeled early alpha or in development. [CADCraft](https://getartcraft.com/apps/cadcraft) describes familiar drafting workflows, open drawing formats and parametric constraints. The main [ArtCraft repository](https://github.com/storytold/artcraft) describes AI image/video composition and 3D staging, and supplies its own licenses/notices. These are public product/source descriptions, not an audit of their completeness or proof of four-DCC parity. No ArtCraft code or vendor executable code was copied into this release.

For Fusion, keep the accepted Electron/Three + future Rust/WASM design. Reuse installed Blender operations through a fixed adapter instead of rewriting proven geometry algorithms. A shared `electron/mesh-operations.json` catalog now supplies labels, controls, defaults, enum choices and numeric bounds to both the interface and IPC validation. Each future feature needs a real operation, preflight, undo behavior and acceptance fixture. A catalog entry alone is not implemented parity. Native character and arbitrary sewn clothing workflows remain the largest gaps alongside interactive topology/sculpt/material editors.

## Delivered

- Nine additional operations: Array, Weld, Wireframe, Triangulate, Smooth, Twist, Bend, Taper and Stretch. Eighteen operations total in the configurable engine catalog, including the existing tools.
- Editable subdivision levels, bevel width/segments, reduction ratio, thickness/offset, mirror axis, voxel size, Smart UV angle/margin, array axis/spacing/count and deform parameters. Boolean Difference, Union and Intersection use a visible operand.
- Properties and F3 reach the same registered operators. Settings persist within the running session. Tools return applied geometry; there is no live modifier stack yet. glTF input is already triangulated, so Triangulate may leave such input unchanged.
- Rig/morph blockers and static-copy choice, baked/interchange warning before processing, UV/remesh warnings and subdivision/array output estimates. Cancel before processing leaves the scene unchanged.
- Copy creation, source hiding and result replacement form one snapshot undo transaction. An engine error restores the pre-operation scene and selection without adding history. Heavy geometry still has the existing snapshot memory limits.
- Private stdio protocol to an owned background Blender child: version, monotonic IDs, per-session response prefix, serialized execution, bounded line handling and confined job paths. Python runs on Blender's main thread. No socket, commercial host or arbitrary-code endpoint.
- Reused process with factory scene reset, autoexec disabled and full fresh import per job. This is process reuse, not cached mesh synchronization. Idle shutdown after 60 seconds; app shutdown, cancellation and timeout terminate only this owned child. Next request restarts. Explicit `FUSION_ENGINE_ONESHOT=1` retains the one-shot fallback without automatic replay.

## Evidence

- `npm test`: 21 passing checks, including stale-response rejection and existing geometry/history/source-boundary tests.
- `tests/engine-modeling.cjs`: 33 successful real jobs across the catalog, Boolean modes, positive Fusion X/Y/Z array directions, same-PID reuse, fresh-input reset, invalid properties, recoverable errors, cancel/restart, crash/restart and one-shot fallback. `test-output/engine-modeling-results.json` records each result.
- Same 896-triangle fixture, three repeated GLB roundtrips: warm process 84.0/74.7/71.9 ms; one-shot 1280.2/1325.7/1274.5 ms. These local small-mesh timings include import/export, not UI history or large-scene editing. They establish reduced startup overhead, not a general 17x tool-speed claim.
- `tests/modeling-ui.cjs`: actual settings controls, warning/Escape with no mutation, 4-copy array geometry, source preservation, one-step undo/redo, F3 entry, failed-job rollback, rig warning and saved geometry roundtrip. Screenshot: `test-output/modeling-ui.png`.
- Existing integration suites: GLB/OBJ/FBX/BLEND, Cycles still, subdivision/bevel/reduction, read-only roundtrips, solidify/mirror/remesh/normals/UV and cloth (0.08743665 m maximum displacement). Fresh-scene reset initially omitted a world; fixed and these suites rerun successfully.
- Direct Genesis 9 conversion/morph suite passed after the worker change; source/dependency SHA-256 unchanged. No DAZ/CMS process is used.

Release: `release-v0.4.0/win-unpacked/Fusion Studio.exe`; earlier releases remain available. Packaged modeling, foundation (including Cycles render), and serialization tests passed on that executable. Reports: `test-output/modeling-packaged-results.json`, `test-output/foundation-packaged-results.json`, `test-output/serialization-desktop-results.json`. ASAR inspection confirmed version 0.4.0, MIT license and new adapter/catalog; private runtimes, test outputs and retired DAZ helpers are excluded. `research/preservation-verification.json`: 34,837 installation records checked, zero changed/added/missing, all 15 selected SHA-256 checks match. New launcher: `../Launch Fusion Studio 0.4.0.lnk`.

## Remaining limits

Full Rust/WASM topology, vertex/edge workflows, unrestricted sculpt/UV/material editors, non-destructive modifier stacks, rich scene-diff transfer, skin/face/hair/retarget equivalents and arbitrary garment drawing/sewing are not delivered here. CC/MD native readers remain unresolved. A familiar UI does not remove those implementation requirements. No repository or assets were published, and no original installation was edited.

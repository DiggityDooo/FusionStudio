# Phase 1 foundation slice — Fusion Studio 0.3.0

## Decisions accepted

The user confirmed continuing this application with a Rust/WASM mesh core and a persistent installed-Blender worker, and confirmed open-source intent. ADRs 001/002 now record acceptance; no repeat architecture approval is required. Original Fusion code is MIT-licensed. Dependencies and vendor assets retain separate terms; no code/assets were published and no Blender source was embedded.

## Goal and acceptance

Build the first five operator action families, mixed history with transform deltas, and two real area types with saved split layouts. Preserve existing workflows and compatibility before execution. This is a bounded sub-phase, not full Phase 1 or the complete four-application feature goal.

- [x] Operator registry, validated transform/extrusion properties, availability checks, preflight hook, command log and concurrent-execution rejection.
- [x] Migrate transforms/drag completion, six primitive additions, face extrusion, undo/redo and Render routes.
- [x] Transform and insertion deltas with exact snapshot fallback for other edits; 200 transform undo/redo roundtrip on 1M triangles.
- [x] F3 registry entries and F9 adjustment of the last transform without a second undo entry.
- [x] Viewport and Info/History areas: split, resize, swap, maximize/restore, join and per-workspace persistence across application restart.
- [x] Cancel via Escape/X resolves preflight without executing; confirmed extrusion on a copy creates one undoable operation.
- [x] Unit, original UI, foundation UI, actual mesh interaction and Blender integration regressions.

## Implementation and measured evidence

`src/operators.js` registers and dispatches the migrated actions. `src/history.js` stores transform channel pairs and primitive insertion records, with a pending ledger used to materialize the last snapshot only before a legacy edit. `src/editor.js` connects the existing tools and serializes actual buffers as before. This avoids a second legacy snapshot on each transform. `src/areas.js` owns the versioned split tree; `foundation.css` styles its bars/separators/log editor. Main UI routes existing migrated entry points into the registry and prevents conflicting GUI mutations during asynchronous operator execution.

The registry is a first implementation, not yet the full typed/plugin operator API in ARCHITECTURE.md. Extrusion batches creation of the working copy and geometry change, restores the captured state on failure, and records a single snapshot transaction. Other legacy commands retain their existing behavior. Render is non-mutating and produces a new artifact; undo does not delete rendered files. Heavy geometry snapshots remain uncompressed.

`npm test`: 20 passing tests, including 200 transformations on exactly 1,000,000 triangles. The measured run retained the same geometry object, used about 0.87 MB additional Node heap after forced GC for commands plus undo/redo, and estimated 127,408 bytes for the serialized delta entries. Transform dispatch took about 6 ms total in the isolated unit fixture. This excludes DOM rebuilding, renderer/GPU resources and the existing baseline snapshot; it is not an in-app FPS or total-memory claim. Exact latest numbers are in `test-output/delta-history-results.json`. Repeating the test may vary slightly.

Mixed-history tests cover transform -> material snapshot -> transform, undo/redo, branch truncation, and primitive insertion -> transform -> rename across snapshot boundaries. Existing tests still cover actual sculpt/UV serialization, rigs, patterns, preflight predicates, output confinement and executable/config arguments.

`npm run test:ui` passes the existing UI suite and `foundation-ui.cjs`. The latter uses actual desktop controls for split/resize/swap/maximize/join, closes/reopens the app to compare the saved tree exactly, proves F9 keeps the original undo boundary, cancels compatibility with Escape, and executes a real Cycles render through the migrated Render menu. `node tests/mesh-desktop.cjs` also passes actual face/extrusion/sculpt/Boolean interactions. `npm run test:integration` passes both conversion/render and extended mesh/cloth suites; cloth displacement remains 0.08744 m. Screenshots: `test-output/foundation-ui.png` and the packaged equivalent after release verification.

## Limits and required next work

- Rust/WASM kernel and persistent Blender broker are authorized directions, **not implemented in 0.3.0**. Blender still uses isolated one-shot jobs.
- Full operator migration is incomplete: character, material, many mesh/import/file/timeline actions retain legacy handlers. The shared lock guards user interaction, not a fully revisioned document transaction model for every API.
- Delta undo applies to object transforms and primitive insertion. Extrusion and other geometry edits use whole-scene snapshots with a soft character budget, so heavy edits can shorten history; compression, binary/disk spill and general topology deltas remain required.
- F9 adjusts only the last transform. Full property schemas, every operator's redo-last panel and customizable/conflict-checked keymaps remain required.
- Areas have one live viewport plus Info/History leaves. Choosing 3D swaps the existing viewport. Multiple simultaneous viewports, node/graph/dope/UV editor areas, renamed/duplicated workspace management and comprehensive preferences are pending. Current layouts store in the isolated app's local preferences storage.
- Mesh/sculpt algorithms are still the earlier triangle-buffer implementation. No new CC/MD native format, HD/ERC or vendor-render parity is claimed.

Best next slice: complete command migration and keymap/preferences/history infrastructure, including moving expensive serialization off the UI thread. Then implement the approved worker/kernel prototypes with their own fidelity and cancellation tests. Continue using the full roadmap; no new permission is needed for the accepted architecture.

## Packaged delivery

The 0.3.0 executable is in `release-v0.3.0/win-unpacked/`, with a new parent-folder shortcut. Packaged serialization and the full foundation UI suite pass against that executable, including restart persistence, F9, compatibility cancellation, working-copy extrusion and actual rendering. `foundation-packaged-results.json` and `serialization-desktop-results.json` record the checks. Screenshots were opened for visual inspection. Earlier released folders and shortcuts were preserved.

Installation verification still reports 34,837 recorded files, zero changed/added/missing and 15 matching bounded hashes. Packaging inspection confirms MIT metadata/notices and exclusion of the retired vendor helper/runtime and test outputs. This is not a whole-system activity audit.

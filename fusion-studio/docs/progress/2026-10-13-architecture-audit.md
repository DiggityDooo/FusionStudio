# Architecture audit and persistence repair

Goal: follow the supplied plan's Step 0 before adding features, while retaining the goal of one Blender-inspired program with full eventual feature coverage and compatibility warnings before affected operations.

## Task list / acceptance

- [x] Read historical/current guides and coverage; verify against renderer, Electron, worker and DSON code.
- [x] Map geometry/history/execution boundaries and tests in AUDIT.md.
- [x] Measure 100k/1M triangles, 500k snapshot cost and actual supported G9; explicitly report HD unsupported.
- [x] Write architecture and five decision records; map every remaining coverage area to phases.
- [x] Reproduce and repair persistence defects, with failing-before/passing-after regression tests.
- [x] Run unit, actual desktop and installed-Blender integration suites.
- [x] Inventory dependency license declarations and notice hashes.
- [ ] Obtain the user's kernel/Blender relationship choices before starting the redesign.
- [ ] Phase 1 operator registry, delta undo and saved split areas (not implemented in this slice).

## Built and evidence

New architecture audit, ADRs, phase map, license inventory and reproducible Electron performance harness. Fixed serialization of current matrices and actual primitive geometry. Three tests failed on old code and pass on repaired code: numeric transform snapshot, sculpt/UV roundtrip and undo/redo, group/morph persistence. No installed application or source library was edited.

`npm test`: 14 passing tests. `npm run test:ui`: passes current desktop controls/warnings/keyframes/project roundtrip and writes fresh fixtures/screenshot. `npm run test:integration`: now includes both conversion/render and extended mesh/cloth suites; all pass. The first run failed because the old suite applied Bevel to a newly substituted live rig fixture; corrected to use the same frozen-copy path the UI requires. Final tests include exports GLB/OBJ/FBX/BLEND, three source-preserving reimports, subdivision/bevel/decimate, mirror/solidify/remesh/normals/UV, Cycles still and cloth deformation of 0.08744 m.

`npm run test:perf`: complete; actual base G9 conversion and six dependency hashes unchanged. Post-repair baseline is test-output/perf.json; initial recipe-only snapshots were not valid full-data measurements and are retained separately. The harness excludes side panels/autosave, and direct brush calls at 1M deliberately bypass the product's density gate for diagnostic measurement. G9 HD and topology on the live rig are reported unsupported/blocked, not silently substituted.

100k/1M snapshot medians: 94.4/969 ms. 500k snapshot median: 481.5 ms; only two states retained. 1M save: 2044.3 ms, ~213 MB pretty JSON. Orbit near 100 FPS at 1200x750 is a frame-cadence measurement, not proof of interactive 1M editing. These results justify command deltas/binary storage; no unmeasured Rust speedup is claimed.

## Release and final preservation evidence

Packaged 0.2.1 in `release-v0.2.1/win-unpacked/` with a new parent-folder shortcut `Launch Fusion Studio 0.2.1.lnk`. Prior packages/shortcuts and user app sessions are preserved. `node tests/serialization-desktop.cjs` passed against that exact executable: actual brush deformation, immediate transform, undo/redo, disk save/reload and UV preservation. Report: `test-output/serialization-desktop-results.json`. The packaged screenshot and integration Cycles render were opened and visually inspected; this is not a golden-image fidelity comparison. Package inspection confirmed version 0.2.1 and absence of retired DAZ helper/runtime/test outputs.

Final `scripts/verify_originals.ps1`: 34,837 installation files, zero changed/added/missing, 15 matching bounded SHA-256 checks. Six G9 dependency hashes also matched in the baseline run. These checks cover recorded installs/assets, not all Windows activity. No cleanup of the retired private runtime was attempted.

## Decisions / next step

Section 8.2 of the user's supplied NEXT-STEPS-PROMPT.md explicitly requests confirmation of kernel and Blender relationship. Proposed incremental route: Rust/WASM topology plus a persistent installed-Blender worker with one-shot fallback. TypeScript and Blender-based application alternatives are documented with costs. No toolchain/kernel/persistent worker/source integration started. User also asked to be asked about open-source intent; choice remains open and does not publish anything.

After the decision, implement the five-operator transaction proof, measured transform deltas and two swappable saved area types. Keep all other full-feature requirements on the roadmap. No native CC/MD support, HD/ERC support or full feature parity was added or claimed in this slice.

# Index-guided implementation — Fusion Studio 0.10.0

The user supplied `CursorWork/output-v2/CODEX_INDEX.json` and requested implementation using the decompiled binaries. All four indexed exports were read as private static evidence. Completion markers, manifest hashes, binary identities and selected function hashes were validated before using findings. These are completed bounded queries: DAZ4 64/170 matched functions, CC5 21/21, Marvelous 64/3,288 and Blender 5.2 64/532. Most selected Marvelous bodies and several DAZ spline matches are string initializers, so they do not establish solver or interpolation algorithms.

The implementation translates verified behavior and useful exposed feature intent into new Fusion code. Vendor pseudocode, private assets, addresses and runtime files are excluded from the packaged application. No DAZ, CC or Marvelous host was launched. Existing dumps and QtWebEngine analysis were preserved.

## Implemented behavior

### Editable modifier source and attribute reports

The modifier inspector offers **Edit retained source cage**. Component edits update that source and reevaluate the existing stack as one transaction. A failed dependent Blender job restores the cage and evaluated result without adding history. **Return to evaluated mesh** switches the viewport back; save/reopen preserves either state. Render/export and Apply always use the latest evaluated result even while the source cage is displayed.

The worker reports each entry by its stable ID, with before/after vertex/face counts, UV layers, mesh attributes and material slots. Lost channels produce per-entry warnings. Capability metadata distinguishes connectivity-preserving deforms from topology changes and makes retained-source stack warnings accurate. Static rig copies are still required because generic Blender exchange does not preserve every deformation/controller binding. Materials, shading and sculpt strokes on an active stack require Apply; source editing currently uses Component Editing.

Evidence inspiration: Blender functions for mapping/topology capabilities, data requirements and original/evaluated modifier identity. Independent implementation: `src/modifier-stack.js`, `src/modifier-capabilities.js`, `electron/modifier-capabilities.json`, worker stage diagnostics and component/export integration. No Blender pseudocode was copied.

### Reusable character shaping presets

Character → **Shaping presets** captures authored control values, labels, categories and limits in a versioned Fusion JSON preset. Evaluated formula/corrective outputs remain distinct from saved authored values. Presets can be saved with the project, reviewed/applied, removed with undo, reset by category, exported to a new local file and opened without altering the source file.

Before application, SHA-256 identities check source vertex mapping, oriented triangle topology, rest geometry and supported morph IDs. A different base or topology blocks changes. A different morph set displays exact matching/skipped IDs and requires explicit acceptance of the supported subset. No name-based matching, vendor preset parsing, automatic base conversion or compensation algorithm is claimed. Async preset changes and dependent garment evaluation share one history entry and rollback boundary.

Evidence inspiration: CC's separate persisted morph/control collections, stable content identifiers and preset base-compatibility paths; DAZ's input/cycle rejection. Independent implementation: `src/morph-presets.js`, `src/morph-presets-ui.js` and bounded desktop file IPC.

### Sewing length and orientation inspection

The pattern editor measures both sides of straight/cubic and partial seams in physical units, with signed delta/ease, mismatch ratios, explicit correspondence direction and error bounds. It warns above 10% mismatch. Inspect buttons populate the seam ranges and draw colored direction arrows. Curve control bounds are included in canvas fitting.

Measurements depend on stable authored segments rather than transient triangulation indices. Independent adaptive subdivision uses chord/control-polygon arc-length bounds with a 1 µm default tolerance and bounded work. This adds inspection and diagnostics; M:N sewing, arc-distance correspondence, physical gathering controls and new layered-cloth solver behavior remain future work.

## Acceptance evidence

- **73 core tests pass**, including 20 new tests for modifier capabilities/source snapshots, normalized vertex attributes, presets and seam diagnostics.
- The source-cage desktop fixture retains 2,976 source triangles and exports the 71,424-triangle evaluated subdivision. It passes component editing, undo/redo, dependent-job failure rollback, view switching, save/reload and Apply.
- Preset tests include real Genesis 9 at 50,312 triangles and a 65,536-triangle synthetic mesh with reordered material splits. Base fingerprints remain stable across UV/material duplicates, and malformed/mismatched presets leave the prior shape intact.
- The preset desktop test passes capture, review/cancel/apply, new-file export/read-only import, project roundtrip, blocked base mismatch, undoable removal and reset.
- Curved partial-seam measurements match an analytic reference with reported bounds and stay identical between 8,447 and 137,106 triangle meshes. The detailed pair takes about 14 seconds to triangulate; that is a measurement-invariance test, not an interactive cloth claim.
- Existing detailed character/clothing/accessory save/reopen/Cycles workflow is extended with shaping preset application and evaluated rendering during source-cage display.

Reports and screenshots are under `test-output`, including `modifier-source-results.json`, `morph-presets-ui-results.json`, `pro-workflow-results.json`, `morph-presets-ui.png` and `seam-inspection-editor.png`.

The packaged `release-v0.10.0/win-unpacked/Fusion Studio.exe` passed those desktop feature tests and the extended complete workflow. The general packaged worker/save/BLEND/Cycles/cancel test, 33 modeling-worker jobs, BMW CPU/OptiX fidelity gates and final preservation check passed. All 34,837 installation entries are unchanged by path/size/mtime and all 15 sampled hashes match. The parent shortcut is `Launch Fusion Studio 0.10.0.lnk`. Previous releases are preserved.

## Evidence ledgers and remaining work

`research/codex-index-character-2026-10-15.md`, `research/codex-index-garment-2026-10-15.md` and `research/codex-index-modeling-2026-10-15.md` record exact binary hashes, versions, addresses, record filenames and unknowns. Future targeted analysis can follow the unresolved sewing-length action and direct deformation callees; broad repeated exports are unnecessary.

Full four-program feature parity remains ongoing. The preceding garment quality limits, vendor HD/joint/shader differences, native CC/MD format gaps, sculpt/paint/node tools, richer animation and dense interactive simulation remain in the feature matrix.

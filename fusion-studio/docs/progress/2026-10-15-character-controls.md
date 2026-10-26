# Character limits and pose reuse — 0.11.0

Fusion's Character workspace now owns two more parts of the shared body → garment → render workflow. No vendor host UI or new binary analysis is involved.

## Implemented behavior

- **Inspired — authored joint limits.** Per-axis local XYZ boxes use imported rest quaternions or an explicitly captured neutral reference. Bounds constrain FK, two-bone IK, longer CCD chains and each sampled animation export frame. Infeasible IK retains a visible remaining distance. Limit metadata validates hierarchy, duplicate paths, finite unit references and bounded values before replacing the open scene. Up to 1,024 limit records are supported. X/Z bounds are within ±180°, Y within ±89.9°; this is an Euler-box model, not an anatomical swing/twist solver.
- **Inspired — reusable pose library.** Capture only joint rotations; named joint hierarchy and imported rest-axis SHA-256 fingerprints guard reuse. Non-bone material containers do not change joint identity. No automatic retargeting or label-based guessing occurs. The review shows rotations that exceed current limits and requires explicit clamp acceptance. Enabled IK must be explicitly disabled before applying saved rotations; target definitions remain available. Shaping controls, skin weights, object transforms and keys are retained; correctives are reevaluated.
- **One document and undo.** A limit/pose change re-drapes linked garments before committing. Failure or cancellation restores the prior scene without a partial history entry. Timeline playback pauses before dependent edits. Undo retains the selected character through snapshot restores. Existing schema-2 projects accept optional version-1 limit/pose metadata; malformed incoming pose libraries are rejected before replacing the open scene, and saving creates a new project version. Procedural body rebuilds retain authored limits and saved poses.
- **Owned file exchange.** Up to 32 saved poses per character, 2,048 joints per pose, 2 MiB plain JSON files. Exports create new files inside Fusion data; imports read the selected file. Pose libraries and editable joint limits are stripped from GLB extras while evaluated motion remains. Export preflight explains that editable constraints require the Fusion project.

## Numeric and desktop gates

`tests/joint-limits.test.mjs` covers reference-relative constraints, feasible/infeasible two-joint targets, bounded longer chains, rig history, per-frame export/state restoration, duplicate/stale/malformed metadata and the owned Genesis fixture. An 80° Genesis forearm request clamps to its authored 10° X bound with quaternion error below 1e-6 rad; the measured run was 0 rad. All 50,312 evaluated collision triangles remain finite and the source bytes remain unchanged.

`tests/pose-library.test.mjs` covers bounded data, stable hierarchy/rest identity, explicit IK/limit review, failed formulas, cancellation, concurrent rig mutation, linked garment undo and real skin/corrective evaluation. The 138-joint Genesis saved pose reproduces the detailed skinned positions within 1e-6 m; the measured maximum error was 1.11e-7 m. Capture/apply plus collision extraction measured about 82 ms on this PC in the isolated test. Shaping values and all skin-weight buffers remain unchanged. Performance measurements are fixture-specific rather than a dense-scene interactive guarantee.

The desktop suites `tests/joint-limits-ui.cjs` and `tests/pose-library-ui.cjs` exercise the actual controls, undo/redo, garment failure recovery, explicit review, new-file export/read-only import, project roundtrip and export warnings. Genesis constrained IK retains a 0.2 m residual when its chain is intentionally locked; the interface reports that residual. Pose files with another skeleton hash are blocked.

`node tests/character-controls-performance.mjs` records increasing evaluated geometry on an i7-10700K using repeated Genesis material primitives and one shared skeleton. The local samples at 50,312 / 100,624 / 150,936 triangles measured pose apply at 6.12 / 4.33 / 5.15 ms and collision extraction at 36.76 / 44.42 / 49.43 ms. The default collision evaluation ceiling is 200,000 triangles. These copied coincident surfaces measure evaluation cost, not layered-cloth quality; timings are individual samples with warm-up effects. Report: `test-output/character-controls-performance.json`.

## Release verification

- 89 JavaScript tests and 6 Rust tests pass. Existing IK desktop/animation roundtrip also passes.
- The packaged 0.11.0 limit and pose-library desktop suites pass on real Genesis. The packaged worker/save/BLEND/Cycles/failure/concurrency/cancel smoke gate passes.
- The complete packaged Genesis spine passes on the ASAR hash below: shaping preset, 45° requested forearm rotation bounded to 12°, 138-joint pose reuse, linked panel editing/re-drape, retained-source accessory editing, schema-2 reopen and 640×360 / 16-sample CPU Cycles render. The final drape takes 9.54 seconds for 882 vertices / 1,536 triangles, mean seam gap 1.15 mm, three remaining triangle-clearance violations and 199% maximum local strain. It remains explicitly unconverged. Report: `test-output/pro-workflow-results.json` (includes the package hash).
- Visual inspection of that render confirms the functional pipeline, but **fails production garment quality**: visible body breakthrough at the chest/side and an uneven neckline remain. Render completion is not evidence of an acceptable final fit. These defects must be resolved in the garment quality/contact lane.
- Packaged shaping presets, retained-source modifier editing (71,424 evaluated triangles) and pattern-v2 regressions pass. Changes to pose/limit transactions use the same cancellation/stale-scene guard as morph updates.
- Both BMW CPU/OptiX preserved renders still pass mean absolute RGB-byte error <0.1 at 640×360 / 16 samples; sources retain their hashes and modification times.
- All 34,837 installation records remain unchanged; 15 sampled SHA-256 checks pass. The original Genesis DUF hash also matches its recorded value.
- The package contains 4,724 entries and no matched private research, CursorWork dumps or `.blend`/`.duf`/`.dsf` assets. Its ASAR SHA-256 is `e409f87e58310c4d0ec827e8be34024854175236e5d6e2683fe0310ae4da0e2e` (`test-output/release-0.11-package.json`). Earlier release folders remain available.

## Remaining work

The unified-excellence goal remains open. Skin-weight editing, broader safe formula binding, automatic anatomical constraints, full-body IK, facial controls and retargeting remain unfinished. Static-pose garments still report clearance/high-strain issues and take seconds to re-drape; layered/animated cloth and quality-constrained meshing remain required work. No vendor solver, proprietary pseudocode, native CC/MD project reader or paid asset is part of this release.

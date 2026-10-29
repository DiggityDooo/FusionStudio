# October 28 — Faster image snapshots and atomic scene/history recovery

This local continuation addresses the measured character-edit delay while retaining the complete Fusion Studio goal and the earlier LOD/refit repairs. Public projects remain self-contained. App version 0.1.0, project schema 2, asset foundations, vendor installations and archived releases are unchanged. Evidence uses October 29 UTC timestamps, still October 28 locally.

## Problems found and changes

Profiling actual creator edits found that preparing a transaction repeatedly cloned unchanged image arrays: serialization took approximately 136–152 ms, followed by another 84–94 ms document clone. This happened before the worker began. The same instrumented profile now prepares the serialized internal checkpoint in approximately 27–33 ms. Those stage measurements overlap other events and must not be summed as independent costs.

- Scene serialization caches owned immutable image snapshots. Internal history capture can share those snapshots and reuse their interned content. Public serialization keeps detached, mutable image arrays; editing a returned document cannot alter the cache or live texture.
- Cache validity includes source version, data-object identity and source UUID. Pixel changes invalidate cached content; replacing an image identity cannot accidentally retain the old UUID. Unknown mutable image documents are not cached by object identity.
- Rollback checkpoints serialize the actual current scene, including uncommitted geometry/pixels. They do not substitute the last committed history baseline. Images are pinned while a transaction is active so pruning cannot remove data needed for rollback or for the previous undo table.
- The checkpoint also retains the prior command table, baseline, cursor and mixed delta caches. Recovery restores the scene and journal together, preserving existing command identities and nested metadata-cache state. Checkpoints belong to their originating journal.
- A separate regression reproduced a late-failure defect: if a commit added history and then failed, the scene could recover while the journal stayed changed. A forced-pruning case retained only one of twelve earlier entries. Recovery now restores all retained entries and their pixel versions; every previously available undo is exercised afterward.
- Replayed insertions parse an isolated command document. Later edits to live user metadata no longer alias back into the insertion record and hide an otherwise undoable edit.
- Shared deformation transactions and LOD generation use the same checkpoint. Cancellation, worker errors, malformed/stale replies and commit failures retain their existing scene/project checks. A newly opened project is never overwritten by an older operation's rollback. Resource leases are released on success and failure.

These changes optimize an internal representation. Saved/exported project images are still embedded, and history-only references remain invalid as standalone public project files. No image compression, pixel reduction, mesh reduction or controller removal is used to obtain this improvement.

## Verification

- Final build and **1,111/1,111** discovered tests pass, with zero failures, skips or cancellations, in **98.35 seconds**. Log: `test-output/code-review/history-image-final-suite.log`. The existing large-bundle warning remains (main JavaScript approximately 2.309 MB, 641 KB gzip).
- Ten detailed-mesh checkpoint regressions cover immutable/internal versus mutable/public images, version/identity invalidation, mutable caller documents, nested leases, pruning, misleading metadata, missing payloads, uncommitted-state rollback, one-action history, undo/redo, project replacement, post-commit pruning, command ownership and insertion replay. The geometry fixture has 32,768 triangles; the insertion fixture is a separate detailed accessory.
- The post-commit regression was observed failing before the repair (`1` retained entry versus `12` expected). After repair it restores command count/cursor/identity and replays every retained pixel-version undo. Before/after logs: `test-output/code-review/history-postcommit-before.log` and `history-checkpoint-unit.log`.
- Real Electron worker/gesture recovery passes at `test-output/creator-recovery-1793255539883`. It includes cancellation, stale/malformed/collapsed replies, a failure injected after the real commit, exact scene-state/history comparisons, retry and isolated shape-edit cancellation. A preserved report is `test-output/code-review/history-image-recovery-results.json`.
- Public character workflow passes at `test-output/character-lods-1793255874896/results.json`: custom shape, translated/scaled pose, worker LODs, one history action, undo/redo, save/reopen, GLB and Cycles delivery. The body reduces 26,756 to 6,690 triangles with zero sampled corresponding posed-vertex error. Source editing and rebuilding retain old artist-edited copies; eleven character material records and one bump map reach Cycles.
- Private fixtures pass at `test-output/character-lods-private-1793256075615/results.json`. Genesis 8 female/male retain sixteen skinned parts, source-pose edits, earlier copies, project reload and new GLB deliveries. Source DUF hashes/timestamps and conversion GLB hashes remain unchanged. This demonstrates the supported Fusion evaluation, not complete native DAZ controller parity.

All generated evidence and private fixture outputs remain in ignored local `test-output/`. Earlier BMW and whole-installation reports retain their original dates/scopes; those broad comparisons were not rerun here. No new packages or external asset libraries were installed.

## Measured interaction result

The same desktop benchmark measured a 1036 × 729 viewport. Baseline: `test-output/code-review/creator-interactive-before-image-checkpoints.json`. Final report, measured `2026-10-29T06:41:15Z`: `test-output/code-review/history-image-final-interactive.json`. The comparison is preserved in `history-image-performance-comparison.json`.

| Preview | Scene triangles | Prior median completed edit | Current median | Reduction | Warm worker-to-visible samples | Average orbit |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Bald | 69,212 | 526.6 ms | 327.6 ms | 37.8% | 35.7 / 41.1 / 35.6 ms | 54.97 fps |
| Short hair | 437,212 | 616.0 ms | 361.6 ms | 41.3% | 32.6 / 32.7 / 32.4 ms | 54.55 fps |

Each median describes three measured completed edits, not a general performance guarantee. Current completed-edit ranges are 326.2–331.3 ms bald and 358.1–367.3 ms short hair. Completed measurements include the real worker, body/rig/appearance, history and a subsequent animation frame. Warm preview samples exclude the 100 ms input debounce and gesture-boundary snapshots. The current warm samples are below 100 ms, but **completed edits still miss that target**.

Instrumented profile evidence is separate: `test-output/creator-commit-profile-1793253600886/profile.json` before, and `test-output/creator-commit-profile-1793254327659/profile.json` after the image-copy change. Remaining worker/dispatch, attachment, geometry serialization and history costs still require work. Total scene triangles with hair do not establish the required 50k/100k/200k body-resolution/control matrix.

Professional portrait/full-body realism, general native fidelity, production garment/contact behavior and the rest of the original roadmap remain unfinished. Feature-label totals stay 398 done / 462 partial; these tests do not certify all those labels or a complete release. This follow-up remains local and uncommitted.

Reproduce with `npm run build`, `npm test`, `node --test tests/history-image-checkpoints.test.mjs`, `node tests/character-creator-recovery.cjs`, `npm run test:character-lods`, `npm run test:character-lods-private`, and `node tests/creator-interactive-performance.cjs`.

# October 29 source update: character workers and gesture recovery

This update collects the pending LOD, creator-rig and image-history improvements with the worker and gesture repairs below. Source remains version 0.1.0 and project schema 2. It is a development source update; archived downloadable releases remain unchanged. The full Fusion roadmap remains incomplete.

## Reproduced problems and changes

The previous persistent character worker replaced its message handlers for every request. Two overlapping character evaluations could consume one another's replies and leave a request waiting for its timeout. A deterministic transport reproduction used actual deformation output from a 32,768-triangle mesh. One request timed out while its peer completed.

`src/creator-worker-client.js` now routes replies through one persistent dispatcher and a request-ID map. Each request retains its own context snapshot, timeout, cancellation listener and result validation. Context comparison is independent of JSON object-key ordering. A malformed matching result rejects its request; a broken worker or unidentifiable reply rejects affected pending requests and allows a fresh worker on retry. Late replies for cancelled requests are ignored.

The queue permits at most 32 pending requests; context is bounded to 16,384 characters and 32 levels, and position input to 200,000 vertices. Cancelling one request preserves peers. Cancelling the last pending request terminates the worker. Individual cancellation does not preempt synchronous computation when other requests still require that worker.

A real Electron reproduction also found that cancelling a slider left a delayed appearance callback running after the scene was restored. The old build retained one callback, which changed a discarded material. `src/creator-gesture.js` now owns preview cancellation and delayed appearance work, coalesces pending recipes, avoids evaluating an unchanged final value twice, and propagates scheduled appearance failures into the enclosing dependency transaction. Cleanup clears the timer, aborts owned work and prevents late results from applying. Appearance settling is synchronous; asynchronous garment refresh remains in the enclosing transaction.

## Verification of the combined source

- Production Vite build passes. The emitted character worker is a separate bundle. The existing main-bundle warning remains: approximately 2.313 MB, 642 KB gzip.
- All **1,126/1,126** discovered unit tests pass in **90.84 seconds**, with zero failures, skips or cancellations. This includes fifteen worker-routing and gesture-lifecycle regressions using deterministic clocks and actual detailed-mesh deformation calculations.
- The built Electron gesture check passes. Cancelling after a preview leaves zero pending settle callbacks and zero late material updates, restores the selected character and preserves the single pre-existing history entry.
- The built Electron creator-recovery workflow passes, covering worker failure, cancellation, stale/malformed/collapsed results, failure after the real history commit, retry and isolated shape-edit cancellation.

Local evidence is intentionally ignored by Git:

| Check | Local evidence under `fusion-studio/` |
| --- | --- |
| Full suite | `test-output/code-review/github-oct29-suite.log` |
| Build | `test-output/code-review/github-oct29-build.log` |
| Gesture cancellation | `test-output/creator-gesture-lifecycle-1793266559944/results.json` |
| Broader creator recovery | `test-output/creator-recovery-1793266573990/` |
| Earlier overlapping-worker reproduction | `test-output/code-review/creator-worker-concurrency-before.json` |
| Earlier delayed-callback reproduction | `test-output/creator-gesture-lifecycle-1793257424736/cancel-probe.json` |

Reproduce with `npm run build`, `npm test`, `node tests/creator-gesture-ui.cjs` and `node tests/character-creator-recovery.cjs`.

## Included earlier work and limits

- [LOD source editing and bounded candidate queues](2026-10-28-lod-source-workflow-and-queue.md): rebuild from the retained source while keeping earlier artist-edited copies; the previously failing 196,608-triangle reduction completes.
- [Pose-preserving joint refitting](2026-10-28-creator-rig-refit.md): body edits preserve authored translations, scales and rotations; legacy projects retain saved bind data.
- [Image snapshots and atomic history recovery](2026-10-28-image-history-checkpoints.md): preserve independent public image payloads, retain undo resources through failures, and reduce measured character-commit latency by approximately 38–41% in the recorded samples.

Those earlier detailed public/private workflows, rendering comparisons and installation-preservation reports retain their recorded dates and scopes. They were not all rerun for this publication. Completed edits still exceed the 100 ms target. Professional portrait/full-body realism, general native-format fidelity, production garment behavior and the complete performance matrix remain unfinished. Feature labels remain 398 done / 462 partial; no new completion claim follows from this source update.

The Git update includes reviewed source, tests and documentation. Paid/private assets, generated renders/caches, decompiler output, vendor installations and archived release directories are excluded. No new installer or release package is produced.

# Native cancellation and sewn collision continuity — 0.15.0

## Verified cancellation work

The native geometry call now runs in a disposable helper process: Electron `utilityProcess` in the desktop app and a hidden Node child in command-line tests. Cancel, timeout, native error and successful completion all wait for the process exit event before releasing the operation. A new request cannot overlap a stopping helper. Per-request IDs reject stale replies; native library/entrypoint selection stays fixed outside renderer input. The helper is unpacked alongside the owned native core for packaged loading. The underlying Rust core and persistent installed-Blender bridge remain the approved architecture.

This uses the documented [Electron utility-process lifecycle](https://www.electronjs.org/docs/latest/api/utility-process). The previous synchronous native call could outlive `Worker.terminate()`; measured request rejection was at 1.04 seconds while the thread finished at 14.40 seconds. In a matching detailed fixture, the Node helper now exits about 6.7 ms after cancellation and Electron about 2.9 ms. In the final package, Cancel completes process exit, restores the saved 50,312-triangle character/garment scene and history, and releases the UI in 145 ms; Escape takes 111 ms. These are individual local measurements, not universal latency guarantees.

The footer now exposes Cancel during operations, with a disabled Stopping state while it waits. Escape cancels current work when no dialog is open; with a dialog open it invokes that dialog's existing close action. Existing mutation locking remains active; the Cancel control is explicitly exempted from the click guard. The last valid garment stays visible. Tests verify real process existence/exit, timeout, crash, early cancellation, malformed work, stale replies, post-cancel native recovery and unchanged garment/history.

Garment transactions now retain the previous frame during rollback (the desktop gate uses frame 9), check late aborts before committing, and refuse to restore an old snapshot over a newly opened project. A changed project stays authoritative after stale work fails. These guards also protect component edits and garment/body transactions that share the helper.

The legacy capsule/BVH golden test now reads a fixed version-1 pattern fixture instead of the newly changed version-2 default preset. Its original one-micrometer SHA gate passes without changing the expected mesh hash. This preserves the intended historical regression while newer detailed v2 meshing has separate acceptance gates.

## Sewn collision adjacency

Version-2 cloth now treats sewn vertex equivalents and their local neighbors as connected for self-collision exclusion. The editable mesh stays split so UVs, material groups, pattern segments and seam parameters retain their identities. Transitive sewing junctions are included, with a two-million-pair collision-adjacency budget. Unrelated roots remain collidable. Legacy version-1 requests retain the old collision path and the reviewed golden output.

On the same 50,312-triangle Genesis body and 2,422-triangle garment, maximum local absolute strain falls from 104.31% to 78.83%, mean seam gap from 6.950 to 6.703 mm, with zero body/cloth face crossings and zero inside vertices. One clearance violation remains. The result still fails the 50% strain / 5 mm gap / zero-clearance gates. These are improvements to original Fusion behavior, not MD solver parity.

A 10,000-triangle two-layer gate with a shared sewn boundary retains contact between unrelated interiors: the minimum sampled interior separation is 12.47 mm after three steps, while the sewn boundary gap is 2.78 mm. This proves that the local mask does not globally disable layer contact; it does not certify converged physical thickness, long simulations or arbitrary layered garments. Mathematical context for contact and strain issues is the primary [cloth contact paper](https://www.cs.ubc.ca/~rbridson/docs/cloth2002.pdf). The implementation is original code. Detailed experiment notes, without private geometry, are in `research/garment-fit-2026-10-15.md`.

## Verification and release

121 JavaScript tests and 9 Rust tests pass. The standard JavaScript command now includes the fixed legacy hybrid golden gate and real native process recovery tests. Packaged Cancel/Escape tests verify actual helper exit, unchanged scene/garment/history/frame, and recovery on a real 2,478-triangle mesh. Package scanning verifies the unpacked helper entrypoint and native core.

The full packaged character → garment → accessory → save/reopen → render workflow passes on the detailed Genesis fixture. It retains 20 drivers, edited skin weights, authored limits/pose reuse, source-cage accessory edits and a shared scene/project. The final edited garment has 2,478 triangles, zero measured body crossings, inside vertices and clearance violations, but 102.9% maximum local strain and 6.89 mm mean seam gap. Its maximum is slightly lower than 0.14's edited case; its gap is worse than that case's 6.18 mm. Both remain outside fit acceptance. The solver took 15.30 seconds. Visual review shows the surface remains free of the earlier chest breakthrough in this view; sleeve/neckline shaping and strain remain unfinished. A fresh packaged session verifies the visible failed-fit state, strain colors/undo and unchanged saved fixture bytes.

Packaged driver inspection/exchange, detailed pattern preview/apply/undo/save/cancel and worker/save/BLEND/Cycles/concurrency/cancel regressions pass. BMW CPU/OptiX comparisons remain below the <0.1 mean absolute RGB-byte gate (0.0000275 / 0.0000347); original scene hashes/modification times remain unchanged. Preservation passes all 34,837 recorded installation entries and 15 sampled hashes. The original Genesis DUF is rehashed and matches; packaged native/helper bytes match their source files. Previous releases remain intact.

Release: `release-v0.15.0/win-unpacked/Fusion Studio.exe`, parent launcher `Launch Fusion Studio 0.15.0.lnk`. ASAR SHA-256 `7b0f54bf339ba7d6d8e9720f1c0e011e0f34c380c93d7dbae7bf79b18ab04201`; all 4,724 inventoried paths pass private-research/vendor-host/paid-scene exclusions. The final integration report matches that package hash. No publication or push occurred.

## Required work remaining

The unified-excellence goal remains active. Garment fit convergence, pose-aware placement, measurement-based grading, calibrated fabric and robust layered/animated cloth remain unfinished. Detailed live-fit mesh preparation is still synchronous; a geometry request's timeout starts after that preparation reaches the backend. Higher-density full drapes can exceed the existing 30-second request budget; this release improves cancellation rather than declaring those cases interactive. Deeper modeling/sculpt/UV tools, render controls/sequences, broader character production tools and interchange remain open.

# Source-aware skin authoring — 0.12.0

## User-visible behavior and fidelity

**Inspired:** Fusion owns weight painting, numeric assignment, locks, normalization and review. Character → Skin weights and the viewport Weight Paint mode operate on the same rig that drives garments and rendering. Replace, Add, Subtract and Smooth use a falloff brush; repeated pointer events do not repeatedly accumulate strength on the same vertex within one stroke. Shift subtracts. Ctrl+click inspects the nearest visible vertex and all its influences. A shaded blue-to-red weight view and surface brush cursor are separate preview objects, excluded from project snapshots, GLB and rendering.

The default brush follows connected mesh-edge distances on the posed surface. It cannot jump between disconnected nearby sheets; ordinary picking respects visible scene occluders. Through-paint is an explicit option using a world-space sphere and the selected skin. This is a bounded graph-distance brush rather than exact continuous geodesics.

Weights retain locked values and normalize the unlocked budget. Four influence slots match the supported viewport/interchange representation. Adding an influence that would remove another opens a review listing affected source vertices and removed weights. Cancel keeps existing buffers and history. Locks persist by verified hierarchy path/name, survive project reload and compatible procedural body rebuilding, and remain authoring metadata in the Fusion project. Imported anatomical constraints, dual-quaternion/vendor skinning, auto-weighting, mirrored painting, transfer and more than four viewport influences remain outside this release.

**Compatible:** general linear skin weights and skeletons feed evaluated triangles and GLB export. DSON `_fusion_source_vertex` identities inside a verified geometry scope synchronize material/UV copies. Position, binding and existing-weight disagreement blocks a potentially wrong remap. Without a shared DSON geometry scope, identities remain local to each mesh; cross-object welding is never guessed. Topology, UVs, material groups, morph arrays and source assets are retained. Compatible procedural rebuilds transfer weights by unchanged vertex/index layout and checked bone names; unprovable mappings fail before replacing the old body.

## Transactions and limits

Painting stages data and color preview until pointer release. Escape/pointer cancellation discards the draft. The common operator lock protects the gesture. Commit hashes current geometry, source IDs, weights, skeleton/bind data, pose and morph state, rejects stale patches, prepares copy-on-write geometry, then updates linked garments in the same recoverable transaction. Malformed weight/lock metadata, external skeletons, preserved native scenes and active modifier stacks are rejected. Working copies preserve source data; paid content is never packaged.

The current authoring bounds are 300,000 viewport vertices, 2,048 distinct joints and 1,024 skinned parts. Up to four finite nonnegative normalized influences are written per vertex. Float32 roundoff is expected; numerical roundtrip gates allow 1e-6. A single remaining unlocked influence retains the available budget rather than leaving an unweighted vertex. Large snapshots and garment re-drapes remain slower than an interactive stroke; no frame-rate or production cloth claim follows from successful editing.

## Evidence

- `tests/skin-weights.test.mjs`: normalization, locked mass, reviewed pruning, material-copy synchronization, untouched UVs/source buffers, all brush modes, disconnected sheets, malformed/stale/cancel recovery, dependent garment undo/rollback, incoming metadata validation and procedural rebuilds. A real owned Genesis fixture has 25,182 original / 27,087 split vertices, 138 joints and 50,312 collision triangles; a seam edit updates three viewport copies consistently.
- `tests/skin-weights-ui.cjs`: actual mouse painting, shaded weight view, vertex inspection, occlusion/explicit through-paint, pruning cancel/apply, joint locks, undo/redo, Escape cancellation, linked garment failure, save/reload, preview exclusion and numerical GLB weight roundtripping. Source fixture bytes are checked unchanged.
- `tests/pro-workflow.cjs`: edits the weighted `l_forearmtwist1` channel, then exercises bounded posing, pose reuse, garment authoring/re-drape, accessory source-cage editing, save/reopen and Cycles. Genesis distributes forearm weights across twist bones; the parent `l_forearm` is used for posing rather than assumed to have blended weights.
- `tests/skin-weights-performance.mjs`: repeated detailed figures at 50,312 / 100,624 / 150,936 triangles. On the i7-10700K, model preparation measured 245 / 438 / 628 ms, one-vertex commit 240 / 386 / 563 ms, and a 523-vertex brush-region traversal 5.3 / 4.1 / 2.5 ms. These are individual local samples; traversal timings omit picking, heatmap rendering, project history and garment evaluation. Reports remain in private `test-output`.

## Release verification

- 97 JavaScript tests and 6 Rust tests pass. The final JavaScript run includes stale armature-parent world-transform detection, so local bone channels alone cannot authorize an old brush patch.
- Packaged weight UI tests pass, including actual strokes, occlusion, numerical GLB weight comparison, and failure recovery. Packaged worker/save/BLEND/Cycles/concurrency/cancel, pose library, joint-limit and pattern-v2 regressions also pass.
- The full packaged spine edits Genesis `l_forearmtwist1` from 0.56997031 to 0.61997032; the same value survives project reopen. Shaping, bounded parent posing, pose reuse, sewn garment updates, accessory source-cage editing and a CPU Cycles image remain in one document. Reports include the tested package hash. Cloth quality remains unconverged, with about 1.15 mm mean seam gap, three clearance violations and 199% maximum local strain. Visual review still shows body breakthrough and an uneven neckline; the functional render gate is distinct from garment fit acceptance.
- Both BMW CPU/OptiX preserved render comparisons pass (<0.1 mean absolute RGB-byte error). Measured errors are about 0.000035 / 0.000038; original scene hashes and modification times remain unchanged.
- Preservation verification passes for all 34,837 recorded installation paths/size/timestamps and 15 sampled SHA-256 hashes. The original Genesis DUF hash also matches. This is bounded integrity coverage, not a whole-system hash audit.
- The 0.12.0 ASAR SHA-256 is `71f345da48e59cb21126a6459fd2f9ae865af5413186f8d251c619997aa544b7`. Its 4,724 entries contain no matched private research, CursorWork dumps or `.blend`/`.duf`/`.dsf` assets. Earlier releases and launchers remain preserved. Nothing is published or pushed.

## Remaining unified-excellence work

Safer formula binding/coverage remains the next character priority. Broader rig/weight production tools remain incomplete. Garment quality still fails production fit: the acceptance scene retains visible body breakthrough, clearance violations and high local strain. Quality-constrained meshing, layered contact, measurement-based grading and animated collision remain required work, followed by deeper modeling, render controls and interchange. The standing goal remains active.

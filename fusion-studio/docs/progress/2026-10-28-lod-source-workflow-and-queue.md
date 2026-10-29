# October 28 — Detailed-mesh LOD queue repair and retained-source editing

This is a local follow-up to the pushed `4081f33` checkpoint, continuing the user's full Fusion Studio goal and bug-fixing request. It does not change the application version, replace a release, or establish professional character realism. The earlier LOD checkpoint remains historical evidence; the previously failing dense reduction is repaired here.

## Problem and resulting behavior

The reducer queued repeated versions of the same edge after nearby collapses. Obsolete rows could remain behind higher-cost candidates until the two-million-row budget was exhausted. A 196,608-triangle mesh therefore failed at the 25% target despite fitting the documented input-size budget.

`LodCandidates` keeps one queued row per undirected edge, supports priority replacement in both directions, and removes edges belonging to a collapsed vertex. The input, normal, topology and accumulated-displacement limits are unchanged. Queue peak/strategy/budget diagnostics accompany worker output and are validated against the source bounds. The initial edge inventory is released after scheduling.

The formerly failing torus now reaches **49,152 triangles**, with a peak of **294,014** queued rows. Detailed tests retain UV boundaries, Euler characteristic, material remaps, source correspondence and the 2% cluster-displacement limit. A separate comparison against the saved previous kernel produces byte-identical source/index/face/representative arrays for three previously supported cases: 49,152 triangles at 50% and 25%, and 98,304 at 50%. This is regression evidence for those cases, not universal simplification-quality certification.

The Character workspace also supports an actual retained-source editing loop:

1. On a LOD set, choose **Edit retained source** to expose and select the original generator/rig controls.
2. Change the source character using its existing controls or pose tools.
3. Use **Saved LOD sets** to review a previous set.
4. Choose **Rebuild copies from source**, review compatibility, and generate a new set using the same target fractions and selected generated level.

The previous set stays in the project, including any artist edits to its reduced meshes. It is hidden when the new set becomes active. New metadata records the predecessor set ID. The source is not replaced, copied controller programs are not guessed, and no existing derived edits are overwritten. Missing sources or links into another derived set reject with relinking guidance.

Display changes and source selection now use the shared deformation transaction, including snapshot/selection/frame recovery if the history commit fails. Regeneration retains the staged, revisioned, cancellable worker transaction and installs only completed results. A completed action adds one history entry; the existing snapshot-memory policy can prune earlier entries for large scenes. Retained old meshes remain part of the project and increase its size independently of history pruning.

## Verification

- Final build passes; the existing large-bundle warning remains (approximately 2.303 MB main JavaScript, 639 KB gzip).
- **1,094/1,094** discovered unit tests pass, with zero failures/skips/cancellations, in 89.00 seconds. Log: `test-output/code-review/lod-source-final-suite.log`.
- The queue is checked through 12,000 seeded operations against an independent sorted-map reference, including priority increases/decreases, reversed-edge replacement, removal, extraction, ties and atomic capacity rejection.
- The 196,608-triangle test reaches 25% while retaining topology/borders and independently validated remaps. Forged queue reports reject before mesh installation.
- Headless scene tests cover source selection, old-copy edits, source deformation, regeneration, selected-level retention, one history entry, undo/redo/reload, cancellation, missing/derived source links and failed display-history commits. Failed display changes restore scene visibility, selection and timeline frame.
- Final public desktop evidence: `test-output/character-lods-1793251390825/results.json`. Real compatibility review, worker generation, custom-shape/skin correspondence, undo/redo, save/reopen, GLB and Cycles delivery pass. The body still reduces 26,756 to 6,690 triangles with zero sampled corresponding posed-vertex error; protected surfaces and the unmet rounded target remain explicit. Generation measured 6.633 seconds during validation.
- The same public workflow edits the retained creator's body-fat control to 0.65 and verifies that body geometry actually changes. It retains a deliberate vertex edit and artist metadata on the old reduced body, checks compatibility cancellation, rebuilds the selected lowest level, then verifies one new history entry, undo/redo, reopen and a new GLB delivery. The source recipe and both copy sets remain in the project.
- Final private evidence: `test-output/character-lods-private-1793251467887/results.json`. Both installed Genesis 8 bases retain sixteen skinned parts, reach the same recorded reduced counts and match sampled source skin positions. Editing the retained shoulder pose by 0.1 radians and rebuilding produces that measured difference from the earlier copy, with zero measured quaternion error against the current source. Both rebuilt sets retain the lowest active level and predecessor, save/reopen and export successfully. Original DUF hashes/timestamps and conversion GLB hashes remain unchanged. No private model or generated output is added to distributable files.

## Measurements and limits

CPU kernel measurements from `test-output/code-review/lod-performance.json`, with the same torus charts as the preceding checkpoint:

| Input triangles | Fraction | Output triangles | Time | Peak queued edges |
| ---: | ---: | ---: | ---: | ---: |
| 49,152 | 50% | 24,576 | 1.91 s | 73,278 |
| 49,152 | 25% | 12,288 | 2.66 s | 73,278 |
| 98,304 | 50% | 49,152 | 3.85 s | 146,942 |
| 98,304 | 25% | 24,576 | 5.41 s | 146,942 |
| 196,608 | 50% | 98,304 | 8.12 s | 294,014 |
| 196,608 | 25% | 49,152 | 11.66 s | 294,014 |

These are asynchronous CPU operations. The indexed queue is not uniformly faster: a same-process reference comparison measured some smaller cases about 5–20% slower than the old queue. It avoids duplicate-driven budget failure; it is not an interactive-preview performance claim. The retained capacity remains two million candidates, and existing input/attribute/part/output limits remain.

LOD remains partial. No general arbitrary-pose, self-intersection, Hausdorff, skeleton-palette or groom-reduction quality certificate is added. Material/UV borders and protected eye/hair surfaces can still prevent requested ratios. Full creator realism, native-format fidelity, garment/contact behavior and the rest of the original roadmap remain unfinished. The checked full-body Cycles image still has coarse skin/face detail and is not a realism sign-off.

Earlier BMW and original-installation reports retain their stated dates/scopes; those broad scans/renders were not rerun in this follow-up. Private source hashes/timestamps are checked by their workflow. All generated evidence is local in ignored `test-output/`.

Reproduce with `npm run build`, `npm test`, `npm run test:character-lods`, `npm run test:character-lods-private`, and `npm run test:character-lods-performance`. Private checks require the locally installed compatible bases; Cycles checks require the configured local Blender worker.

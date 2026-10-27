# Muse implementation status (from plan.md)

Started 2026-10-26. This index records the truthful baseline and per-milestone state. Update it at every checkpoint; do not mark gates complete on partial evidence.

## M0 — Baseline (done 2026-10-26)

- Repo: branch `main`, HEAD `66352d9` at start; worktree clean except untracked `plan.md` (user-supplied work order, left untracked).
- App identity: package `0.0.0`, UI label v0.0; document schema 2 (unchanged).
- Hosts found: Blender 5.2.0 LTS (`C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`), DAZ Studio 4, Marvelous Designer Enterprise Offline, Character Creator 5.
- **ZBrush: not installed** (no ZBrush under `C:/Program Files/Maxon`). M3 therefore stays preservation-only until a user-owned fixture + legitimate host/SDK exists. No ZPR parser may be claimed.
- Baseline checks at start: `tests/sculpt.test.mjs` + `tests/serialization.test.mjs` = 15/15 pass (Node v24.22.1 from `test-output/nodejs`; no system Node on PATH).
- Prior checkpoint: full suite 224/224, creator UI suite passes (see git history `66352d9`).

## Milestone state

| ID | State | Notes |
| --- | --- | --- |
| M0 | Done | This file; baseline above. |
| M1 | In progress | Source-capsule + adapter registry in `src/source-capsule.js` and `electron/source-capsule.cjs`: SHA-256, header probing (extension not trusted alone), dependency completeness; preservation-only formats labeled distinctly. Convert jobs now write `source-capsule.json`, return the capsule, store it on the imported group (`userData.sourceCapsule`) and report the preservation/editability summary to the user. Export actions are now distinct in the Export dialog: **Export Original** (byte-exact, SHA-256-verified copy to a new file via `copyOriginal`; refuses in-place and overwrite; unavailable unless the original location was verified this session) vs **Interchange** (glb/fbx/obj + new .blend delivery, labeled as new files). Remaining: capsule capture inside project saves and dependency (texture) inventory. Tests: `tests/source-capsule.test.mjs`, `tests/source-capsule-electron.test.cjs`. |
| M2 | In progress | Preserved `.blend` source-cage identity is now proven in real Blender 5.2: `scene_inventory` (ordered collections/objects/parents/material slots) survives fixture → `capture()` → snapshot → clean-session reopen byte-for-name identical (`tests/native-scene-inventory.test.cjs`, two Blender sessions; skips honestly without Blender). The cage inventory now also covers mesh components (UV layer names, shape-key names, attribute names, per-object vertex groups) and armature bone names — all proven to survive the preserved snapshot on the fixture. Existing native guard still covers checksum, corrupt headers, geometry/material edit blocks and owner transforms. DSON side: importer report carries dependencies + unsupported fields (see M1 capsules). Remaining: Blender component edit contracts (materials/UV/shape keys/armatures/cameras), DSON morph/joint-center roundtrips on production figures, prototype-unreachable warnings, copy protection. |
| M3 | Blocked (host/fixture) | Preservation-only `.zpr`/`.ztl`; `.zprj` kept as a separate Marvelous format. Exact missing capability: ZBrush installation/SDK + user-owned ZPR fixture. |
| M4 | Mostly done | Foundation fixes: topology-keyed adjacency cache, autosmooth reads post-brush positions, Smooth respects falloff + mask, paired invert semantics (Pinch/Magnify, Fill/Deepen, Scrape/Peaks, Flatten/Contrast), persistent Mask channel respected by all brushes (Clear/Invert in the panel). 27 brushes live. Tests assert side predicates, mask exactness, Layer cap, pinch/magnify opposition, topology rewiring — no tautologies (the `|| true` assertion was removed). Mask survival across save/reopen is verified through the editor's buffer-view serialization path (test in `tests/sculpt.test.mjs`). Remaining: worker-side kernel + BVH queries are M8 performance work. |
| M5 | In progress | Kernels shipped with distinct tests: Multi-plane Scrape (two-plane crease fit), Elastic Deform (gaussian field beyond the brush radius — a falloff-guard bug that silently skipped it was found by its test and fixed), Cloth (artistic sine folds, explicitly not simulation), Pose (bend around a pivot axis, pinned behind the pivot). Mesh filters are in (Smooth/Sharpen/Relax/Volume-preserving Smooth + mask Blur/Grow/Shrink, panel-wired, volume-drift tested). Remaining: annotations, indexed-geometry/hot-path correctness passes. |
| M6 | In progress | Working-copy identity for modifier stacks was already retained (root UUID/name/transform/userData + retained source). Gap closed: evaluated GLB roundtrips could silently drop the sculpt mask — `transferMask` now restores it by nearest-vertex transfer into stack results (unit-tested region fidelity >90%). Dyntopo mode is in: conforming red-green local refinement under the brush with a detail-size control, UV/mask midpoint interpolation, and pre-mutation rejection (with explanation) for shape keys and multiple material groups; manifold-edge correctness is unit-tested. Multires mode is in: Loop-subdivided working copies with the level as a document property and the source geometry retained on the copy for exact re-leveling (level 0 = source, vertex-for-vertex). Remaining: sustained-stroke performance at production density (M8). |
| M7 | In progress | DAZ DSON production gate passes on the local Genesis 9 figure (`npm run test:dson`: direct import → geometry 25,182 verts, UV, rig, sparse shape-key application, GLB output, and every original dependency hash unchanged). Character Creator gates have their own suites. Remaining per-format fixtures (Marvelous/CC roundtrips, strand hair cards, PBR bakes) land only with user-owned examples. |
| M8 | Not started | No package until gates pass; earlier releases preserved. |

## Known limits carried forward (do not erase)

- Female shirt fit historically ~69% peak strain at 20 iterations; a global 8% panel enlargement was rejected. Garment quality is not complete.
- Creator warm previews historically 157–313 ms; the 100 ms target is unmet.
- Extreme poses (95° raised arm) exceed the 120 s offline drape budget and roll back safely; posed-cloth quality remains an open gate.
- Long hair has no body/garment collision.

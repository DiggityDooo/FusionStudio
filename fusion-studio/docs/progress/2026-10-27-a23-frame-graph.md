# A23 frame graph — 2026-10-27

## Kernel

New `src/frame-graph.js`: the scheduling core of a real-time render
pipeline. Passes declare resource reads/writes; `compile()` produces
the execution schedule without any GPU involvement.

- Topological ordering with producer→consumer edges (a read depends on
  the nearest preceding writer), plus WAW and WAR hazard edges by
  declaration order. Cycles are reported with the stuck passes named.
- Transitive pass culling: passes whose outputs nobody live consumes
  are removed, chains included; `sideEffect` and `finalPasses` entries
  survive. Reads no live pass writes are errors unless declared
  `external`.
- Resource lifetimes (`firstUse`/`lastUse` in compiled order, externals
  starting at -1), writers/readers per resource.
- Transient memory planning by greedy interval coloring: resources
  with disjoint lifetimes share slots, externals get none.

Two defects surfaced during testing and were fixed in the kernel/test
pair: producer edges initially targeted every writer (creating a false
WAR cycle — now nearest-preceding-writer), and the external-input test
under-declared its externals.

## Verified (tests/frame-graph.test.mjs, 6/6)

Producer-before-consumer ordering on a shadow→GBuffer→lighting→
bloom→tonemap graph; transitive culling of a debug chain with a
side-effect screenshot pass preserved; exact lifetimes and slot
aliasing (simultaneously-live GBuffer targets get distinct slots,
total slots < resource count); external inputs slotless and validated;
WAW/WAR ordering; cycle and duplicate errors.

## Ledger

`A23 PBR real-time pipeline` gains `tests/frame-graph.test.mjs`. Stays
partial: the schedule compiler is verified — GPU pass execution in the
realtime engine is separate work. Backup refreshed
(test-output/kernel-backup-2026-10-27).

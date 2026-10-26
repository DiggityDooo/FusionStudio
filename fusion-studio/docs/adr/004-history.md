# ADR 004 — Delta history with bounded snapshot fallback

Status: hybrid proof implemented in 0.3.0: 200-entry command history, transform/insertion deltas, exact snapshot fallback. Compression/disk spilling and remaining delta types are not implemented.

Historical 0.2.1 baseline: `commit()` stringifies the whole scene. It keeps up to 25 states, trimming over 60 million string characters but retaining at least two states. Characters are not a measured byte budget; one large pair can exceed it. Full restoration rebuilds the scene, resets selection/mode/timeline frame, and can change object references. Dense geometry and embedded images are copied repeatedly.

Choose hybrid command deltas with compressed content-addressed snapshots for heavy replacement. Pure inverse operators can be non-deterministic (simulation, mesh generation); snapshots everywhere remain too expensive. Store exact before/after channel values or topology patches, use stable IDs, coalesce gestures, and retain dependent resources while any history entry needs them. Stage worker results before transaction publication. Save/load migration is independent of transient undo history.

Acceptance: 200 transform steps on 1M triangles, <=64 MiB incremental history, exact undo/redo roundtrip, branch pruning, mixed delta/snapshot commands, shared resource lifetime, failed/cancelled operation leaves history unchanged. Report heavy-operation memory separately; the budget is not a promise that 200 remeshes fit in memory. Benchmark actual resident and retained history sizes, not only JSON character counts. The current audit reports string-size bounds explicitly, not heap measurements.

0.3.0 measured evidence: tests/foundation.test.mjs, test-output/delta-history-results.json. A pending transform/insertion ledger materializes the snapshot baseline only before a fallback operation. Mixed delta/snapshot undo/redo and branches are tested. Snapshot fallback still uses full strings and can trim history below 200 entries; transform-only tests meet the targeted count.

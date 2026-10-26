# ADR 001 — Topology kernel

Status: accepted by the user on 2026-10-13. Rust/WASM direction authorized; implementation not yet started.

## Observed problem

Three.js indexed triangles are the source of truth today. Editing reconstructs adjacency on demand, welds by rounded positions and cannot retain polygon/corner identity. This is inadequate for seams, non-manifold modeling, stable deltas, multires and morph correspondence. Rust/cargo were not found on PATH during the audit; a toolchain would need to be provisioned in a new development location.

## Options

| Option | Benefits | Costs/risks |
|---|---|---|
| TypeScript typed-array topology in a worker | Fastest iteration with current code, one debugger/toolchain, easier UI integration | Requires the same topology/attribute correctness work; care with allocations/GC, buffer copies and numeric predicates; no promise of adequate dense sculpt speed |
| Rust/WASM topology behind a TypeScript API | Explicit memory layout, efficient packed attributes and adjacency, reusable tested core | Build/debug/FFI overhead; memory growth/ownership complexity; slower initial delivery; algorithms still need implementation and validation |
| Blender BMesh as primary editable state | Existing extensive Blender topology operations | Requires a different viewport/interaction/scene ownership design; process round trips can hurt interactive edits; source-based integration changes distribution choices |

## Recommendation

Rust/WASM for the long-term independent editor, with a stable TypeScript worker API and progressive migration. First prove split/extrude/undo on an attribute-rich mesh and benchmark a typed-array TypeScript reference. Keep the option to stop the Rust migration if measured integration cost outweighs its benefit. The confirmation permits provisioning a toolchain and starting this kernel when Phase 2 begins.

Use vertices, edges, faces and corner loops with stable generational IDs. An ordinary two-half-edge-only structure must not silently reject or corrupt non-manifold inputs: use radial edge incidence or an explicit non-manifold representation. Preserve UV/color/material data per corner/face and weights/morph deltas per vertex; operations return old-to-new maps and fidelity losses. Never weld coincident seam vertices solely by position. Selection references stable entities, not buffer offsets. Renderer triangles are derived caches.

Acceptance gates: invariants/fuzzing, manifold and non-manifold fixtures, seam/weight/morph preservation, serialization, every operation invertible, 500k-triangle selection/transform benchmark and bounded allocation. No language-specific speed claim has been measured yet.

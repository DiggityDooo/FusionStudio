# Fusion Studio architecture decision package

Status: **direction accepted by the user on 2026-10-13: Rust/WASM, persistent installed-Blender worker and open-source code**. Written 2026-10-13 against the 0.2 source. [Audit](docs/AUDIT.md), [decision records](docs/adr/), [phase map](docs/ROADMAP.md).

## Product boundary

One Windows application and one editable project. Blender-inspired areas, operators and shortcuts. Character, garment, animation and rendering tools share the scene. Compatibility is checked before a mutation or export, including any repair that changes fidelity. Existing vendor installations and content libraries remain read-only. No DAZ, CMS, CC or MD process is launched. Their native engines are not proven embeddable.

The goal remains coverage of all four applications. A feature name in a menu does not establish equivalent behavior. The coverage table records demonstrated subsets and missing behavior; performance targets below are requirements, not achieved measurements.

## Accepted direction

1. **Recommend a Rust/WASM topology core behind a TypeScript interface**, developed in a dedicated worker. Keep current tools working during migration. This is a proposed long-term mesh layer, not a claim that changing languages alone solves performance. A TypeScript typed-array kernel is a viable faster-start alternative. See [ADR 001](docs/adr/001-geometry-kernel.md).
2. **Recommend a persistent, isolated installed-Blender worker, with one-shot fallback**, subject to a bounded prototype proving persistence, cancellation and data fidelity. The application still presents one operator and one undo transaction. A Blender-source-based application is the stronger alternative if fastest Blender feature parity is the overriding priority, but is a substantially different architecture and requires an explicit distribution decision. See [ADR 002](docs/adr/002-blender-relationship.md).

The user confirmed both recommendations and open-source intent. No further architecture confirmation is needed. The kernel remains future work; 0.4.0 implements persistent worker lifecycle and private stdio requests with a full fresh-scene import per job. Scene-diff caching and rich attribute transfer remain future work; no Blender source integration was chosen. The Phase 1 foundation slice is documented separately. Original Fusion code is MIT-licensed; dependencies and vendor content retain their own terms. No publication was performed.

## Ownership and execution

```text
Menus / shortcuts / F3 / tool gestures / extension panels
                      |
             Operator dispatcher
       poll -> validate -> fidelity preflight
       -> user decision -> transaction -> execute
                      |
       Versioned document + command history
            /                       \
   Mesh worker (future)       Installed Blender broker
   topology + attributes     serialized jobs + isolated cache
            \                       /
        immutable result / revision-checked patch
                      |
        Three.js viewport + other area editors
```

The document is authoritative; renderer objects and worker scenes are projections. Workers never silently replace the whole scene or apply a result to a different project. The target design requires every result to carry project ID, document revision, input asset hash and stable object IDs. Current worker transport checks request revisions and owned process identity; the UI locks mutations until completion, while richer project/asset manifests remain pending. Main process brokers file access and jobs; renderer receives structured messages, not shell access. Imported scripts remain inert data.

Native Fusion responsibilities: layouts, selection, tools, operator dispatch, history, topology edits, independent character/pattern data, animation authoring, fidelity reporting. Delegated responsibilities: Cycles/EEVEE where verified, selected modifiers, unwrap/bake/cloth operations and later node evaluation. Direct DSON remains a read-only importer. CC/MD equivalents are independently implemented unless a supported integration is established without launching those hosts.

GLB remains an interchange format, not the lossless internal representation. Worker transfers need separate attribute, hierarchy, bone, material and provenance manifests. Geometry operations explicitly declare preserved IDs/layers, remapping tables and losses. The full vendor scene is never claimed to survive an ordinary GLB trip.

## Operator contract

```ts
interface Operator<P> {
  id: string;                         // e.g. mesh.extrude_region
  label: string;
  properties: PropertySchema<P>;      // validated primitives/enums/IDs; no eval
  poll(context: ReadonlyContext): {available: boolean; reason?: string};
  compatibility: string[];            // stable rule IDs
  undo: 'delta' | 'snapshot' | 'none';
  concurrency: 'document-write' | 'read-only';
  execute(context: TransactionContext, props: P,
          signal: AbortSignal): Promise<OperatorResult>;
}
interface OperatorResult {
  patch?: DocumentPatch;
  inverse?: DocumentPatch;
  outputArtifacts?: Artifact[];
  fidelity: FidelityOutcome[];
}
```

Register once: `operators.register(definition, {menus, keyBindings, searchTags})`. UI calls `dispatcher.run(id, props)`; no direct geometry mutations from buttons. A drag is begin/preview/end of one command, not hundreds of history entries. Poll is side-effect-free. Property validation and fidelity rules run again at execution to avoid stale selection. A per-document write lock prevents New/Open or concurrent mutations from replacing an in-flight job's target. Read-only navigation may remain available.

The dispatcher collects affected objects/properties, explains exact/approximate/omitted results, and resolves Proceed/Fix on Copy/Cancel once. Escape, X and backdrop dismissal are Cancel. Blockers cannot be ignored. Warning dismissal is per-project/rule/version, optionally session-scoped; changed evidence invalidates it. Fixes are part of the same atomic transaction, act on copies and are preflighted. Failed/cancelled jobs publish no patch or history entry.

F9/Adjust Last starts from the captured pre-operation state and replaces only the last compatible transaction. It does not repeatedly apply an extrusion to the previous extrusion. Search lists unavailable operators with reasons. Undo/Redo themselves do not append history. Render creates artifacts and has no geometry inverse; Cancel stops work, while generated files remain versioned artifacts.

## History

Use command deltas for transforms, property edits, insert/remove, keyframes, layer changes and changed vertex ranges. Mesh topology commands record deleted/created entities and attribute remaps. Heavy replacements use compressed before/after buffers or content-addressed snapshots. Keep resource references alive until neither scene nor history uses them. Shared geometry/material edits must explicitly clone or edit all linked users.

Target: 200 transform steps on a 1M-triangle scene with <=64 MiB incremental history, excluding the baseline mesh/GPU buffers. This target does not promise 200 full remesh snapshots in that space. A configurable byte budget spills compressed heavy snapshots to isolated local history storage; show available steps and history cost. Histories track scene selection/context where meaningful. Tests must cover undo/redo after import, cancel, branch-after-undo, deletion of shared data, and save/load.

Do not layer a delta history on top of legacy `commit()` calls: migrate through an adapter that routes each action to exactly one history path. Keep snapshot fallback until every existing action has coverage. [ADR 004](docs/adr/004-history.md).

## Document and migration

Version 1 currently stores Three.js JSON, userData and a few editor settings. Introduce a version 2 manifest with typed ID-indexed collections: objects, meshes, armatures, shape keys/drivers, materials/graphs, curves, lights, cameras, actions/F-curves/NLA, constraints, modifier stacks and cloth patterns/seams/fabrics. Attribute arrays live in binary resources with checksums, units, domains and component types. Provenance is separate from editable state. User library paths are references, never bundled content by default.

Migration v1 -> v2 is deterministic, preserves stable UUID mappings, imports existing `fusion_timeline` and character/garment metadata, and stores uninterpreted supported metadata in a namespaced extension bag. Missing functionality is reported, never silently thrown away. Unknown future major versions fail with a clear message. Save writes a fresh version to a new directory; original v1 stays unchanged. Keep fixtures for v0.1, v0.2 rig/morph scenes and edited primitives. [ADR 005](docs/adr/005-document-and-assets.md).

## Areas, keymaps and extensions

Area layout is a versioned split tree: stable node IDs, axis, ratio, minimum size; leaves have editor type and editor-local state. Scene data is not duplicated when splitting views. Maximize stores/restores the tree. Workspaces reference named layouts and shared document selections. Phase 1 starts with viewport/log leaves and resize/split/join/swap/persistence tests; it does not label future node or graph editors as implemented merely because their names appear in a selector.

Keymaps dispatch operator IDs and validated properties through explicit contexts (text entry, modal tool, editor, global). Conflicts are detected in overlapping contexts. Preferences and layouts use a separate versioned user file under Fusion's data directory. Autosave/history persistence must run outside the renderer and report failures rather than swallowing quota errors.

Importer/exporter registry entries expose extensions, sniff/validate, asynchronous inspect/preflight, execute, supported features and expected losses. One fidelity matrix feeds import/export/operators. Local extensions can register operators, panels, format readers and node types using versioned contracts; initially ship built-in modules only. A future extension permission model must control filesystem/worker access; arbitrary renderer JavaScript plugins are not sandboxed by declaring an interface.

## Progress and cancellation

Long work uses worker threads/processes. Progress phases report known counts when available and indeterminate status otherwise. Bounded queues prevent duplicate jobs. Cancellation terminates a disposable worker if cooperative cancellation is unavailable, invalidates its scene mirror and discards partial outputs. Writes are unique; final results become visible only after checksum/schema validation. Retrying creates a new job folder.

Mesh buffers transfer by ownership or explicit copy; no shared mutable arrays cross renderer/history/worker boundaries. Rust/WASM memory views cannot be retained across growth or used after worker disposal. BVH/adjacency caches are keyed by geometry revision and invalidated with edits. [wasm-bindgen's numeric-slice documentation](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html) informs the transport design; copies must be measured rather than assumed absent.

## Verification and next slice

Before Phase 1: complete this audit, fix demonstrated serialization losses, run existing tests, record baseline and obtain the two decisions above. Next slice: move/add primitive/extrude/undo/render through the dispatcher, cancellation/warning tests, transform deltas versus the baseline, and two real area types with saved splits. No claim of complete Phase 1 until its full acceptance set passes. See [roadmap](docs/ROADMAP.md) and [coverage](FEATURE-COVERAGE.md).

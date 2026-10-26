# ADR 002 — Installed Blender relationship

Status: option B accepted by the user on 2026-10-13. Persistent installed-Blender worker authorized, with one-shot fallback. Lifecycle implemented in 0.4.0 and tested with real processes. Full scene synchronization remains pending; no source integration selected.

| Option | Strength | Tradeoff |
|---|---|---|
| A. One-shot jobs | Existing tested isolation/recovery; smallest change | Repeated startup/import/export; weak live modifier/render interaction; GLB loses native data |
| B. Persistent headless worker | Amortizes startup and enables an editable Blender scene mirror; reuses many existing engines | IPC, memory lifecycle, scene synchronization and cancellation become new failure modes; still does not supply Blender's whole editing UI |
| C. Blender-based application/add-on/fork | Most direct path to broad Blender feature coverage in one UI | Major change from Electron editor; release/build maintenance; GPL and bundled-component obligations must be decided; adds no automatic DAZ/CC/MD parity |

Recommend **B with A as fallback** for incremental continuation of this codebase. If earliest complete Blender functionality matters more than retaining the Electron editor, choose C deliberately before spending months reimplementing modeling/animation editors. Rust + B is not intrinsically the fastest route to all four products' feature coverage.

Prototype B with versioned local named-pipe or loopback IPC, per-session nonce, fixed command allowlist, IDs/revisions, bounded messages and serialized execution. No arbitrary-code endpoint. `bpy` calls execute on Blender's main thread: [Blender documents Python threading limitations](https://docs.blender.org/api/5.0/info_gotchas_threading.html). A controller can handle transport separately; do not mutate Blender data from a background Python thread.

Keep the same factory startup, disabled autoexec, isolated profile/temp and unique output directories. Test real process persistence across two operations, synchronization of transforms/rigs/UVs/materials, crash restart, cancellation and stale-result rejection. A long blocking operation may require killing/restarting the owned worker; no claim of streaming/cancellable Blender operations until proven. Never target a user-open Blender process.

Result fidelity is explicit. GLB alone cannot preserve modifiers, drivers, material graphs or cloth metadata. Keep manifests/sidecars and patch selected resources instead of replacing all scene identities. Worker revision cache is disposable; project and undo remain authoritative.

[Blender is GPL software](https://www.blender.org/about/license/). This ADR is not a legal conclusion that IPC removes obligations. No Blender source is being embedded now. Source-based integration and distribution of Blender require the explicit user decision requested in the supplied plan and a dependency/license review. No commercial engine is bundled or started.

## 0.4.0 bounded implementation

Uses private child stdin/stdout rather than a socket. Protocol version 1, monotonic request IDs and a random response prefix identify the owned session. Requests name confined immutable job files; there is no code-execution endpoint. Main-thread Python processes one request at a time. A factory scene reset and disabled autoexec precede each import, avoiding cross-job data contamination. A full GLB import/export remains necessary for every request.

Verified: repeated same-PID operations, Y/Z axis mapping, changed input after multi-object jobs, recoverable operation errors, cancellation/restart, owned-process crash/restart, scene rollback and one-undo UI transaction. Tests use small deterministic fixtures; these are not full vendor fidelity or long-session memory tests.

An idle worker exits after 60 seconds; closing Fusion stops its child. Explicit `FUSION_ENGINE_ONESHOT=1` selects the fallback, without automatic replay of failed jobs.

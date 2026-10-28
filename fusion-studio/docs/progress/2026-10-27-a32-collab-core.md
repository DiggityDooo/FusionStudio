# Progress — 2026-10-27 — A32 collaboration core (new files only)

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Op-log scene document: LWW fields, tombstones, Lamport clocks, deterministic convergence in any delivery order | `src/collab.js` | `tests/collab.test.mjs` (6/6) |
| Log merge/dedupe + compaction to a minimal equivalent op set | `src/collab.js` | same |
| Version snapshots + rollback restore | `src/collab.js` | same |
| Presence (selection/cursor/heartbeat staleness), role gates (viewer/commenter/editor/owner) | `src/collab.js` | same |
| Review comments with resolve flow | `src/collab.js` | same |

Verified combined across all new kernels: 61 pass, 0 fail.

## Status update (11:14, landed 11:52)

The parallel session registered all A32 items as partial with its own
preview evidence, so the status flips below are **superseded**. **Landed:**
`tests/collab.test.mjs` is in the main test list (383/383) and cited as
evidence on the sharing/version-history/review items (kernel at
`src/collab-sync.js`).

## Proposed ledger updates (superseded — see above)

- `A32 Cloud project sharing and live multi-user editing`: open -> **partial**
  (transport-agnostic sync core in; no network transport or cloud hosting).
  Evidence: `tests/collab.test.mjs`.
- `A32 Version history, branching and rollback`: open -> **partial**
  (snapshots/rollback + log compaction in; no branching).
- `A32 Review/annotation tools and playlists`: open -> **partial**
  (positioned comments in; no playlists).
- Add `tests/collab.test.mjs` to the `package.json` test list.

## Still open in A32 after this slice

Asset libraries/search, task/shot tracking, render-farm integration,
licensing, pipeline validation/publishing, USD layered assembly,
dependency tracking/relinking.

## Coordination update (11:10)

The parallel session overwrote `src/collab.js` with its own A32 preview
module, breaking `tests/collab.test.mjs`. The test-verified sync kernel now
lives at `src/collab-sync.js` (test repointed; combined suite green).
Reconcile A32 evidence across both modules.

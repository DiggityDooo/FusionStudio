# Cloth-to-cloth inspection — 0.19.0 source, unreleased

Fusion now checks the final physical drape against its own cloth surface. Previously the fit checks measured body contact without a final cloth-to-cloth audit. Crossing pairs, coplanar overlap, insufficient clearance, collapsed faces and incomplete inspection now contribute explicit fit issues. A failed or incomplete audit cannot produce a passing physical-preview diagnostic.

## Implemented behavior

- A typed `auditClothContacts` native operation runs in the existing disposable geometry process. Ordinary inspection retains its 30-second timeout and actual-process-exit cancellation/recovery behavior. Requests support up to 60,000 vertices, 100,000 triangles and 4,000 sewing pairs; JSON payloads are bounded to 32 MB by the native entry point.
- BVH candidate inspection uses triangle crossings, projected coplanar-area overlap, vertex/face distance and edge/edge distance. Required cloth clearance is twice the selected collision thickness, with a 1 micrometre numerical gap tolerance. The reported minimum is among tested non-excluded features, not a global minimum-distance certificate.
- Shared vertices and welded sewing roots are excluded. Primitive exclusions also include the existing structural/bend/sewing mask and bounded shortest paths on the current surface edge graph within three required gap widths. This explicit local neighbourhood avoids false self clearance on finely tessellated flat cloth. It does not check adjacent fold inversion or local bend feasibility. Separate unsewn layers retain independent graphs.
- Local traversal stops after 8 million edge visits; pair inspection stops after 2 million candidate pairs. Either limit means incomplete coverage. An incomplete local mask stops before distance classification, avoiding fabricated contact counts. Reports distinguish local-search and face-pair limits; neither is a successful zero-contact result.
- Clothing exposes **Inspect cloth contacts** on plain patterns and linked garments. Pattern connectivity/sewing is reconstructed in a cancellable preparation worker and must exactly match the displayed mesh identities. The native check uses displayed world-space vertices. Input hashes, object/project identity, document revision and a geometry signature reject stale work.
- Inspection is read-only. Its dialog can highlight up to 32 measured face pairs. The transient overlay is outside the project/export root, clears on Escape, revisions, transforms or geometry replacement, and cannot become saved or rendered geometry. An expired highlight action explains that inspection must be rerun.
- Physical drapes retain the audit with existing metrics through undo and project storage. Older saved results without the field remain readable and display that contact has not been inspected. Malformed saved audit data is rejected before display.

## Detailed evidence

| Fixture | Demonstrated behavior |
| --- | --- |
| 5,184-triangle independent layers, both windings | Distinguishes crossing surfaces, coplanar overlap, a deficient 3 mm gap and a clear 12 mm gap |
| 6,400-triangle connected return fold | Reports the tight 3 mm return surface, accepts 12 mm spacing, and excludes its immediate local bend |
| 5,000-triangle flat sheet at 8 mm and 2 mm grid spacing | No false clearance contacts after local-path exclusion; the original fixed-ring audit incorrectly reported 152,518 pairs in the fine case |
| 20,000 triangles at 0.6 mm spacing | Reaches exactly 8 million local visits and reports incomplete coverage with no invented contact counts |
| 36,864-triangle stack of 32 closely spaced layers | Reaches exactly 2 million total candidate pairs, reports real measured contacts and incomplete overall coverage |
| 4,096-triangle two-layer physical simulation | Under normal gravity, the boundary-pinned outer layer reaches the fixed inner layer and retains a measured 6 mm gap; zero measured crossings/overlaps/clearance violations or pin drift |
| 4,652-triangle overlapping authored panels in the desktop app | Visible warnings/highlights, identical serialized scene/history/frame and byte-identical GLB with highlights present; Escape, revision expiry, cancellation and stale-result recovery pass |
| Saved posed 4,418-triangle Genesis garment | Read-only inspection reports no measured non-adjacent cloth contacts; scene/history/frame are unchanged |

The physical layer case settles to approximately 0.1664% maximum edge strain and 5.55e-14 m/s maximum final speed in 100 steps. Native duration in the full regression run was 14.56 seconds, including a 0.113-second final audit. This is a stationary pinned-layer case, not a guarantee of correct layer ordering or animated simulation. Existing geometric self-contact projection remains separate from the fabric energy solve.

Measured audit times in the concurrent regression run were about 0.23–0.38 seconds for the 5,184-triangle layer variants, 0.35 seconds for folds, 0.11–0.49 seconds for the flat sheets and 5.15 seconds for the capped dense stack. These are individual native audit costs on this machine, not drape timings or controlled interactive-performance claims. Preparation/IPC/JSON add cost. Oversized or very fine configurations retain explicit limits.

Verification: **170 JavaScript regressions and 32 Rust tests pass** against the final source, with the existing private matrix-profile benchmark ignored by default. The contact-inspection desktop test, complete desktop material workflow and combined physical workflow also pass. The build passes with the existing large-bundle advisory. No new dependency or solver-position change is included in this slice.

Private evidence: `test-output/cloth-contact-native-results.json`, `cloth-contact-ui-results.json`, `cloth-contact-overlap.png`, `physical-layer-results.json`, `cloth-audit-build.txt`, `cloth-audit-regression.txt`, `cloth-audit-spine-ui.txt` and `cloth-audit-asset-preservation.json`. Original private meshes and simulation buffers remain outside checked-in/distributable code. The test source constructs its own public geometry; private desktop fixtures are loaded from existing local test reports.

## Delivery and remaining work

**0.19.0 remains unreleased; 0.18.0 remains delivered.** Prior 0.15–0.18 archive/native/helper hashes and the original Genesis DUF still match. The original-installation verifier finds no changed/missing baseline files and all 15 sampled hashes match. Strict preservation still fails on the same three extra DAZ-to-Maya paths; their provenance remains unresolved and the baseline/installations are left untouched. No assets, vendor code or runtimes were published.

Robust layer ordering, animated/faster-motion collision, adjacent-fold feasibility, coupled cloth-contact equilibrium, boundary/neckline quality, empirical calibration and interactive dense draping remain open. The full character/modeling/render/interchange goal remains active. This audit improves measurable garment quality without claiming production cloth or vendor-solver parity.

Native SHA-256: `16db463c8bdb978650c7415d555f21bb3c463e60a0c4faf82006d5cce0880d77`.

## Final combined replay

The uninterrupted desktop replay passes material study/cancellation, undo/redo, preview restoration, malformed/work-budget recovery, explicit two-second settling, body shaping, 22-degree upper-arm posing, authored hem refinement, retained-source accessory stack, save/reopen and a same-scene Cycles render. No page errors occur. Native stage times are **40.25 / 43.32 / 38.41 / 60.07 seconds** for settling/shaping/pose/refinement.

The saved final garment has **4,418 triangles**, **28.07-degree minimum angle**, **21.81% maximum edge strain**, **0.02072 mm mean seam gap**, **4.592e-6 m/s maximum speed** and **1.219e-9 recomputed relative residual**. It retains zero measured body or cloth crossing/overlap/clearance violations, zero pin drift, no unfinished contact sets and no stalled projections. The complete final audit checks 42,517 candidate face pairs, excludes 26,262 shared-root pairs and takes **44.38 ms**. Minimum tested non-local gap is 13.55 mm, above the required 6 mm. The audit survives saving/reopening with the garment's diagnostics.

The rendered image was inspected: no visible body breakthrough; neckline and hem refinement remain necessary. This remains an uncalibrated offline preview. The ring accessory's fixture placement beside the arm is intentional.

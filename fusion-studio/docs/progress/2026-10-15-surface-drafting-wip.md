# Surface-derived panels — unreleased 0.18.0 development

Historical foundation checkpoint. Continued UI/reference/grading implementation is recorded in `2026-10-15-surface-drafting.md`; its release status supersedes this checkpoint.

Current delivered application remains **0.17.0**. Source development now targets **0.18.0** and a separate `release-v0.18.0` directory, preserving the verified 0.17.0 release. No 0.18.0 package or end-user drafting command has been delivered yet. The full unified-excellence goal remains active.

## Implemented source foundation

`Engine.run({action:'flattenPanels',params:{surfacePanels}})` uses the persistent installed-Blender worker with a typed numeric payload. `electron/surface-panels.cjs` validates positions, triangle/panel ownership, grain coordinates, method/iteration limits and an optional fitting body/clearance. Panel vertices must remain split at panel boundaries. The worker returns a separate JSON output, not an exported mesh that could reorder source identities. Its result validates physical area, finite coordinates, panel counts, UV splits and triangle flips. Logs contain small summaries rather than complete private geometry.

`scripts/surface_panels.py` optionally shrinkwraps the temporary design surface to the supplied body with an explicit clearance, then runs the supported installed UV method. Minimum Stretch uses 100 iterations and flip prevention. Each independent panel is scaled to preserve its 3D surface area in square metres, and a planar rotation aligns the result with the original grain coordinates. Original source/viewport data and installations are untouched. The helper is included in the next package's files/unpack configuration.

`deriveSurfacePattern` in `src/surface-patterns.js` reconstructs editable pattern-schema-2 documents from the UV result. It preserves exact polyline boundaries when budgets allow. Larger boundaries use adaptive cubic fitting with a convex-hull bound over every source polyline interval. Bezier pieces are subdivided exactly to propagate matching cuts through partial sewing. Stable segment/seam remaps, pins, holes, internal-line anchors and dart references are retained. Dart dimensions require remeasurement. Bounds remain 128 vertices per ring and 128 seams; impossible tolerances reject with an actionable working-copy message rather than silently changing shape. Internal lines simplify within the chosen tolerance while preserving authored anchors.

The native bind/place API can map a reconstructed flat mesh through its retained UV reference triangles to the prepared 3D design. A new explicit `executionBudget:'offline'` on `drapeGarment` permits up to 120 seconds; the ordinary timeout remains unchanged. Invalid/unlimited budgets reject, and timeout/cancel still waits for actual helper exit. The UI has not yet selected or displayed this new budget.

## Verified evidence

- **144 JavaScript tests pass**, including the new boundary/metadata/timeout gates. The native core is unchanged from the 11-test 0.17.0 baseline.
- A real persistent Blender job flattens a 20,480-triangle / 10,449-vertex curved panel, retaining physical area 1.015637464 m², no UV splits/flips, coordinate error below 2.39e-8 m and zero measured UV difference on repeat. A 9,282-triangle holed panel retains 0.341600025 m². Degenerate geometry, cancellation and next-job recovery pass.
- Detailed pure reconstruction tests retain curved/holed panels, partial seam parameter correspondence, internal anchors, darts and pins. Input/reference arrays remain independent; missing identities and impossible budgets reject. Dense sampling independently checks the claimed whole-interval cubic approximation bound.
- The private measured-shirt source from the prior experiments was projected with 8 mm clearance and flattened using Minimum Stretch. Exact boundaries retain six panels, 82 sewing references and physical flat rest dimensions. Remeshing at 25 mm gives **4,246 triangles / 2,368 vertices**, minimum angle **25.819°**. The prototype's final front render was inspected and shows a fitted short sleeve without the earlier visible shoulder breakthrough in that view.
- The actual new Engine output and authoritative reconstruction/native APIs were then used together, with 0.1 µm canonical simulation inputs. The 160-step × 10-iteration drape reports maximum local absolute strain **32.378%**, mean **2.069%**, mean seam gap **0.01212 mm**, zero body/cloth face crossings, zero inside vertices, zero clearance violations and zero pin drift. It passes the current preview numeric gates. It took **31.20 seconds under concurrent testing**, confirming that this case exceeds the ordinary 30-second budget. This is one fixture and does not establish production fabric calibration or arbitrary-pose/layer robustness.

Private proof files remain under ignored `test-output/measured-shirt-probe/`:

- `draft-probe.mjs` / `draft-result.json`: original six-panel measured source and source mesh.
- `flatten-engine-result.json`: actual typed worker output.
- `authoritative-fit.mjs` / `authoritative-fit-result.json`: current modules and native helper used together, numeric pass recorded.
- `uv-poly-minimum-result.json`: earlier equivalent private prototype.
- `render-1792129912047/jobs/render-2026-10-16T05-51-55-695Z-d3d7ef/Minimum-stretch shirt result.png`: inspected prototype render.

These artifacts contain private user-derived geometry and must not enter packages. The private source generator is not yet a reproducible shipped feature; promoting it to owned parameterized source is required before delivery.

## Required next implementation

1. Promote the original measured source generator into a pure, cancellable preparation worker. Extract neutral body data and bind-space shoulder/elbow/neck anchors from a private skeleton copy; allow reviewed joint mapping. Do not use the current inverse-world skin matrix for bind anchors under root transforms: convert original inverse-bind positions using the constant bind matrix inverse, then mesh-to-root coordinates.
2. Add one integrated surface-drafting action with a reviewable working-copy path. Preserve the original garment. Connect typed flattening, document reconstruction, reference mapping and offline draping through one scene-evaluation ticket and transaction, keeping the last valid garment visible. Cancel must terminate preparation, Blender and native stages without starting subsequent work.
3. Store versioned UV/3D reference data and body-surface attachments with identity/connectivity guards. Use these references for source placement after panel edits; retain actual flat panels as the rest shape. Add measured reference profiles and explicit grading behavior so body/pose changes re-evaluate through the same graph, rather than rebuilding over authored edits.
4. Preserve holes, partial sewing, internal lines and darts through the UI/project path; enforce current budgets and visible compatibility reports. Surface-derived placement controls must have meaningful behavior or be explicitly unavailable with a working-copy alternative.
5. Verify panel editing, body morphing, posing, source accessory stacks, undo, save/reopen, rendering, malformed inputs, stale replies, stage cancellation and original-file preservation together. Re-run a detailed integrated fit/render gate using the public source generator, not only private probe files. Add helper runtime checks to package auditing before packaging 0.18.0.

Remaining full-goal work includes production fit/material calibration, robust layered/animated cloth and fine-mesh performance, deeper modeling/sculpt/UV, rendering/sequence controls, broader character authoring and interchange. Passing this single preview fixture is not whole-goal completion.

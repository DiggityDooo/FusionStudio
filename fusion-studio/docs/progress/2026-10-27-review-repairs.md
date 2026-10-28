# October 27 review repairs

The preceding review found that the new working tree did not build despite a passing default unit command. Repairs below extend the existing implementation without changing the application version (0.1.0), project schema (2), vendor installations, source asset libraries or earlier packages. The large pre-existing uncommitted implementation remains in place.

## Implemented repairs

| Problem | Repair | Evidence |
| --- | --- | --- |
| Motion capture and spatial acceleration both used `bvh.js` | Spatial acceleration remains in `src/bvh.js`; bounded motion-capture parsing/import is in `src/mocap-bvh.js`. The animation UI imports the explicit motion module. | Production build; motion and spatial BVH suites |
| Motion import could replace existing animation | Resample into the current timeline's rate/start frame and merge the new bone tracks while retaining existing keyed objects and interpolation. Preserve the original BVH declaration/text and explicit length-unit choice. | Independent channel-order/offset/rate tests; real UI import and undo/redo |
| Binding lost parent transforms and object identity | Prepare replacement skin data before mutation; retain UUID, descendants, animation targets, geometry attributes, parent order and authored transforms. Preserve manual affine matrices for sheared external placement. Reject invalid/singular binds before detaching the source. | `tests/bind-preservation.test.mjs`; real nested binding, history, reopen and export |
| Parent-to-descendant operation formed a cycle | Validate scene ownership and ancestry before mutation. Preserve full world matrices; grouping deduplicates objects and retains existing parent/child relationships. | `tests/scene-foundation.test.mjs` |
| Grow/Shrink used a nonexistent selection property and numeric neighbors | Use the real `ComponentEditor.ids` set and mesh connectivity for vertex/edge/face selection. Refresh actual markers; soft weights use world distances. | Permuted-index/disconnected-topology tests and desktop component selection |
| Collections, units and snap settings were memory-only | Version scene-tool metadata in the Fusion scene; restore settings through history/project loading and reset them for a new scene. Validate malformed metadata before replacing the live scene. | Serialization/history tests; actual desktop save/reopen |
| Material graph ignored every node and returned a fixed gradient | Evaluate a bounded original CPU subset: colors/constants, gradients, coherent seeded noise, checkers, blend modes, levels and outputs. Respect links, parameters and straight-alpha compositing; reject invalid parameters, missing links, duplicate ports, cycles and unsupported operations. | Independent numerical blend/levels/color checks, seed changes, malformed graph tests |
| New unit suites were silently missing from `npm test` | `scripts/test-core.cjs` discovers all `*.test.mjs` and `*.test.cjs` unit suites with bounded concurrency. Desktop drivers remain explicit. | Full discovered-suite run; BVH regression now included |

## Validation

- The normal Vite production build succeeds. Its existing large-bundle warning remains a performance/packaging concern; it is not treated as an error or hidden.
- The original default command passed 876 tests while missing the broken motion-capture integration. The final discovered-suite run passes **986/986 tests**, with no failures, cancellations or skipped tests. This includes independently referenced geometry, deformation and collision checks on the existing detailed local Genesis fixtures, plus the new repairs.
- `node tests/review-regressions-ui.cjs` passes against the normal rebuilt app in an isolated profile: actual BVH file selection and unit choice, existing animation retention, import undo/redo, topological selection, nested binding, binding undo/redo, project save/reopen, collection/unit/snap persistence and GLB serialization. The toolbar reflects restored snap state and its first click disables snapping correctly. No private asset is used in this desktop fixture.
- Additional focused tests verify the source channel rotation order against independent quaternion references, invalid imports leaving the destination untouched, invalid project settings retaining the prior live scene, and affine world-transform preservation.
- Syntax checks, changed-file whitespace checks and the feature-ledger structural audit pass.

Local evidence is kept under ignored `test-output/code-review/` and `test-output/review-ui-1793148602275/`. Reproduce with `npm test` and `npm run test:review-regressions`. The desktop command rebuilds before running.

## Original-installation verification

The preservation scan reports **34,837 recorded files / 34,857 current files**, **zero changed** and **zero missing** baseline files. All **15 bounded SHA-256 checks match**. The strict aggregate remains false because the current installation has 20 additional paths. Ten were already in the previous report; the ten additionally observed DAZ/Octane files have creation timestamps from October 23, before this repair session. The baseline was not rewritten to remove those differences.

This is a size/path/modification-time comparison across the baseline plus the stated bounded hash sample, not a cryptographic audit of every installed file. The refreshed generated report is `research/preservation-verification.json`; the prior report and session comparison are retained in ignored `test-output/code-review/`.

## Limits and next work

- These results qualify the repaired paths, not every newly added tool or the full application roadmap. No new packaged release or GitHub publication is claimed by this checkpoint.
- Six overclaimed ledger entries are partial: geometric snapping/custom pivots, normal/gimbal orientations, the complete selection suite, comprehensive unit-aware management, native CAD interchange, and full node-graph texture authoring.
- The ledger contains 860 unique entries (411 done labels / 449 partial labels). The reference parser counts 863 occurrences because three labels repeat. Neither number establishes production readiness; evidence must match each feature's actual scope.
- Vertex/edge/face/surface snap modes still fall back to an increment. Normal/gimbal orientations still use local handles. Lasso/paint/loop/ring are not all complete selection implementations.
- The graph evaluator is a CPU preview subset with 1–1024-pixel output and a four-million-node/pixel work budget. A visual graph editor, complete material authoring, external shader formats and production texture baking are not established by it.
- ZBrush `.ZPR` editing, independently verified general native roundtrips, broader portable dependency capture, production garment quality and portrait/private-library acceptance remain unfinished. Preserve originals and explicit compatibility outcomes while continuing those requirements.

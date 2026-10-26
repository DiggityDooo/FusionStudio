# Reusable components: validated interchange and tangent export

Status: implemented in 0.19.0 source; unreleased. This is the first adoption checkpoint from the reusable-components guide, not completion of that guide or the unified-excellence goal.

## User-visible behavior

- GLB/glTF imports show the official Khronos validation report, field-level conversion limits and extension requirements before a working mesh can be added. Invalid files and unverified required extensions are blocked. Ordinary external buffers/images must remain inside the selected model folder.
- Source/resource hashes are checked again after review. The Blender importer reads a private copied snapshot; changed files are rejected and originals remain untouched.
- F3 → **Inspect scene glTF / GLB compatibility** checks the current exchange projection without editing the scene or adding history. It saves a JSON report artifact and rejects stale/cancelled requests.
- GLB UI exports now save the validated Fusion exporter bytes directly, avoiding a Blender conversion pass and preserving the produced attributes/animation. Every Blender-produced GLB is also validated before its engine job can complete. Reports remain beside artifacts; warnings are visible.
- Export Scene offers **Generate missing MikkTSpace tangents for GLB normal maps**. It is opt-in, preserves authored tangents, processes temporary exchange geometry in a worker, retains all corner/morph/weight/material/source correspondence and saves a generation report. Unsupported UV sets/transforms and invalid UVs stop generation with an actionable message.
- A project-loading repair retains image-source UUIDs through load/undo/insertion. Image pixels/settings already survived; identifiers now remain stable too.

## Evidence

`npm test`: **215/215 pass** after adding the validator/tangent and image identity fixtures. The final normal-map UV-transform guard is additionally covered by its focused three-test suite. `npm run build` passes with the existing bundle-size advisory.

Desktop `gltf-validation-ui.cjs` passes actual bad-file/review-cancel/changed-resource handling, a detailed 18,432-triangle import, one history entry, undo/redo, project reopening, F3 inspection and direct validated export. The private 70,296-triangle Genesis/garment scene is inspected with byte-equivalent serialized state/history/frame retained. Its report has zero specification errors, seven `NODE_SKINNED_MESH_NON_ROOT` warnings and nine unused-UV information messages; these are not suppressed. Cancellation and stale inspection recovery pass.

Desktop `derived-tangents-ui.cjs` passes real worker termination on cancellation/staleness, the actual export checkbox, a 32,768-triangle normal-map export retaining `TANGENT`, zero validator errors, exact source/history/frame preservation, image-aware project reopening and a Cycles CPU render from the exported asset. An original numeric 18,432-triangle torus-knot fixture verifies all corner, UV, skin-weight, source-ID, morph and material mappings; analytic mirrored-UV planes verify tangent handedness. This is not cross-renderer pixel-parity evidence.

The disposable ASAR harness verifies that the unpacked validator worker resolves its helpers, package, `LICENSE` and `NOTICES` and validates 18,432 triangles inside Electron. This is a packaging-path check, not a full Fusion release build. No release was overwritten or published.

Private reports:

- `test-output/gltf-validation-ui-results.json`
- `test-output/derived-tangents-ui-results.json`
- `test-output/gltf-packaging-results.json`
- `test-output/gltf-validation-performance.json`
- `test-output/reusable-components-final-regression.txt`

## Measured limits

One cold-worker sweep on this PC, with fixture generation/base64 conversion outside timing:

| Triangles | GLB bytes | Worker inspection | End to end |
| ---: | ---: | ---: | ---: |
| 2,048 | 60,432 | 31.65 ms | 115.08 ms |
| 18,432 | 523,288 | 53.94 ms | 130.29 ms |
| 73,728 | 2,077,728 | 88.91 ms | 170.40 ms |
| 204,800 | 5,755,944 | 140.82 ms | 232.44 ms |

The tangent desktop run takes 1,005 ms from export click to report; worker calculation takes 161.6 ms. Timing is fixture-specific and does not establish interactive large-scene response. Limits and licensing/build boundaries are in the [validator](../dependency-evaluations/gltf-validator.md) and [tangent](../dependency-evaluations/mikktspace.md) adoption records.

## Remaining work

Meshoptimizer evaluated-display artifacts and xatlas `Create UV Set` are the next researched adapters; neither has been installed or implemented by this checkpoint. glTF Transform is also still a candidate, not a newly claimed dependency. MikkTSpace currently supports export-only generation on UV0 without texture transforms; viewport tangents, morph tangent deltas and cross-renderer appearance parity remain open. Native CC/MD formats, production cloth, broader modeling tools, document-resource persistence and the wider roadmap remain unfinished.

The existing garment refinement/finished-shell audit edits present at the start of this adoption were preserved. This checkpoint did not rebuild or edit the native module, alter vendor installations or overwrite prior releases. The final installation scan records 34,837 baseline files and 34,847 current files: zero changed, zero missing, and all 15 sampled SHA-256 checks match. Its strict aggregate flag is false for **ten extra DAZ files** (3ds Max/Maya bridge documentation/resources and Fluent/Render Assistant plugin DLLs), compared with three extra paths in the earlier scan. Their provenance is unconfirmed; none was removed and the baseline was not changed. Exact paths are in `research/preservation-verification.json`. Public distribution still requires the existing complete dependency/runtime-notice review, including the bundled MikkTSpace WASM build provenance.

# October 28 — Usable character LODs and export integrity

Follow-up: [retained-source editing and queue repair](2026-10-28-lod-source-workflow-and-queue.md) repairs the dense 25% reduction limit measured below and adds non-destructive regeneration. Measurements in this document describe the earlier checkpoint.

The user requested a GitHub update containing all current changes. This checkpoint adds source, tests and evidence for the character LOD work following the previous update. It retains the complete modeling, character, garment and interchange goal. App version 0.1.0 and project schema 2 are unchanged; no installer or archived release is replaced. Some local evidence timestamps fall on October 29 UTC, still October 28 in the development timezone.

## Implemented behavior

- Character tools now create actual scene LOD sets with independently selectable levels and an explicit return to the retained source. This replaces the prototype that discarded its generated meshes and saved only counts. Version-2 LOD metadata records source identity, levels, remaps, input context and diagnostics; old count-only records remain readable.
- An original endpoint-QEM reducer preserves UV/normal chart borders and material boundaries, rejects invalid local collapses, limits normal changes and bounds accumulated cluster displacement. Attribute remapping retains source vertex identities, skin indices/weights, relative or absolute morphs, normalized/integer attributes, material ranges and interleaved input. The editable source topology stays intact.
- Generation uses an isolated evaluated source and a cancellable Web Worker. Project/object IDs, revisions and hashes guard replies. Failed, cancelled, stale, malformed or over-budget results do not install partial geometry/history. The last valid scene remains available. Compatibility review requires an explicit working copy.
- Isolated materials, texture sources and skeleton state prevent preview/evaluation work from changing original pose, texture counters or image identities. Unsupported custom shaders require an evaluated material working copy. Protected analytic eye surfaces and bound strand hair stay at full resolution.
- A completed generation or preview change uses shared history. Project reload retains derived geometry, active level and source recipe. Visible derived meshes contribute their character material sidecar to Cycles jobs even though they no longer contain the original generator program.
- Local clips retain independent target IDs. LOD wrappers preserve ancestor transform frames and keep the character root animatable. Hidden-source animation tracks are omitted from visible export scope without discarding surviving visible tracks. Missing or ambiguous targets produce actionable failures.
- Fixed affine parent transforms are factored into two TRS frames for GLB exchange, retaining shear, reflection and singular scale without writing an invalid sheared glTF node matrix. Animation targeting a fixed matrix rejects explicitly. The original project frame is unchanged. This follows the decomposable-transform constraint in the [glTF specification](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc).
- Project recovery retains authored cast/receive-shadow flags and shared interleaved buffer identities. Plain Mesh objects no longer receive object-level bounds intended for classes that compute those bounds.
- DSON import accepts the observed legacy formula-stage alias `mult` as `multiply` without rewriting source formulas. Verified same-file unit-scale inputs are bound through validated aliases; nonunit scale outputs remain explicitly unsupported. Formal formula stages and addressing semantics are described by the [DSON formula specification](https://docs.daz3d.com/public/dson_spec/object_definitions/formula/start) and [asset addressing specification](https://docs.daz3d.com/public/dson_spec/format_description/asset_addressing/start). This repair does not establish complete DAZ controller/scale parity.

## Direct evidence

- Build and **1,088/1,088** discovered unit tests pass, with zero failures, skips or cancellations (97.05 seconds). Log: `test-output/code-review/lod-final-suite.log`. The existing large-bundle warning remains (main bundle approximately 2.30 MB, 638 KB gzip).
- `tests/lod-reduction.test.mjs` checks a 98,304-triangle detailed torus, topology/material/UV preservation, independent remaps, skin/morph reference positions, source immutability, history/reload, worker failures/cancellation/stale replies, forged diagnostics and root motion under nonuniform parents.
- `tests/affine-frames.test.mjs` compares reconstruction with independent matrix references, including reflection and singular cases. Its actual `Editor.glb` test exports a 49,152-triangle animated mesh through rotated, nonuniform and sheared frames, passes the installed glTF validator with zero errors, reloads it, and compares world-space motion/vertices at three times. A hidden actor and a local LOD clip exercise visible-animation filtering.
- Final public desktop workflow: `test-output/character-lods-1793250301998/results.json`. A 19,158-vertex adult base with custom shape influence 0.4 and contrapposto creates body LODs from 26,756 to 6,690 triangles. Sampled corresponding posed vertices have zero measured difference. Whole-character levels contain 69,212 / 46,318 / 39,592 stored triangles because protected/other surfaces remain. The 25% body target rounds to 6,689 but stops at 6,690 and reports that limit. Compatibility cancellation, real worker generation, preview, undo/redo, save/reopen, GLB delivery and a CPU Cycles render pass. The render restores eleven character material records and one bump texture. Generation took 7.351 seconds during concurrent validation; it is asynchronous, not a 100 ms preview claim.
- Final private fixtures: `test-output/character-lods-private-1793250380833/results.json`. Installed Genesis 8 female and male bases are explicitly shoulder-posed and required to show measurable skin displacement. Female levels contain 32,736 / 18,098 / 14,522 triangles; male levels contain 32,392 / 17,958 / 14,598. All sixteen skinned parts per fixture survive; sampled mapped posed errors are zero. Save/reopen and actual GLB delivery pass. Original DUF hashes/timestamps and conversion GLB hashes remain unchanged. This compares Fusion's evaluated rigs, not an independent DAZ-render/skinning reference.
- Existing animation/sculpt desktop regression passes against the final build: `test-output/animation-sculpt-1793250455334`. The earlier BMW CPU/OptiX comparisons are documented in the preceding checkpoint; they were not rerun for this source update.
- Original-installation scan at `2026-10-29T05:07:22Z`: 34,837 baseline / 34,857 current paths, zero changed or missing baseline files, all fifteen bounded hashes matching. The same twenty pre-existing additions remain, with zero newly added paths versus the prior report. Strict aggregate remains false because additions count as differences. Whole-installation coverage is metadata; only the listed files are hashed.

Generated jobs, screenshots, private fixtures and performance profiles remain in ignored local `test-output/`. No paid assets, decompiler pseudocode or vendor files are added to the publication payload.

## Measured limits

JavaScript CPU kernel measurements from `test-output/code-review/lod-performance.json`, using torus UV charts and bounded endpoint reduction:

| Input triangles | Requested fraction | Output triangles | Elapsed | Outcome |
| ---: | ---: | ---: | ---: | --- |
| 49,152 | 50% | 24,576 | 1.73 s | Completed |
| 49,152 | 25% | 12,288 | 2.46 s | Completed |
| 98,304 | 50% | 49,152 | 3.67 s | Completed |
| 98,304 | 25% | 24,576 | 6.24 s | Completed |
| 196,608 | 50% | 98,304 | 9.04 s | Completed |
| 196,608 | 25% | — | 14.67 s | Candidate budget exceeded; use a smaller part |

These are shared-load CPU observations, not a guaranteed character performance curve. The benchmark records a limited case instead of losing the whole report when a candidate budget is exceeded. Runtime limits are 300,000 input vertices, 200,000 triangles and two million queued candidates per part, plus bounded attributes, parts, levels and total output estimates. Exceeding a budget produces a diagnostic and preserves the original.

Endpoint clusters are limited to 2% of the referenced geometry's bounding diagonal. This is a conservative correspondence/displacement bound, not a Hausdorff, global self-intersection, cloth-collision or arbitrary-pose quality certificate. Material/UV borders and protected surfaces can prevent the requested ratio. No automatic skeleton/joint-palette reduction or general strand-groom reduction is included.

## Remaining acceptance

LOD remains partial in the feature ledger. Full production review still needs a larger pose/shape/accessory matrix, deformation-sensitive reduction and visual error metrics, handling of more native-controller families, source-first regeneration workflows and broader performance work. The checked full-body render is intact but still has coarse body/face shading; it does not meet the professional realism gate. Complete creator, garment/contact, sculpt/paint/node, native-format and release-wide acceptance requirements remain active.

## Reproduction

```text
npm run build
npm test
npm run test:character-lods
npm run test:character-lods-private
npm run test:character-lods-performance
node tests/animation-sculpt-ui.cjs
```

The private command requires locally installed compatible bases; it never bundles them. Native rendering requires the configured local Blender worker. No dependencies were installed for this checkpoint.

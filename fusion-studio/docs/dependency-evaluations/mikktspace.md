# MikkTSpace export adoption

Date: 2026-10-18. Uses the existing `three@0.186.1` bundle `examples/jsm/libs/mikktspace.module.js`, SHA-256 `f415ebd2f7bbe4ac06439be40d2ca4a11bb17123009bb33582176b1b21a14dac`. No extra npm package or native module was added. This differs from the research guide's proposed native adapter: the existing JS/WASM module is reused in a disposable browser worker, reducing build and dependency work.

Primary API: [Three.js BufferGeometryUtils MikkTSpace documentation](https://threejs.org/docs/pages/module-BufferGeometryUtils.html). Upstream implementation and licensing: [mikktspace-wasm](https://github.com/donmccurdy/mikktspace-wasm), [gltf-rs/mikktspace](https://github.com/gltf-rs/mikktspace), [Morten Mikkelsen's original implementation](https://github.com/mmikk/MikkTSpace). The wrapper is MIT; the Rust implementation offers MIT/Apache-2.0; the original C reference has a zlib-style notice. The complete build provenance/transitive Rust/WASM runtime inventory of Three's bundled module still needs review before public distribution. The modern upstream Cargo manifest must not be assumed to match this pinned prebuilt module. Existing package-release notice gates remain open.

## Implemented boundary

Export Scene has an opt-in **Generate missing MikkTSpace tangents for GLB normal maps** checkbox. Only meshes with a normal map and no authored tangent attribute are processed. Authored tangents are retained. The generated tangent `w` sign follows the glTF convention documented by Three.js. The code operates on the temporary exchange scene, expands indexed corners there and copies every vertex/morph attribute consistently. It does not replace project geometry, skin/morph/source maps, UV buffers, garment finishing caches or history.

The worker validates finite Float32 positions/normals/UV0, unit normals, noncollapsed UV triangles and returned orthonormal tangent frames. Limits: 200,000 triangles per mesh, 400,000 generated triangles per scene, 96 MiB estimated expanded attribute data per mesh, 30-second worker timeout. Cancel terminates the browser worker. Scene evaluation tickets reject stale exports; worker request IDs reject foreign replies. The CSP permits WASM compilation with `wasm-unsafe-eval`, without enabling JavaScript `unsafe-eval`.

GLB UI exports now save the validated Three.js exchange bytes directly. This avoids a Blender round-trip that could discard tangents or alter mesh/animation data. The older Blender `glb` job route remains available for existing engine operations. The saved artifact has an official validation report and, when requested, a bounded `tangent-generation.json` with generated mesh counts and timings.

## Evidence and limits

- Numeric 18,432-triangle torus-knot fixture preserves every source/corner UV, material group, source ID, skin weight and morph value. Analytic mirrored-UV planes verify tangent handedness; invalid replies and inputs fail before source changes.
- Desktop 32,768-triangle normal-map fixture uses the actual checkbox and real WASM worker. Cancellation/stale jobs terminate their workers; the successful direct GLB retains `TANGENT` and its normal texture, with zero validator errors. Source serialization/history/frame are unchanged. Reload preserves image identity, pixels, settings and the original indexed mesh. A CPU Cycles render completes from the exported asset.
- The measured local run takes about 1.0 second from export click to report; MikkTSpace worker calculation is about 162 ms. This is one fixture, including UI/serialization/export/validation work; no general interactive guarantee is made.
- The workflow exposed an existing ObjectLoader image-source UUID regeneration issue. `ProjectLoader` retains those document identities for load/undo/insertion; a repeated image/pixel/texture-setting fixture covers the repair.
- Tangents are export-only. Viewport tangent previews, morph tangent deltas, transformed normal-map UV sets, and cross-renderer pixel parity are not established. Blender can reconstruct its own tangent basis on render import. The render test establishes usable output, not numerical tangent parity with Blender.

Private evidence: `test-output/derived-tangents-ui-results.json` and `test-output/derived-tangents-ui.png`. Test content is generated originally; no paid assets are distributed.

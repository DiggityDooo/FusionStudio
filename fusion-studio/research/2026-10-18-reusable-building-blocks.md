# Fusion Studio reusable building blocks — research instructions

**Prepared:** 2026-10-18  
**Status:** research only. This document authorizes no dependency, source, binary, asset, or vendor-install change by itself.  
**Product boundary:** Fusion Studio remains one original Electron/Three.js application with a Rust native core and a persistent, private Blender worker. Keep all installed applications and user libraries read-only. Do not copy code, binaries, assets, shaders, or private formats from Blender, DAZ Studio, Character Creator, or Marvelous Designer into Fusion.

**Implementation follow-up:** After the five-hour research window, the user authorized adoption. The first source checkpoint implements Khronos glTF validation and an export-only MikkTSpace adapter reusing the pinned Three.js JS/WASM bundle. It also adds direct validated GLB export and preserves project image identity. Meshoptimizer, xatlas and glTF Transform remain researched candidates. See [implementation evidence and limits](../docs/progress/2026-10-18-reusable-interchange.md); the instructions below remain the broader plan and do not imply all listed components have shipped.

## Why this list exists

Fusion already has a useful editable scene, retained-source modifier stack, component editing, DSON subset, rig/weight/morph workflow, pattern authoring, XPBD cloth, native contact checks, and Blender-backed rendering. The fastest path to a fuller professional toolset is to add well-bounded, permissively licensed components around those data contracts rather than recreate mature low-level geometry, UV, rendering, and interchange machinery.

Every adoption must preserve the current rules:

1. The Fusion document is authoritative. A library result is a revision-checked patch, never a replacement scene.
2. The source mesh, stable object IDs, material groups, UV seams, morph maps, skin weights, pattern links, and garment provenance must survive or produce a specific compatibility report.
3. Each mutation is one transaction with cancellation, stale-result rejection, undo/redo, save/reload, and a working-copy route for fidelity-changing operations.
4. A library’s advertised support does not prove Fusion support. Add a focused fixture and record demonstrated behavior before exposing an operator.
5. Record version, source URL, license text, checksum, build flags, public API boundary, and third-party notices before a release package is built.

## Adoption order

| Priority | Candidate | What it supplies | Why it is a good fit | Do not use it for |
| --- | --- | --- | --- | --- |
| 1 | meshoptimizer | Vertex-cache/overdraw/fetch optimization, LOD simplification, meshlets, glTF mesh compression | Small MIT library with a browser-friendly JS/WASM route and C/C++ source; it improves display/export performance without redefining editable topology | Authoring topology, UV seam decisions, cloth simulation, or a lossless project format |
| 1 | MikkTSpace | Consistent tangent-space generation | Small zlib-licensed reference implementation; a direct way to make normal maps behave consistently across Fusion previews, Blender render jobs, and exported GLB | Rebuilding source normals or silently changing authored split normals |
| 1 | xatlas | Automatic chart generation, UV parametrization, packing, and original-vertex cross references | MIT library whose output explicitly identifies each generated vertex’s input vertex; this matches Fusion’s attribute-remap contract | Preserving hand-authored UVs automatically; the tool must require a duplicate/replace choice |
| 1 | glTF Transform + glTF Validator | Standards-aware GLB/glTF read/write transforms and validation reports | MIT JavaScript SDK plus Khronos validator; fits Fusion's Electron/Node boundary and makes interchange results inspectable | The editable project format, a generic import repair tool, or silent lossy optimization |
| 1 | Blender worker’s existing UV/bake/modifier facilities | A bridge route for operations already supported by the installed Blender worker | No new native dependency and useful for high-value short-term coverage | A hidden permanent source of truth or an assumption of exact Blender project fidelity |
| 2 | Manifold | Reliable manifold solid booleans, extrude/revolve, slicing | Apache-2.0 core designed around manifold geometry; useful for a high-confidence hard-surface Boolean operator | Arbitrary damaged scan meshes, character bodies with open boundaries, or preserving sculpt/morph/skin data without a working-copy preflight |
| 2 | OpenSubdiv | Catmull-Clark/Loop evaluation and adaptive subdivision | Apache-2.0, production-oriented subdivision evaluation; stronger than an ad hoc smoothing modifier | Destructive topology subdivision or claiming Blender-equivalent crease behavior before test parity is measured |
| 2 | Embree | Fast CPU ray intersection/occlusion queries | Apache-2.0. Good for baking, picking, body/garment inspection, and offline geometric diagnostics once native binary policy is ready | GPU rendering, deforming-mesh caches without invalidation, or a substitute for cloth collision response |
| 2 | Assimp | Broad ordinary interchange import/export | BSD-3-Clause. It can accelerate non-native format coverage behind Fusion’s fidelity preflight | Treating any imported FBX/DAE/3DS file as fully faithful or loading proprietary DAZ/CC/MD scenes |
| 3 | OpenUSD | Scene composition, variants, layers, instancing and USD interchange | Apache-2.0 and strategically valuable for studio interchange | The primary editable document in the first implementation; it is a large dependency and requires a separate compatibility layer |
| 3 | MaterialX | Open material graph interchange and shader generation | Apache-2.0, with explicit standard-surface and target-shader concepts; an appropriate future interchange layer for authored materials | Replacing the editable Fusion material model or importing arbitrary graphs without validation |
| 3 | Geometry Central | Surface-mesh data structures, intrinsic geometry, geodesics and mesh-processing algorithms | MIT-licensed C++ library suitable for later mesh analysis, selection and retopology support | A replacement for Fusion’s own stable IDs, attribute domains, undo system, or Rust topology kernel |
| 3 | OpenTimelineIO | Editorial cut/timeline interchange and a dependency-light time model | Apache-2.0. Useful once Fusion's animation tools include shots, clips, and render handoff | Replacing Fusion actions, curves, constraints, or skeletal animation semantics |
| 3 | OpenImageIO + OpenEXR | HDR/EXR image I/O, texture inspection, color-oriented asset paths | Both are established open-source image building blocks suitable for a later texture/baking pipeline | Replacing the renderer or making color-management claims without an OCIO plan and reference renders |
| 3 | KTX-Software + Open Image Denoise | GPU-delivery texture containers and optional offline denoising | KTX tooling is largely Apache-2.0 but has a detailed mixed-license inventory; OIDN is Apache-2.0 | Treating compressed delivery textures as editable masters, or silently denoising final renders |
| Evaluate only | Rapier | Deterministic rigid body, collider and scene queries | Rust-native and broadly useful for props, ragdolls, collision proxies and tools | Replacing the established XPBD garment solver; rigid-body physics is not a cloth solver |

The priority is deliberately based on integration risk, not feature glamour. Start with utility layers that have a narrow input/output contract. Use the native Boolean, subdivision, USD, and image stacks only after their build, licensing, and preservation gates are proven.

## 1. meshoptimizer: first performance drop-in

**Source and license:** [official repository](https://github.com/zeux/meshoptimizer), MIT. The project documents vertex-cache, overdraw, vertex-fetch optimization, simplification, meshlets, codecs, and a JS/WASM decoder. Preserve the requested attribution in `docs/DEPENDENCIES.md` and package notices.

### Integration instructions

1. Add a `renderOptimization` derived-artifact service. It accepts immutable evaluated geometry plus source revision/hash, never the editable source itself.
2. Start with `optimizeVertexCache`, `optimizeOverdraw`, and `optimizeVertexFetch` only after the final evaluated index and attribute streams are available. Cache the optimized draw order by evaluated geometry hash.
3. Preserve a render-to-source triangle map. Selection, weight paint, morph editing, garment diagnostics, and undo must continue to use the canonical source/evaluated topology rather than reordered draw buffers.
4. Add simplification as an explicit **Generate LOD** operator. Inputs: desired triangle ratio/error, locked boundaries, locked UV seams, locked material boundaries, and a morph/skin/garment compatibility policy. Output: a named derived LOD with its own remap and maximum measured error.
5. Export `EXT_meshopt_compression` only as an optional delivery artifact; keep standard uncompressed GLB export and mark compressed-only output as requiring compatible consumers.
6. Add meshlets only for viewport culling after a WebGPU/WebGL capability check. They are a renderer data structure, not a new mesh format.

### Required proof

- A detailed character with UV seams, four-slot weights, sparse morphs, and material splits produces unchanged editing data after draw optimization.
- A garment retains seam and source maps when an optimized display artifact is refreshed.
- LOD generation blocks or routes to a working copy when fidelity limits are exceeded.
- Measure viewport frame time, exported file size, GPU memory, triangle count, error, and remap completeness at three mesh sizes.

## 2. MikkTSpace: tangent consistency

**Source and license:** [official repository](https://github.com/mmikk/MikkTSpace), zlib license.

### Integration instructions

1. Implement `mesh.generateTangents` in the native geometry boundary. Supply positions, normals, UV0, triangle index stream, and each intentional normal/UV split.
2. Produce a tangent `vec4` attribute with the handedness in `w`; retain existing authored tangents until the user explicitly regenerates them.
3. Run tangent generation after evaluated modifiers, UV operations, and topology changes that affect normals or UVs. Store it as derived data keyed by geometry revision.
4. Send the same tangent basis to Three.js preview geometry, the Blender render bridge, and GLB export where the target supports tangents.
5. Report missing UVs, degenerate UV triangles, discontinuities, and any required vertex splits before committing a generated tangent buffer.

### Required proof

- A normal-mapped seam fixture has matching orientation in the viewport and Cycles bridge render.
- Mirrored UV islands have the expected handedness.
- Undo, reload, and GLB round-trip keep generated tangent data and do not mutate source UV seams.

## 3. xatlas: professional automatic UVs

**Source and license:** [official repository](https://github.com/jpcy/xatlas), MIT. Its public output carries an input-vertex `xref`, which makes it practical for Fusion’s source-map discipline.

### Integration instructions

1. Add xatlas through a narrow native adapter, isolated from the renderer. Do not expose the raw library API to UI code.
2. Define `uv.unwrap` properties: chart weights, chart-size and pack limits, texel density, padding, atlas resolution, material-boundary behavior, normal/texture seam behavior, and output policy.
3. First ship **Create UV Set**. It creates `UVMap.001` and a vertex/corner remap without changing existing UVs. Later permit **Replace active UV set** only after a compatibility preflight.
4. Build the adapter output as `positions/index/material face IDs -> output corner positions, UVs, face map, input vertex xref, chart IDs, atlas IDs`. Translate it to Fusion’s explicit attribute remapping model.
5. Reject or explain non-triangular, non-manifold, invalid-index, and degenerate input. Triangulation must record a face lineage table before calling xatlas.
6. Support multiple atlases/UDIM-like tiles as separate named UV sets until the material and texture system has a proper tile contract.
7. Run charts/packing in the geometry worker with revision/hash checks and cooperative cancellation between stages.

### Required proof

- Existing UVs survive `Create UV Set` byte-for-byte.
- UV split vertices retain material, normal, morph, and weight correspondence.
- The atlas contains no overlaps except intentional mirrored/stacked regions explicitly requested by the operator.
- A dense character and garment fixture save/reload, render, and export with both original and generated UV sets.

## 4. Blender worker: immediately useful existing bridge

Fusion already owns a persistent private worker route. Use it to close high-value tool gaps while independent native operators mature.

### Recommended bridge operators

| Operator group | First operations | Fusion-side contract |
| --- | --- | --- |
| Modifier coverage | Mirror, Array, Bevel, Solidify, Subdivision Surface, Weighted Normal, Decimate | Retained source, explicit parameter schema, evaluated-output cache, material/UV/source-face report |
| UV/baking | Smart Project, angle-based/conformal unwrap, Pack Islands, ambient-occlusion/normal/roughness bake | Named UV set/image artifact, source mapping, file provenance, color-space metadata |
| Mesh cleanup | Merge by distance, fill holes, recalculate normals, limited dissolve, triangulate | A preflight report plus explicit remaps; never silently repair an imported character/garment |
| Curves and text | Bezier/NURBS curve conversion, bevel/profile, text-to-mesh | New editable Fusion object plus source conversion report |
| Render outputs | AOVs, transparent background, camera/lens and color settings, image sequences | Immutable render artifacts with the exact saved scene revision and worker version |

### Rules for every bridge addition

1. Add a typed request/response schema and feature capability record before UI wiring.
2. Send only project-scoped copied geometry and material data to the worker.
3. Return source/evaluated topology hashes, source-to-output maps where available, loss reports where unavailable, and Blender build/version evidence.
4. Capture worker cancellation as a normal recoverable result. Never write a partial result into history.
5. Keep Blender as an optional implementation route behind one Fusion operator. The UI must not expose a separate host workflow or require users to switch programs.

## 5. Manifold: reliable hard-surface Boolean and profiles

**Source and license:** [official repository](https://github.com/ManifoldCAD/manifold), Apache-2.0. Confirm the exact native/JS binding and all transitive notices at adoption time.

### Integration instructions

1. Create a `solid.boolean` adapter with only `union`, `difference`, `intersection`, and an optional split operation. Convert a Fusion mesh only when its preflight confirms a closed, oriented, manifold solid.
2. Preserve both input objects as immutable source references inside a Boolean modifier entry. Evaluate the boolean from sources each time; Apply makes a new independent Fusion mesh with a provenance record.
3. Carry face/material provenance through the adapter when it is available. If a result has generated faces without a one-to-one source mapping, assign an explicit generated-material policy and report it.
4. Add source-cage safety rules: characters, sparse morphs, skin weights, garment bindings, cloth cache, and non-manifold/open meshes require **Make working copy** or cancellation.
5. Add primitives, extrude, revolve, and cross-section workflows only after Boolean inputs/outputs and material behavior pass the same topology contract.

### Required proof

- A multi-material watertight CAD fixture produces deterministic union/difference/intersection results.
- Invalid input is rejected before geometry mutation.
- Modifier reorder/enable/disable/Apply, undo/redo, save/reload, and render all work from retained sources.
- A skinned/morphed character test shows the warning and cannot silently destroy source mappings.

## 6. OpenSubdiv: production subdivision rather than a smoothing shortcut

**Source and license:** [official repository](https://github.com/PixarAnimationStudios/OpenSubdiv), Apache-2.0.

### Integration instructions

1. Treat OpenSubdiv as a later native build target. First prototype CPU evaluation in an isolated branch/build folder; only add GPU backends after reproducibility and packaging work.
2. Define a Fusion subdivision modifier with scheme, levels, render levels, boundary interpolation, crease/corner values, and UV interpolation as explicit properties.
3. Keep the control cage editable. Evaluate the subdivided mesh as a cache keyed by control-cage topology, positions, crease data, UV seams, and modifier settings.
4. Preserve a cage-to-limit-surface mapping for selection visualization and sculpt/weight/morph projection. Do not infer editable correspondence from the rendered triangle order.
5. Begin with static topology and documented Catmull-Clark/Loop semantics. Deforming characters should use the same cage and evaluate after shape/skin deformation according to a written stack order.

### Required proof

- Creases, boundaries, seams, material IDs, and UV behavior are demonstrated on fixtures.
- Modifier order is deterministic with existing retained-source stack entries.
- A character and garment render after save/reload has no lost maps or changing cage.
- GPU and CPU output tolerance is measured; report a backend fallback rather than claiming equal results without it.

## 7. Embree: inspection, baking, and robust picks

**Source and license:** [official repository](https://github.com/RenderKit/embree), Apache-2.0.

### Integration instructions

1. Adopt Embree only as a private native query service: `raycast`, `closestPoint`, `occluded`, `sweepCandidate`, and `bakeRays`.
2. Rebuild or refit an acceleration structure only when a keyed evaluated geometry revision changes. Never retain pointers into mutable renderer buffers.
3. Keep current deterministic garment inspection as the acceptance baseline. Embree may accelerate candidate discovery, but the result contract must report the exact tested pairs, tolerance, work budget, and incomplete status.
4. For texture baking, create versioned image artifacts with UV set, cage/ray distances, samples, color-space, renderer/Embree version, and source geometry hashes.

### Required proof

- Ray-pick and closest-point results agree with small analytic fixtures.
- The accelerated garment/body inspection reports the same crossings/gaps as the reference path within stated tolerance.
- Cancellation disposes query state without altering the document.

## 8. Assimp: broaden ordinary interchange carefully

**Source and license:** [official repository](https://github.com/assimp/assimp), BSD-3-Clause.

### Integration instructions

1. Place Assimp behind the importer registry. A format reader must first inspect, list expected supported fields and losses, then let the user import.
2. Start with OBJ, STL, PLY, DAE, and ordinary FBX fixtures. Require test assets whose licenses permit inclusion; do not add user/college/vendor assets to source control or release packages.
3. Map imported hierarchy, meshes, material slots, basic skin/animation fields, and coordinate/unit metadata into Fusion’s versioned document. Save unknown supported metadata in a namespaced extension bag.
4. Label each field exact, compatible, approximate, or omitted in the import result. Native DAZ, CC, and Marvelous project formats remain outside this route unless an independent documented reader is implemented.
5. Use Fusion GLB as an interchange export option, not as the project’s lossless saved document.

### Required proof

- Per-format fixtures round-trip through Fusion with a field-by-field report.
- Unit, coordinate, normal, UV, material, skeleton, animation, and morph losses are visible before mutation.
- Malformed and oversized assets fail safely without partial history entries.

## 9. OpenUSD: staged studio-interchange investment

**Source and license:** [official project](https://openusd.org/), Apache-2.0.

### Integration instructions

1. Do not add OpenUSD until the Fusion v2 document manifest and binary-resource model are complete enough to map objects, layers, variants, materials, skeletons, and animation deliberately.
2. Begin with a read-only USD inspection tool: list layers, prims, payloads/references, variants, time range, and unsupported schemas without resolving arbitrary remote assets.
3. Import a restricted static subset to a working copy. Record a provenance manifest and unresolved references; do not flatten composition silently.
4. Add export only after stable materials, cameras, lights, geometry, instancing, skeleton, and animation contracts exist. Use test scenes that exercise variants and composition separately.
5. Keep USD layers as interoperable artifacts, not a replacement for Fusion history or a reason to embed a full DCC pipeline.

## 9a. glTF Transform and glTF Validator: the highest-value interchange additions

**Sources and licenses:** [glTF Transform](https://github.com/donmccurdy/glTF-Transform), MIT; [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator), with a JSON report against the glTF 2.0 specification. glTF Transform is explicitly a low-level SDK for reproducible glTF edits and delivery optimization; it does not establish artistic-edit or full DCC semantic fidelity.

### Integration instructions

1. Put both libraries in the Electron main/worker side of the process boundary. The renderer receives a typed inspection report and byte artifacts, never arbitrary library objects or file system handles.
2. Add `interchange.inspectGltf` before changing the current importer. Report document version, extensions, meshes, primitives, attributes, material features, textures, cameras, lights, skins, animations, morph targets, external resources, unsupported extensions, validator findings, and expected Fusion losses.
3. Define a field-by-field Fusion mapping registry. Each import/export field is explicitly `exact`, `compatible`, `approximate`, `omitted`, or `blocked`; no generic "success" state is allowed.
4. Offer delivery transforms only on an exported copy: deduplicate, prune, resample, texture conversion, Draco/meshopt compression, KTX2 conversion, and extension registration. Keep Fusion project content, source images, source geometry, and editable animation untouched.
5. Run the validator on every generated GLB and attach its structured report to the export artifact. Validation errors block an "export completed" result; warnings are visible and versioned.
6. Require an extension policy table. For every `extensionsRequired` entry, Fusion either implements it, passes it through as opaque data when safe, or blocks the operation with an explanation.
7. Pin the exact package version and audit optional codec/image dependencies separately. Image transforms may pull native code, so they require their own package/notice/build review.

### Required proof

- GLB fixtures with skins, morph targets, animation, material extensions, data URI/external resources, and invalid data receive correct non-mutating reports.
- Exported standard GLB validates cleanly and reimports with a documented field-level result.
- A meshopt/Draco/KTX2 delivery artifact is never used as the editable source and carries its codec/extension requirements.
- Worker crash, cancellation, stale document revision, malformed report, and external-path denial leave project/history unchanged.

## 10. Image and texture pipeline candidates

### Recommended sequence

1. Use Three.js preview plus the existing Blender render bridge for current output.
2. Add [OpenEXR](https://github.com/AcademySoftwareFoundation/openexr) for EXR/HDR read/write when render artifacts need high dynamic range.
3. Evaluate [OpenImageIO](https://github.com/AcademySoftwareFoundation/OpenImageIO) only when its broad image metadata, conversion, and texture-cache facilities justify its larger build footprint.
4. Add [OpenColorIO](https://opencolorio.org/) with an explicit user-selected config and image/display/view metadata when color-managed preview and rendering become a product commitment.
5. Add KTX2/Basis delivery compression separately from authoring textures, and preserve the editable original images.

### Required proof

- Alpha, bit depth, channel order, orientation, premultiplication, color space, and ICC/OCIO metadata survive a named image artifact path.
- The same texture and normal map match in Fusion viewport, Blender render bridge, and standard GLB export within a documented tolerance.
- No import overwrites an original image; generated/baked files are versioned project artifacts.

## 11. MaterialX: a deliberate material-graph interchange layer

**Source and license:** [official repository](https://github.com/AcademySoftwareFoundation/MaterialX), Apache-2.0. MaterialX represents material and look-development graphs, and its project supplies target shader generation; it is not a complete renderer or a drop-in replacement for Fusion materials.

### Integration instructions

1. First finish Fusion's own typed material graph: stable node IDs, typed ports, parameter values, texture/image artifact references, explicit color-space metadata, and a small PBR node subset.
2. Add a read-only `.mtlx` inspection path before import. It must list the document's graphs, material assignments, node categories, texture dependencies, target-specific nodes, unknown nodes, and color assumptions.
3. Import only a mapped Standard Surface/PBR subset into a named material working copy. Store unrecognized nodes as source text/provenance and a visible compatibility report, rather than silently baking or discarding them.
4. Export MaterialX only from source graphs whose node mapping is complete. Include texture manifests and color-space identifiers; never make imported external texture paths implicit.
5. Generate preview shaders in a disposable shader worker or use an approved Three.js mapping. Do not let generated shader text execute unrestricted in the renderer process.
6. Keep the Blender bridge responsible for render translation until a repeatable MaterialX-to-Blender contract is tested. Record which Fusion nodes were translated, approximated, or omitted.

### Required proof

- A PBR material with normal, emission, alpha, transmission, and texture transforms agrees in viewport and bridge render within a documented image tolerance.
- Unknown or target-specific nodes cannot silently change material appearance.
- Node/texture identity, graph order, undo/redo, save/reload, and GLB/MaterialX export reports are deterministic.

## 12. Geometry Central: future analysis and retopology support

**Source and license:** [official repository](https://github.com/nmwsharp/geometry-central), MIT. It is an applied C++ surface-geometry library. Its native object graph should remain fully private behind a checked adapter; Fusion must not leak library handles into scene or renderer state.

### Integration instructions

1. Prototype it only after the Rust kernel has an FFI policy for a C++ library. Build it in an isolated native target with one adapter request at a time.
2. Begin with read-only services that add clear value: connected-component diagnostics, mesh validity reports, geodesic distance/brush falloff, curvature fields, and boundary/non-manifold inspection.
3. Translate every output into Fusion arrays keyed by source geometry revision: scalar fields, selected IDs, boundary IDs, or explicit old-to-new maps. Do not store geometry-central indices as persistent Fusion IDs.
4. Consider remeshing/parameterization only after read-only behavior proves that boundaries, UV seams, material boundaries, sparse morphs, weights, and garment attachments can be locked or warned about.
5. Compare each high-level operation with the existing Rust/reference implementation. Keep the implementation that offers the clearest deterministic behavior and smallest release burden.

### Required proof

- A disconnected, manifold, open, non-manifold, and split-UV fixture produces structured diagnostics without mutation.
- Geodesic brush falloff is stable across material splits and never crosses explicitly locked seams.
- Any topology-changing prototype preserves or reports every affected attribute domain, and fails atomically on cancellation.

## 13. KTX2 delivery and offline denoising

### KTX-Software

**Source and license:** [official repository](https://github.com/KhronosGroup/KTX-Software). Repository-specific files are generally Apache-2.0, but the project carries a per-file mixed-license inventory and one noted non-open source file. Treat the generated bill of materials as mandatory before any distribution.

1. Use KTX2/Basis only as an export or viewport-delivery derivative of an editable image artifact.
2. Store source image hash, codec settings, mip policy, normal-map flag, color-space, target platform, and output hash alongside the KTX2 artifact.
3. Decode through a restricted loader path and retain a standard PNG/JPEG/EXR fallback wherever an interchange consumer needs it.
4. Validate visual error, alpha, normal-map angular error, mip behavior, load time, and package size on a representative character/garment material set.

### Open Image Denoise

**Source and license:** [official repository](https://github.com/RenderKit/oidn), Apache-2.0.

1. Add only as an opt-in post-process artifact for a completed render, keeping the unmodified beauty pass and auxiliary inputs intact.
2. Record denoiser version/device, samples, auxiliary albedo/normal use, source image hashes, and output image hash.
3. Make the UI state explicit: `Raw`, `Denoised preview`, and `Denoised export`. Never overwrite the raw render.
4. Compare it against Blender worker denoising before shipping a second route; retain one route if results, build size, and support are not worthwhile.

## 14. OpenTimelineIO: keep editorial interchange separate from animation authoring

**Source and license:** [official repository](https://github.com/AcademySoftwareFoundation/OpenTimelineIO), Apache-2.0. It represents editorial cut information and references to external media; it does not contain media and does not define a DCC animation-rig model.

### Integration instructions

1. Adopt only after Fusion has a stable sequencer model with shots, tracks, clips, frame-rate/timecode, and render artifact references. Keep action curves, constraints, morph keys, pose data, and physics caches in the Fusion document.
2. Start with a small `otio` import/export adapter that maps only named shot ranges and immutable render/media artifact references. Do not load third-party plugin adapters or hook scripts inside Fusion.
3. Validate every referenced asset against Fusion's project asset policy. Missing, remote, external, or unsupported media references become explicit unresolved items rather than filesystem probes.
4. Preserve rational time/rate data exactly in the interchange manifest. Display conversions to Fusion frames, including any rounding, before import.
5. Treat imported OTIO data as a named editorial working copy. A user must choose whether a clip range updates an existing Fusion shot.

### Required proof

- Mixed-rate, gap, transition, nested-stack, missing-reference, and out-of-range fixtures create complete reports and no partial scene mutations.
- A Fusion render sequence exports/reimports with start, duration, rate, clip order, and artifact identities intact.
- Fusion animation curves and physics caches remain untouched by editorial imports.

## 15. OpenVDB: defer volumetric sculpting, remesh, and effects until the scene core is ready

**Source and license:** [official repository](https://github.com/AcademySoftwareFoundation/openvdb), Apache-2.0. It offers sparse volumetric data structures and tools, but has a substantial native build and dependency footprint.

### Future integration instructions

1. Do not make OpenVDB a general mesh-editing dependency. Evaluate it only for a separate volume object type, volume-to-mesh artifact workflow, fog/SDF display, or a deliberately designed remesh/boolean research branch.
2. Store source grids as versioned binary project resources with transform, voxel size, grid class, channels, compression, provenance, and checksums. Do not serialize them as ad hoc Three.js user data.
3. Make mesh conversion an explicit operator with voxel size, adaptivity, smoothing, transfer policy, and memory/work limits. The result must identify whether material IDs, UVs, morphs, weights, or garment links were discarded.
4. Keep mesh-to-volume and volume-to-mesh results as working copies until attribute-transfer evidence exists. Never apply them to a live character, skinned mesh, or linked garment without a blocker/warning route.
5. Test a representative Windows native build and distribution bill of materials before committing to the dependency.

### Why it is deferred

It can unlock professional effects and volumetric workflows, but it does not solve the current higher-value gaps in UV authoring, attribute-aware hard-surface modeling, material graphs, or character/garment fidelity. It belongs after the document resource system and texture/material contracts are proven.

## 16. Existing Three.js WebGPU renderer: evaluate without adding a new runtime

Fusion already uses Three.js. Its documented `WebGPURenderer` can select WebGPU when available and fall back to WebGL 2. This is a renderer experiment, not a replacement for the Blender Cycles/EEVEE render route.

### Integration instructions

1. Build a hidden viewport backend experiment selected by capability and a user-visible preference. Preserve the current WebGL renderer as the default fallback until all viewport tools pass.
2. Establish a renderer-neutral viewport contract for scene projection, picking IDs, grid/gizmos, selection outlines, material preview, texture color handling, lights, and render targets. Do not scatter backend checks through editors.
3. Audit every custom `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` use, and post-process pass. Three.js documents that these paths need migration to node materials/TSL for its WebGPU renderer; do not claim compatibility before each one is covered.
4. Use a render comparison suite with identical cameras and scene revisions. Measure GPU frame time, CPU frame time, draw calls, memory, picking latency, and visual delta on low/mid/high mesh density character-and-garment scenes.
5. Allow backend fallback on init, device loss, unsupported material, or failed capability probe. The fallback event must be visible in diagnostics and must not mutate the document/history.

### Required proof

- Selection, transform gizmos, sculpt/weight/strain overlays, UV view, material preview, and render-target readback work with both backends or have a precise fallback.
- Identical saved scenes retain their source/evaluated geometry and material data regardless of backend.
- Performance gains are measured on the target Windows hardware before a preference default changes.

## Components to defer or reject for this product phase

| Candidate | Decision | Reason |
| --- | --- | --- |
| Direct reuse of DAZ/CC/Marvelous/Blender executable code, plugins, assets, or private project parsers | Reject | Fusion must be an original application and preserve installed products/assets unchanged. Reference behavior may guide tests, but no proprietary code or paid content belongs in distributable source or packages. |
| CGAL as a direct dependency | Defer | Its dual licensing needs explicit commercial-license or copyleft evaluation. Do not add it to an MIT-distributed application without a legal and release decision. |
| Replacing Fusion XPBD cloth with Rapier | Reject for cloth | Rigid-body/collider capabilities do not replace a garment solver with directional stretch, bending, seam constraints, strain diagnostics, and cloth-specific contact. |
| Full OpenUSD authoring stack now | Defer | Valuable later, but it expands build/distribution/scene-contract scope before the document and material systems are ready. |
| OpenVDB in the initial modeling stack | Defer | Valuable for a dedicated volume lane, but has a heavy native/resource model and would otherwise create destructive mesh conversion pressure before attribute transfer is mature. |
| Open CASCADE Technology as a near-term dependency | Defer | It is powerful for CAD/CAM/CAE but carries LGPL-2.1 plus a special exception, a large C++/B-rep integration, and a different document model. Any adoption needs a separate licensing, dynamic-linking, B-rep, STEP/IGES, and build-distribution decision. |
| FFmpeg as an application dependency | Defer | Render-video assembly is useful later, but FFmpeg's optional components can change license obligations. First use image sequences and an explicit external handoff, then make a separately reviewed packaging choice. |
| Direct package copying from installed applications | Reject | It breaches the preservation and original-implementation boundary, adds licensing uncertainty, and makes updates fragile. |
| Unreviewed npm geometry packages | Defer | Add only after exact source, native/WASM behavior, support policy, license, integrity, and tests are reviewed. |

## Common implementation template

Use this checklist for every selected component:

1. Create `research/dependency-evaluations/<name>.md` with source URL, exact tag/commit, license, transitive licenses, supported platforms, build method, performance hypothesis, and alternatives considered.
2. Build a standalone adapter with typed arrays and a bounded request schema. Do not pass renderer objects or arbitrary file paths to it.
3. Add an operator capability record: accepted topology/attributes, output attributes, preservation rules, known losses, limits, cancellation granularity, and whether it is deterministic.
4. Write numeric fixtures before UI: valid input, invalid input, multimat/UV seam, morph/skin or garment attachment where relevant, cancellation, stale response, malformed reply, undo/redo, and save/reopen.
5. Add a single Blender-inspired operator panel, F3 entry, property validation, compatibility warning, and working-copy action where data could be invalidated.
6. Record performance at increasing mesh sizes. Mark the feature offline or impose visible limits when interactive targets are not met.
7. Add attribution, notice text, dependency inventory entry, source checksum, and package verification before release.

## Suggested execution roadmap

## Recommended first adoption decision

Do **not** add every library together. The first implementation tranche should be limited to the following four bounded adapters, in this order:

1. **Khronos glTF Validator** — read-only reports first. It immediately makes existing GLB import/export claims auditable with little coupling to editor state.
2. **MikkTSpace** — derived tangents only. It improves normal-map correctness across the current viewport, Blender render bridge, and interchange path without changing authored geometry.
3. **meshoptimizer** — evaluated draw artifacts only, then optional export compression. It directly improves large-scene presentation while retaining the canonical editable mesh.
4. **xatlas `Create UV Set`** — the first new authoring operator. Its explicit input-vertex cross references fit the existing attribute-remap and working-copy rules.

Each should be merged only after its standalone adapter, preservation fixtures, cancellation/undo/save tests, notice inventory, and measured performance report pass. The next tranche is the Blender bridge expansion; defer Manifold, OpenSubdiv, Embree, MaterialX, OpenUSD, OpenTimelineIO, and OpenVDB until the required source/document contracts listed above exist.

### Milestone A — safe visible quality gains

- MikkTSpace adapter and normal-map parity fixtures.
- meshoptimizer evaluated-display artifacts and optional GLB meshopt delivery.
- xatlas `Create UV Set` with mapping/overlap diagnostics.
- Extend the existing Blender bridge for missing non-destructive modifiers and documented UV/bake operations.

### Milestone B — dependable professional modeling tools

- Manifold Boolean modifier with working-copy safeguards.
- OpenSubdiv prototype with retained cage and crease/UV acceptance fixtures.
- Assimp importer inspection pipeline with explicit field-level fidelity reports.

### Milestone C — production inspection and interchange

- Embree query acceleration with reference-equivalence tests.
- EXR/image metadata pipeline, then deliberate OCIO configuration work.
- OpenUSD inspection/import subset once document v2 provides the necessary scene contracts.

## Research sources consulted

- [meshoptimizer repository and MIT license](https://github.com/zeux/meshoptimizer)
- [xatlas repository and public API](https://github.com/jpcy/xatlas)
- [Manifold repository](https://github.com/ManifoldCAD/manifold)
- [OpenSubdiv repository](https://github.com/PixarAnimationStudios/OpenSubdiv)
- [Embree repository](https://github.com/RenderKit/embree)
- [Assimp documentation and BSD-3-Clause statement](https://github.com/assimp/assimp/blob/master/doc/dox.h)
- [OpenUSD project](https://openusd.org/)
- [Rapier documentation](https://rapier.rs/)
- [Khronos glTF extension registry](https://github.com/KhronosGroup/glTF/tree/main/extensions)
- [glTF Transform SDK](https://github.com/donmccurdy/glTF-Transform)
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)
- [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
- [OpenVDB](https://github.com/AcademySoftwareFoundation/openvdb)
- [Three.js WebGPURenderer documentation](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT)
- [three.js documentation](https://threejs.org/docs/)

Source pages establish public project scope and licenses; each version must be rechecked at the time it is adopted. This research does not assert that every candidate can be packaged, that all bindings are maintained, or that their behavior matches Blender, DAZ Studio, Character Creator, or Marvelous Designer.

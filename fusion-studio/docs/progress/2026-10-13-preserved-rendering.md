# Fusion Studio 0.7.0 — preserved Blender rendering

Imported .blend scenes now include an embedded native snapshot alongside an evaluated viewport mesh. Native rendering retains shader graphs, the source world, lights, camera effects and render geometry. The snapshot is written into a fresh Fusion job, then embedded in the .fusion project. It never overwrites the source installation or .blend.

Render settings expose CPU, CUDA and OptiX. Device selection is validated against installed Cycles devices, with a clear error rather than silent CPU fallback. CPU and RTX 4060 OptiX are tested with both user-provided BMW scenes. Compositor file-output nodes are muted so paths stored in imported scenes cannot create unrelated output files.

The evaluated viewport uses approximate materials and a static imported pose. Whole-scene transforms and additional Fusion objects are supported in preserved rendering. Native mesh/material edits require a converted working copy, with a warning and retained original. The current renderer supports one visible preserved scene per render. Native shader editing, animation synchronization, multiple scene composition and per-object native geometry editing remain required work.

## BMW evidence

640×360, 16 samples, denoising; comparisons use the same source settings and render device in isolated Blender 5.2. These are image regressions, not official benchmark timings. CPU/OptiX native references and preserved Fusion outputs are compared with Pillow; each mean absolute RGB-byte difference is below 0.1. The previous generic GLB scene route still loses arbitrary legacy shaders and source lighting, so exchange fidelity remains approximate.

- bmw27_cpu.blend: CPU, mean absolute byte difference 0.00003762.
- bmw27_gpu.blend: OPTIX, mean absolute byte difference 0.00003617.

![bmw27_cpu.blend preserved render](<<user-profile>/Documents/ChatGPT/Ultimate 3D software/fusion-studio/test-output/bmw-render-1791925807613/jobs/render-2026-10-13T21-10-16-605Z-d89a6f/BMW cpu preserved.png>)

![bmw27_gpu.blend preserved render](<<user-profile>/Documents/ChatGPT/Ultimate 3D software/fusion-studio/test-output/bmw-render-1791925807613/jobs/render-2026-10-13T21-10-26-992Z-0e8ad9/BMW gpu preserved.png>)


The file-picker import dialog also retains an editable mesh/rig interchange mode. That route preserves supported rig data through the earlier adapter with generic shading; it does not embed the native scene. Preserved mode uses the evaluated proxy and snapshot.

Whole-scene transforms freeze evaluated object constraints at the imported frame. Every resulting object world matrix is checked against the requested transform (maximum error below 1e-4). World-space shaders or environment relationships can legitimately change appearance, so transformed renders are not tested for pixel invariance. Native animation/controller editing remains pending.

## Release verification

Version 0.7.0 is packaged with native_scene.py and its renderer-side validation. 33 unit/regression tests pass. UI v2, foundation, modeling, clothing and IK checks pass; the native-scene UI check validates actual file-picker import, OptiX device selection, an added object changing pixels, render after save/reload, root transform matrix accuracy, warning/cancel and one-step copy undo/redo. The saved-scene signature canonicalizes buffer layout, index storage width and signed zero so reloading cannot falsely count as an edit.

The existing editable .blend rig route remains selectable and its skin data is verified. General engine integration covers GLB/OBJ/FBX/BLEND, mesh operations/rendering and import roundtrip. Preservation: 34,837 original installation records, zero changed/added/missing, 15 selected SHA-256 matches; both BMW source hashes/timestamps match. No vendor runtime or paid test asset is bundled into the executable.

The executable is release-v0.7.0/win-unpacked/Fusion Studio.exe; Launch Fusion Studio 0.7.0.lnk is in the parent workspace. Full requested feature coverage is still incomplete.
Final packaged native-scene desktop test passed, including actual added-object pixel change (mean RGB-byte difference 1.1884), render after reload, root transforms and converted-copy undo/redo. Packaged foundation and serialization regressions also passed.

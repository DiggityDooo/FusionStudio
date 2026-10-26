# BMW render acceptance — historical 0.6.0 comparison

Version 0.7.0 adds a preserved scene route that passes both fixture comparisons. See [preserved-rendering evidence](2026-10-13-preserved-rendering.md). The generic interchange losses below remain relevant.

**Render execution succeeds; converted-scene visual fidelity fails.** These user-provided scenes are now regression fixtures for the full Fusion Studio goal.

Both source files retain their original SHA-256 and modification time. Sources were read through Blender's data-library append API with factory startup, automatic scripts disabled and private runtime/profile paths. No source .blend was saved. Test outputs are outside the supplied BMW directory.

| Input | Native reference | Fusion route | Visual result |
|---|---|---|---|
| bmw27_cpu.blend | Cycles CPU, 3.63s | .blend objects → GLB → Fusion Cycles CPU | Major material/lighting loss |
| bmw27_gpu.blend | Cycles OptiX / RTX 4060, 2.25s | .blend objects → GLB → Fusion Cycles CPU | Same conversion limitations |

The test uses **640×360, 16 samples and denoising** for both references and converted scenes. The saved scenes use 1920×1080 at 50%, 35 samples. Reference times exclude application startup and are a single run, not an official BMW benchmark or fair hardware comparison. Fusion's device selector is still CPU-only; the GPU reference ran in the isolated test process.

## Native scene reference

![BMW native CPU reference](<C:/Users/Sean/Documents/ChatGPT/Ultimate 3D software/fusion-studio/test-output/bmw-render-1791910083153/bmw-cpu-reference.png>)

The original scene camera, world, lights and shader nodes are retained in the native reference. Blender 5.2 loads the legacy scene, so this is not a historical Blender 2.7 pixel-perfect baseline.

## Current Fusion conversion

![BMW current Fusion render](<C:/Users/Sean/Documents/ChatGPT/Ultimate 3D software/fusion-studio/test-output/bmw-render-1791910083153/jobs/render-2026-10-13T16-48-09-133Z-5d5814/BMW cpu Fusion render.png>)

The legacy car-paint shader becomes nearly white; glazing and visible surface appearance differ. The current adapter imports objects through glTF, then adds Fusion's studio lights/floor/world and AgX view transform. It does not preserve original shader graphs, full scene presentation or all modifier semantics. These differences are **not accepted as rendering parity**. The `.blend` conversion dialog now warns before processing.

The next rendering work must preserve Blender scene/shader information or implement validated conversions, evaluate modifiers/visibility correctly, retain camera/world/light configuration and support the verified GPU backend inside Fusion. Keep a source-quality reference route distinct from a render of user-edited Fusion geometry; silently rendering the untouched source would not validate edits.

The runnable diagnostic is `node tests/bmw-render.cjs`. Its completion means image generation and source-hash checks succeeded. The report's independent `visualFidelity` field records acceptance. Machine-readable outputs: [BMW results](../../test-output/bmw-render-results.json).

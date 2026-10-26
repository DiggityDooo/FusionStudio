# Fusion Studio

A local Windows 3D workspace built around the four applications installed on this PC. Fusion provides a shared scene editor, versioned projects, Blender processing, and guided character/clothing handoffs. The commercial applications remain separate installed tools; their engines are not merged into this executable.

## Start

Open `release/win-unpacked/Fusion Studio.exe`, or the **Launch Fusion Studio** shortcut in the parent workspace after packaging. Keep the whole `win-unpacked` folder together. No installer or administrator access is needed.

For development: `npm ci`, `npm run build`, then `npm start`. `npm run dev` shows the canvas in a browser; local file operations and installed engines require the desktop app.

## What works

- Interactive 3D canvas: selection, orbit/pan/zoom, move/rotate/scale gizmos, numeric transforms, snapping, object rename, duplicate, delete, and visibility.
- Six editable primitives, a mannequin/clothing shape study, and a product study.
- Material colors, roughness and metallic controls; eight surface presets; wireframe view.
- Undo/redo (25 states), embedded-texture `.fusion` projects, recovery copies, and separate project versions on each save.
- Isolated Blender jobs: GLB / FBX / OBJ + MTL / BLEND export, one-level subdivision, bevel, 50% decimation, and a Cycles studio render.
- Blender conversion for model imports. GLB, FBX, OBJ and BLEND are covered by the integration test. STL, PLY, USD and Alembic routes are implemented but were not individually runtime-tested.
- Installed-tool detection, launch actions, and practical handoff instructions for DAZ Studio, Marvelous Designer and Character Creator 5.
- Cancellable jobs, visible failures, Blender logs, render preview and output-folder access.

The starter mannequin and jacket are geometric studies, not a generated anatomical character or simulated garment. Vertex editing, sculpting, rigging, procedural nodes, posing and cloth simulation are performed in the relevant full application. **Open in Blender** creates a new `.blend` project and launches a separate session for those operations.

## A character and clothing workflow

1. Open **Workflow → DAZ Studio** or **Character Creator 5**. Create and export a character to a new folder. Prefer FBX for rigs. Preserve CC's accompanying JSON, textures, and optional FBX key.
2. In Fusion, use **Import model**. FBX/GLB generally carry units: begin with automatic units (1×). For raw OBJ choose its actual units. DAZ's shipped Blender OBJ preset specifies 50 cm per unit: use the matching option.
3. Export an OBJ avatar for Marvelous Designer, then choose meters when importing it there. Simulate clothing in Marvelous Designer and export the result to a new folder.
4. Import that garment into Fusion with matching units. Assemble, transform, and set surfaces. Use **Render in Blender**, or **Open in Blender** for detailed finishing.

Existing DAZ/CC bridge components were inspected read-only. Fusion does not install, enable, rewrite, or assert a live connection to those plugins. File transfers are explicit. Specialized vendor shaders, morph controllers, physics, and CC round-trip metadata are not reproduced by generic interchange. Imported animation clips are passed through GLB export where supported, but Fusion has no timeline or animation editor and animated vendor assets have not been validated end-to-end. Preserve the original native projects.

## Data and original files

Development data is in `fusion-studio/runtime`. Packaged data is in `release/win-unpacked/Fusion Data`. Projects, processing inputs, outputs, Blender preferences, temporary files, and logs remain in the program's data directory. All saves/exports create new uniquely named folders. Import reads the selected file and its dependencies; it never overwrites that source.

The app calls the executables at the exact four paths you supplied. Those paths are configured in `electron/core.cjs`. No vendor DLLs, licensed assets, or commercial programs are copied into the distribution. Blender receives factory startup, disabled script auto-execution, a dedicated config directory and a fixed worker script; `.blend` imports append scene data instead of opening its scripts. Manually launched vendor applications may manage their own normal preferences and working data.

The initial inventory covers 34,837 installed files. `research/` contains the before/after verification, bounded SHA-256 checks, REA evidence, and installed integration findings. This is a read-only inventory, not proof of every application feature or plugin's runtime behavior.

## Validation

`npm test` checks output confinement, source preservation, versioned save behavior and invalid requests. `npm run test:ui` launches the actual desktop window, exercises editing and project loading, and produces `test-output/studio-ui.png` and a GLB fixture. `npm run test:integration` uses the installed Blender 5.2 to export, modify, render and round-trip that fixture. `npm run package` creates the Windows application folder.

Reports are in `test-output/`. UI tests use a separate new data directory each time and do not touch user projects. The proprietary applications' launch and live editing were not exercised during automated testing.

## Research sources

- [Blender command-line arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html)
- [Blender glTF export API](https://docs.blender.org/api/current/bpy.ops.export_scene.html)
- [Installed integration findings](research/integration-findings.md), with source locations and official DAZ/Marvelous/Reallusion references.
- [REA static Blender PE resource evidence](research/blender-pe-evidence.json): `ev_93ebb17b278c76eccffe24e51daacde7881b6928f5b7ddbfe82939dbb266053e`.

The UI and integration layer are new code. Dependency licenses ship with the Electron distribution and remain in the source dependency packages. Your original tools retain their own licenses.

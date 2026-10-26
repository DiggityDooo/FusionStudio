# Khronos glTF Validator adoption

Date: 2026-10-18. Original Fusion adapter, using the official `gltf-validator` npm package, pinned to **2.0.0-dev.3.10**. Its prerelease label is retained. Upstream main may describe newer capabilities than this compiled package: the actual report records both package and validator versions and identifies extensions the compiled validator cannot inspect.

- [Official source and build instructions](https://github.com/KhronosGroup/glTF-Validator)
- [Package API documentation](https://www.npmjs.com/package/gltf-validator)
- License: Apache-2.0; packaged `LICENSE` and `NOTICES` include inherited Dart notices. No transitive npm packages were added.
- Registry integrity: `sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyagFE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==` (also in the npm lockfile).
- Package-root notice SHA-256 hashes are in `docs/dependency-licenses.json`. Production packaging includes the package and its notices; worker and helper files plus the package are unpacked for Node worker-thread resolution.

## Boundary

The main process authorizes files selected by the import picker or asset catalog. The disposable Node worker inspects a file or copied GLB bytes, using a 512 MiB V8 old-generation limit and 30-second timeout. Node worker threads are a responsiveness and cancellation boundary, not an OS filesystem sandbox. The adapter exposes no arbitrary script or network callback to the renderer.

Limits: 64 MiB total source plus external files, 256 external files, 1,000 validator messages. External paths must resolve under the selected model directory; parent, absolute, remote and escaping symlink paths are rejected. No network resource resolution is implemented. Data URIs are handled by the validator. Referenced ordinary files are enumerated before validation even when an image codec/extension is unsupported.

Before Blender conversion, the adapter revalidates the source and compares a hash of the document and external-resource manifest with the reviewed import. It then copies only the reviewed bytes into a new job folder, verifying hashes again. The original file and external resources are never written. Blender reads that copied model.

Every Blender-produced GLB is validated before the job is marked complete. `input-validation.json` and `output-validation.json` retain reports inside new job folders. Invalid output remains a failed job artifact; no success or scene replacement is published. Cancel waits for validator-worker termination before the inspection promise settles. Existing Blender process cancellation is otherwise unchanged.

## Semantics

Validation checks glTF syntax, references and supported resource/accessor rules. It does not establish vendor parity, cloth convergence, visual equivalence, geometric manifoldness or full extension semantics. Fusion maintains a separate conservative installed-Blender conversion policy: unknown required extensions block conversion, optional ones carry approximation reports. This can reject files supported by other tools; no codec is silently installed.

The F3 `Inspect scene glTF / GLB compatibility` operator is read-only. It exports a temporary scene projection, carries scene/revision/request/input-hash context through inspection, rejects stale results and creates a new JSON report artifact. It adds no history entry. Original geometry, morphs, skin weights, UVs, materials, garment caches and the project document remain authoritative.

The UI's GLB export now writes these validated Fusion exchange bytes directly to a new artifact. It does not require a Blender conversion or launch. This retains the exporter-produced mesh, morph, skin, animation and tangent data exactly; the existing Blender `glb` job implementation remains for its current engine callers. A failed direct validation leaves a report and failed job, without writing an exported GLB or a history entry.

## Adoption gates

- Detailed generated 18,432-triangle fixture: valid report and immutable bytes.
- Invalid accessors and required extensions: rejected, with original messages retained.
- External-resource containment, snapshots and changed-source hashes: checked.
- Actual worker cancellation, timeout, crash, stale reply and retry: checked.
- Desktop import review/cancel, undo/redo, save/reopen and export sidecars: acceptance harness `tests/gltf-validation-ui.cjs`.
- Detailed private Genesis/garment saved scene: desktop read-only state comparison. Private content stays in ignored `test-output`.

Performance is measured by the desktop report and an increasing-density numeric sweep. No interactive-time or full glTF extension guarantee is made. Source-file copying, JSON parsing and V8/WASM external allocations are not fully bounded by the old-generation limit; the input byte limits and timeout remain required.

No vendor-install, native module, or previous-release package change is required by this adoption. This is an unreleased source change until the combined release gates pass.

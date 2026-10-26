# Fusion Studio direct DSON support

Implementation: `scripts/dson_importer.py`. This independently parses existing DUF/DSF asset data and reconstructs it through Blender's own API. It does not launch DAZ, connect to CMS, load DAZ DLLs, execute source scripts, change vendor settings, or write any source file. Native files and textures remain references to explicitly allowed content libraries. Callers save/export newly created Blender assets into project output folders.

## API and integration contract

```python
report = preflight_dson(source_path, content_roots, options=None)
report = import_dson(source_path, content_roots, options=None, on_preflight=None)
```

Preflight requires ordinary Python only. It resolves and validates topology, UVs, explicit morphs and skin data before Blender scene changes. `import_dson` emits `DSON_PREFLIGHT <JSON>` and invokes the optional callback before reconstruction. Mandatory topology/file failures or `require_full_fidelity=True` with unsupported fields raise `DsonImportError` with the report attached. The importer appends objects and returns JSON-safe names; the caller retains responsibility for showing preflight warnings and deciding whether to proceed with the supported subset.

CLI used by the main process:

```text
python -B dson_importer.py --preflight SOURCE --roots JSON_ARRAY
```

Alternatively: `python -B dson_importer.py SOURCE --content-root ROOT` (repeat the root option). CLI prints a JSON report and returns 0 on a loadable subset, 1 on preflight errors. It never imports bpy.

Important report fields:

- `ok`, `errors`, `warnings` (array of plain strings), `warning_details` (code/message/path objects), `unsupported_fields`.
- `meshes`: source IDs, node names, vertex/face/UV counts, material groups, referenced morph summaries, bone and weighted-joint counts.
- `properties`: `{key,name,label,min,max,value}` for supported referenced morphs. `key` is the canonical resolved file path with forward slashes plus `#asset_id`.
- `dependencies`: explicit files inspected, including SHA-256 for DSON documents. Texture resources list paths without copying files.
- Import result adds `created_objects`, `created_meshes`, `created_rigs` as Blender object-name lists.

Options: `morph_values` maps property keys (or legacy internal IDs) to requested numeric values; `additional_morphs` supplies explicit DSON morph URIs without scanning folders; `import_rig` defaults true; `subdivision` defaults false and enables a Blender preview subdivision modifier; `require_full_fidelity` defaults false. Resource limits default to 128 MiB per raw/expanded DSON file, 512 MiB total expanded documents, 1,024 document references, two million vertices per mesh and 64 referenced shape keys per mesh. Exceeding the shape-key limit is reported before import.

## Implemented reconstruction

| Data | Behavior |
|---|---|
| JSON and gzip DUF/DSF | Parse ordinary UTF-8 JSON or gzip-wrapped JSON. Non-finite JSON numbers are rejected. |
| Asset addressing | Leading `/` resolves against explicit content roots; relative files resolve within allowed roots; local fragments resolve only in the explicit source or allowed roots. Percent escapes and fragment IDs are decoded. Common DSON node prefixes are recognized. Remote/drive URI schemes, NUL, backslash escapes and filesystem targets outside resolved roots are rejected. Symlink-resolved paths are checked. |
| Geometry | Retain source base-resolution vertices and triangle/quad topology, face-group metadata and material-slot assignment. Validate array counts and index bounds. |
| Coordinates | Convert right-handed Y-up centimeters to right-handed Z-up meters: `(x,y,z) -> (x,-z,y)/100`; degrees become radians for transforms. |
| Materials | Translate declared diffuse/base color and direct image paths, scalar opacity, roughness and metallic values to Principled BSDF. Texture files are read, not copied or rewritten. Texture repeat permits separate material images on tiled UVs. |
| UVs | Preserve primary UV values and polygon/vertex-specific seam overrides as Blender corner UVs. Missing/invalid optional UV assets generate warnings and skip the UV layer. |
| Referenced morphs | Apply explicit saved or requested values through relative shape keys built from sparse base-resolution deltas. Preserve identifiers, original slider bounds and source paths in object metadata. Large current values are encoded by scaling deltas when Blender's slider limits cannot express them. |
| Skeleton and general skin | Rebuild the descendant bone hierarchy, center/end positions and orientation-based roll; map scene-instance aliases back to definition IDs; import general node-weight vertex groups. Reconstruct explicit current transforms with the documented DSON parent/orientation/scale algorithm. Preserve a Blender armature modifier. |
| Source preservation | Ordinary files are opened read-only. Import failure removes newly created objects/mesh/armature/material datablocks; original objects are not replaced. All source scripts are treated as unsupported data. |

## Explicit limits

This is a supported subset, not full DAZ content-engine parity. Preflight identifies encountered omissions, including vendor Iray/material shader layers, subdivision and proprietary HD deltas, ERC/formulas, bone-formula corrections, general-weight skinning differences, TriAx/bulge/scale weights, graft and rigidity rules, source-inheritance derivation, conforming/parent-in-place scene assembly, animation curves, indirect image-library references, opacity maps and distinct per-material UV sets. The importer does not automatically discover all installed morphs; it exposes referenced and explicitly requested morphs.

Preset-only files with no independently resolvable geometry require their base character scene and currently fail preflight. Legacy Poser formats, binary `.daz`, simulation, strand-based hair and arbitrary vendor extensions are not reconstructed. General-weight armature rigs are usable, but exact DAZ deformation/joint-correction parity remains unverified. Blender preview subdivision does not reproduce DAZ HD shapes. Optional missing textures/morphs or vertex-count mismatches are reported; supported base geometry may still import.

## Validation performed on 2026-10-13

Tests used the installed Blender 5.2 executable with factory startup, auto-execution disabled and user/temp paths restricted to a new `test-output/dson-importer` directory. They ran separate background processes; no live Blender session or DAZ/CMS process was controlled.

| Existing source | Result |
|---|---|
| Genesis 9 base DUF | 25,182 mesh vertices, 25,156 faces, 100,624 corner UV entries, seven material slots, 138 bones and general weight groups; Basis plus two referenced base-resolution shape keys. |
| Genesis 8 Basic Female DUF | 16,556 mesh vertices, 16,368 faces, 65,472 corner UV entries, 16 material slots, 170 bones and general weight groups. Referenced eyelash morphs with a different vertex count were warned and omitted. |

Rest-pose armature deformation stayed below `1e-5` meter (observed maxima approximately `1.4e-6` and `1.3e-6`). A Genesis 9 source UV seam override matched the resulting loop UV to `1e-6`. A referenced Navel shape key carried an observed maximum base delta of `0.00835` m; a 0.1-radian hip pose displaced the weighted mesh by `0.09834` m. Six inspected original DSON document hashes matched before/after this test. Four external/drive/traversal URI cases were rejected. These checks establish actual geometry/UV/morph/rig operation for the two tested assets, not broad compatibility with all installed content or renderer parity.

Additional checks passed for equivalent JSON/gzip triangle fixtures in the isolated test folder, the exact `--preflight SOURCE --roots JSON_ARRAY` CLI, preserved source face-group indexes, strict-fidelity rejection, and a preflight callback observing the original scene object count before any reconstructed object was created.

## Primary format references

The implementation follows the published [DSON specification](https://docs.daz3d.com/public/dson_spec/start), [asset addressing](https://docs.daz3d.com/public/dson_spec/format_description/asset_addressing/start), [units/coordinates](https://docs.daz3d.com/public/dson_spec/format_description/units_coordinate_systems/start), [geometry](https://docs.daz3d.com/public/dson_spec/object_definitions/geometry/start), [polygon](https://docs.daz3d.com/public/dson_spec/object_definitions/polygon/start), [UV set](https://docs.daz3d.com/public/dson_spec/object_definitions/uv_set/start), [node transforms](https://docs.daz3d.com/public/dson_spec/object_definitions/node/start), [node instances](https://docs.daz3d.com/public/dson_spec/object_definitions/node_instance/start), [modifier instances](https://docs.daz3d.com/public/dson_spec/object_definitions/modifier_instance/start), [morph](https://docs.daz3d.com/public/dson_spec/object_definitions/morph/start), [skin binding](https://docs.daz3d.com/public/dson_spec/object_definitions/skin_binding/start) and [weighted joints](https://docs.daz3d.com/public/dson_spec/object_definitions/weighted_joint/start).

The vendor's documentation states CC BY 3.0 except where noted. This implementation uses documented data semantics and an independent reconstruction; no vendor runtime code or SDK source was copied.

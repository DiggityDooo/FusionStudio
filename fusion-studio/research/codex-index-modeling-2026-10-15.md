# Blender 5.2 focused export: modeling requirements

Date: 2026-10-15. This is a static evidence report from the user-supplied CursorWork export. No vendor process was launched, no installed file was changed, and no pseudocode was added to Fusion source. QtWebEngine was not examined.

## Identity and validation

- Index: `CursorWork/output-v2/CODEX_INDEX.json`.
- Export directory: `CursorWork/output-v2/blender.exe-e27fbfea8564-c6cba33bc56b`.
- Installed artifact: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- File/product version recorded by exporter: `5.2` / `5.2`.
- Size: 112,975,320 bytes.
- Binary SHA-256: `e27fbfea8564aa645d4463cb0949695fd85562b9de6df9561b06859a1074adf7`.
- Manifest SHA-256: `69a3f4f90fa4619e0f7b7e6af87657240965a076ec1a11f3c6177f45c90ac643`.
- Config SHA-256: `c6cba33bc56be0454dd773bb063cd8d675bb7f7a7b727c680e838ffb5d472d74`.
- Ghidra version recorded by exporter: `12.1.4`.

The installed binary hash equals the manifest identity. The manifest hash equals `COMPLETE.json`. All 64 exported record file hashes match the manifest, and all 64 decoded pseudocode hashes and embedded binary identities match. The manifest records 64 selected, 64 successful and zero failed functions. These checks establish that this bounded export is intact; they do not prove decompiler semantic accuracy.

Coverage is explicitly incomplete: 532 functions matched the selector, only the first bounded 64 were exported, and both manifest and selection record truncation. Selection used modifier, BMesh and cloth-related terms. The early-address modifier infrastructure dominates this subset. It is not a complete modifier implementation, BMesh operation library, cloth solver, or original source recovery. This report does not transfer addresses from Blender 5.1.

## Finding ledger

All addresses below are static virtual addresses in the exact artifact above. Filenames are relative to its export directory. Observed means present in the exported pseudocode or string inventory; inferred means a behavioral interpretation rather than observed execution.

| Evidence | Observed | Inference and boundary |
| --- | --- | --- |
| `BKE_modifier_calc_data_masks`, `0x1400494d0`, `function-2c73e3cb0dbf8c78426969bf.json` | Walks modifier entries, checks eligibility, calls an optional per-type data-mask callback, builds per-stage records, and combines mask requirements along the chain. | Mesh attributes needed by later evaluation stages are planned explicitly. Exact mask bit meanings, every modifier's requirements, and preservation outcomes are not established by this subset. |
| `BKE_modifier_supports_mapping`, `0x140048590`, `function-d103c4574ce0a69f22b6dabf.json`; `BKE_modifier_is_same_topology`, `0x140048be0`, `function-8a8e6fd504f87d7daf1039eb.json`; `BKE_modifier_is_non_geometrical`, `0x140048c00`, `function-3fb81663d7fb190a60a3b61b.json` | These are separate capability queries consulting modifier type metadata. Mapping support is not a universal property. | A single blanket topology-changing classification loses meaningful distinctions. This export does not identify every action's class or guarantee that glTF carries its attributes. |
| `BKE_modifier_get_original`, `0x14004b0d0`, `function-a177ca09b5c4e313a56e86d7.json`; `BKE_modifier_get_evaluated`, `0x14004b110`, `function-0c09f031f67115400c9b8d22.json` | Original/evaluated object lookup is followed by modifier lookup using a persistent integer identifier. | Modifier identity must survive reorder and evaluation-copy replacement. This is not evidence for using Blender memory offsets or its identifier-generation procedure in Fusion. Fusion already generates independent UUIDs for stack entries. |
| `BKE_modifiers_persistent_uid_init`, `0x14004b160`, `function-8fc60d77d2d5ba3e6a8274b4.json` | The selected candidate is checked against existing entries before assignment. | Duplicate modifiers require distinct identities. Exact vendor hash/random steps are unnecessary for an independent implementation. |
| `BKE_modifier_is_enabled`, `0x140049410`, `function-409c6a37a6f1d21be608adf1.json` | Eligibility uses requested mode bits and an optional per-type callback, in addition to stored state. | A modifier's result can depend on evaluation context. The subset does not establish all viewport/render/edit-mode bit definitions. |
| `BKE_modifier_modify_mesh`, `0x14004a9e0`, `function-53b0770865a8adf9827af498.json` | Materializes a mesh wrapper for some capability combinations before calling a type-specific mesh callback. Decompiler flags an unresolved indirect branch. | Evaluation should expose supported input representations instead of assuming all stages consume one raw array. The callback's algorithm and output mapping are unknown here. |
| `BKE_mesh_to_bmesh_ex`, `0x1405794f0`, `function-e4a7c2f924f626c949add1b6.json`; `BKE_mesh_from_bmesh_for_eval_nomain`, `0x140579640`, `function-9dbeca6607f2af93d7db8220.json` | Creates an editable representation from mesh counts and conversion parameters; evaluated conversion creates a new mesh, receives a custom-data mask, then copies evaluation parameters. | Editable source and derived mesh are distinct lifecycle objects. Actual attribute conversion implementation is outside this exported wrapper. |
| `BKE_modifier_set_error`, `0x140048c20`, `function-9682954a52bd5156077a1bff.json`; `BKE_modifier_set_warning`, `0x140048d70`, `function-cc5307a9b6e856e14c892e6e.json` | Diagnostic text is stored on a modifier entry; the error path also includes object/modifier context in logging. | Diagnostics belong to the specific modifier rather than only a job-wide failure banner. This subset does not demonstrate all UI severity handling. |

`selection.json` also contains embedded BMesh API documentation for vertex, edge, face and loop custom-data layers, UV loop access and shape-key coordinates (examples: addresses `0x145092eb0` and `0x145092fb0`). Those are documentation strings with no code references in these entries, so they support interface vocabulary only. They do not demonstrate attribute interpolation, UV seam preservation, or solver behavior.

## Independent implementation requirements

1. **Capability-based stack preflight and honest warnings.** Define Fusion-owned modifier metadata for topology effect, mapping expectations, material/UV outcomes, deformation compatibility and supported contexts. Use this to generate operation-specific warnings. Current `src/compatibility.js` places `smooth`, `twist`, `bend`, `taper` and `stretch` in its topology list and describes all Blender exchanges as baked copies, including the retained-source stack. Keep generic interchange limitations explicit while describing the actual retained-source behavior. Verify a non-topology deformation, a subdividing operation and an attribute-destructive remesh against detailed meshes, including cancel/undo. Do not infer rig or morph preservation merely because vertex counts match.

2. **Per-stage attribute and identity diagnostics.** Carry the existing Fusion entry UUID through each worker stage; return diagnostics keyed to it, plus before/after vertex/face counts and an inventory of UV layers, material regions, vertex colors and supported custom attributes. Plan downstream requirements, fail or warn on missing required data, and never silently claim successful preservation from an unverified glTF round-trip. Test reorder, duplicate and missing-attribute cases. Fusion already retains source geometry and entry UUIDs, so this extends its protocol rather than replacing its architecture.

3. **Context-specific evaluation.** Add independently defined viewport/render enable flags and evaluate from the same retained source with an explicit context. Persist these flags, migrate existing `enabled` values deterministically, and preserve shared undo. Test a modifier enabled for rendering but hidden in editing, save/reload, then confirm each path selects the intended stages. This requirement follows the observed contextual eligibility boundary; the exact vendor mode constants need not be copied.

## Unresolved questions

This subset does not recover subdivision rules, bevel geometry, remeshing, skinning, garment simulation, complete CustomData conversions, or per-operation UV interpolation. No numerical parity or runtime quality claim follows from the exports. Focused follow-up analysis could answer a specific missing wrapper/caller question; a broad re-export or vendor launch is unnecessary for the requirements above. Fusion's existing persistent Blender worker provides official Python API behavior for supported stages, while Fusion-owned metadata, transactions and diagnostics can be implemented independently.

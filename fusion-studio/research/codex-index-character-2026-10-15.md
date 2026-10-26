# CODEX_INDEX character evidence, 2026-10-15

Read-only review of the two character exports referenced by `CursorWork/output-v2/CODEX_INDEX.json`. No vendor application was started, no vendor file was changed, and no additional export was run. This note describes observed static structure in original words; it does not contain vendor pseudocode.

## Identity and integrity

| Target | Installed file | SHA-256 | Version metadata | Export coverage |
| --- | --- | --- | --- | --- |
| DAZ4 DzCore | `C:\Program Files\DAZ 3D\DAZStudio4\DzCore.dll` | `cfe5eab6b1b7df415fdccc39f43ab79755223a22902e609e3e832dbefa9ee68a` | File/product version fields empty | 64 successful selected functions of 170 matched; selection truncated |
| Character Creator 5 | `C:\Program Files\Reallusion\Character Creator 5\Bin64\CharacterCreator.exe` | `8b15680258bb749945ff4760c94fc747ac096054fc62ced5e778482e438fc153` | `5.07.1623.1` | 21 successful selected functions of 21 matched; bounded query only |

Both exports report Ghidra 12.1.4 and zero failed selected functions. Current installed binary hashes match the manifests. Every function-record file hash, embedded binary/config identity, and UTF-8 pseudocode hash matches. Both `COMPLETE.json` manifest hashes match the actual manifest bytes: DAZ `007d38cf64aa76a61a4f80518c1bb783bf3c07e0ad71c3d203a55f9568ea8f39`; CC `817bf3f05094a84e41907015a95cbe2732bb5f12e4b6323d1d2204867e8d75be`. These checks establish internal integrity and present-file identity, not runtime accuracy or whole-program coverage.

Record paths below are relative to the respective export directory:

- DAZ: `CursorWork/output-v2/DzCore.dll-cfe5eab6b1b7-76ebd74ba43b/`
- CC: `CursorWork/output-v2/CharacterCreator.exe-8b15680258bb-ea366f425a3d/`

## Observations and boundaries

### DAZ formula ingestion

`0x1804bfdc0`, `function-8fc477946a7d8d2b34f2e742.json`, contains substantive formula-to-link construction. It validates source/output property availability, checks accepted operation shapes, builds keyed links, reports malformed keys, tests a link for circularity, and rejects unsupported formulas. Key records with two or five numeric components follow separate addition calls; this supports distinguishing simple keys from richer interpolation keys. Some operation names remain unresolved global addresses. Exact arithmetic enum meanings and runtime interpolation math cannot be assigned from this record alone.

`0x180fb8d50`, `function-4ec40f09260afa8d7c4c91df.json` (`createErcLinkOfType`), checks both properties and circularity before constructing and attaching a link. This directly supports rejecting cycles before dependency insertion. It does not establish a graph-evaluation algorithm.

Many exported spline matches, such as `0x1819f0220` / `function-b16333eb51bbcc42f69f8e4a.json` and `0x1819f0250` / `function-31ef655915c051818da3ed3b.json`, merely initialize operation-name strings. They provide **no spline evaluation behavior**. Fusion's existing interpreter remains an independent implementation of the public DSON format; the new exports do not establish numeric equivalence.

### DAZ morph loading

`0x18052bb70`, `function-7565af8c56f2387cb962494a.json` (`loadMorphDeltasWithOptions`), validates its destination, delegates loading by URI, distinguishes success/error returns, records elapsed loading time, and supplies contextual warnings. The delegated loader is not included here. This does not recover the sparse-delta format or deformation calculation and provides no basis for bypassing encrypted content.

### CC controls, identity, and compatibility

`0x1427eb6c0`, `function-cd282cf507173a995522e538.json`, iterates and serializes separately labeled morph-weight and control-weight maps, template-slider flags, and slider-name mappings to script names and content IDs. This is stronger evidence than isolated strings because the loops and serializer calls show the distinct persisted collections. The mathematical relation between the two maps is not established.

`0x1422aa000`, `function-9a82ae37ba50095b3c3d5256.json`, serializes custom expression display names/rename flags, a control-weight name list, and a grouped-name-to-morph-index mapping. This supports keeping stable semantic identity separate from editable display labels and presentation order. It does not recover the expression solver.

`0x140ea0af0`, `function-dff5bd8122efe7657eaf968d.json`, includes conditional avatar-preset compatibility paths. One reports incompatible source/target bases and requests conversion; another reports differing morph bases and describes a full compensation-offset slider to preserve shape. The source/target identifiers are substituted into messages and the branches exist in code. The actual compatibility predicates, base-conversion algorithm, and offset computation are opaque callees. The advertised shape-preservation result is therefore message-level intent, not demonstrated geometry behavior.

`0x1420a9390`, `function-f0dcd354bb537ddecc10fbc6.json`, stores an ankle-compensation mode, invalidates/updates downstream state, and forwards the new mode when the associated solver object exists. This supports the presence of reactive compensation settings. It does not reveal ankle/contact correction math.

## Actionable independent requirements

1. **Stable morph/control presets with base identity.** Save channel IDs separately from display labels, category ordering, and values. Include a source geometry identity (stable vertex mapping plus geometry hash). Reject a preset with incompatible topology before any scene mutation; for a compatible topology with a differing base, give an explicit shape-preservation/working-copy choice. Implement any offset as original delta arithmetic, test the result numerically, and do not claim the CC conversion algorithm was recovered.
2. **Atomic dependency authoring.** Validate finite scalar/key data and cycles when adding a formula/control link, report the affected output and reference, and keep the previous dependency graph and geometry on failure. Current Fusion has evaluation-time cycle/unsupported-operation reporting; insertion-time validation would improve authoring behavior without reusing vendor code.
3. **Direct morphs and composite controls as distinct persisted concepts.** Keep original mesh morph channels independent from artist-created controls that drive multiple channels. Renaming/reordering a control must preserve dependencies, save/reload, keyframes, and reset behavior through stable IDs. This is a design derived from observed separate serialization collections, not evidence of a recovered proprietary solver.

No export reviewed here establishes proprietary mesh-deformation coefficients, skinning math, corrective generation, or complete DAZ/CC feature parity. No address from these two binaries should be reused for DAZ6 or another CC build.

## Independent implementation and verification

`src/morph-presets.js` now implements the first requirement as Fusion JSON format version 1, using SHA-256 identities of canonical original vertex IDs, oriented triangles, rest positions, and supported morph IDs. Presets contain authored channel values and presentation metadata; formula results and pose correctives are not captured as authored values. Applying or resetting selected IDs/categories changes only those authored values. Base/topology mismatch and target-limit mismatch block application. A differing morph/control set provides an exact-ID preview and requires explicit acceptance before applying the available subset. No display-name matching, native preset parsing, automatic base conversion, or compensation algorithm is claimed.

Nine tests in `tests/morph-presets.test.mjs` passed on 2026-10-15. They cover rollback after failed dependency evaluation, cancellation, mutation while awaiting fingerprints, input bounds, exact-ID remapping, group reset, pose/corrective/garment preservation, and unchanged original fixture bytes. An asynchronous preset plus dependent garment update produces one undo entry; undo/redo restore both, and garment failure/cancellation restore the prior scene without history entries. A 65,536-triangle synthetic character produces identical identities before/after material splitting (33,153 original vertices, 33,410 split vertices). A private Genesis 9 GLB roundtrip covers 25,182 original vertices and 50,312 triangles, including ordinary Three.js project serialization/reload. This is observed behavior of the independent Fusion implementation; it is not numerical comparison against DAZ or CC.

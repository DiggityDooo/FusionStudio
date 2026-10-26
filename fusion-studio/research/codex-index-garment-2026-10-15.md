# Marvelous selected-export evidence and original sewing measurements

## Evidence identity and bounds

Inspected the `MD-Marvelous` entry in `CursorWork/output-v2/CODEX_INDEX.json` and its existing output folder `MarvelousDesigner_Enterprise_Offline.exe-b7e3bb1c40a3-aff4e4b480ba`. No vendor process or new Ghidra export was run. QtWebEngine and the original exports were untouched.

- Binary: `C:\Program Files\Marvelous Designer Enterprise Network Offline\MarvelousDesigner_Enterprise_Offline.exe`.
- File/product version: `2026, 0, 315, 56650`; 194,124,096 bytes.
- SHA-256: `b7e3bb1c40a32ff90ce6c42f0e95ef2c6f3093c9cea926d6a66de70c12b31dc7`. A read-only hash of the installed binary matched the manifest.
- Ghidra 12.1.4; configuration SHA-256 `aff4e4b480ba42ee4ce81a35c38492c513c95064d496ecf6461f4ce9c02eea6a`.
- `COMPLETE.json` binds manifest SHA-256 `ee9e60acdceec7f9158383b36d191387c6b68049fa0ac969b1c080243cb5adc4`; measured manifest hash matched. All 64 function-record file hashes, binary/config bindings and success statuses matched the manifest; zero failed functions.
- **Coverage is a completed selected subset, not whole-program recovery:** 64 exported of 3,288 matched candidates; `selectionTruncated: true`. The 64 exported bodies, spanning `0x14004b8b0` through `0x140098510`, all construct Qt strings and register exit cleanup. They primarily expose static resource/preference initialization, not triangulation, sewing correspondence, or cloth-solver algorithms.

## Observed facts and unresolved questions

| Evidence | Static observation | Limit |
| --- | --- | --- |
| `function-b2b24fc4489d47827d5d568f.json`, `0x14004b8b0` | Initializes a preference/warning registry containing particle-distance and layer-message entries. | Does not establish particle-distance units, layer ordering, or solver mechanics. |
| `function-afdb59bb20d021abd9e8333a.json`, `0x14007ea00`; `function-5e622974fe42efe062c4d9f3.json`, `0x1400969f0` | Initializes fabric-specific inner/seam puckering resource paths. | Image resources are not physical fabric models. Assets were not copied. |
| `function-0c46f80d14e0c385869e7ac1.json`, `0x140098510` | Initializes a topstitch resource directory. | No topstitch geometry generation is recovered. |
| `selection.json`, string `0x1474caec0`; xrefs `0x144ac4ff0` at `0x144ac51a5`, `0x144b722d0` at `0x144b7b49b` | The artifact has a sewing-length checking action. Related display string `0x14757efd0` has an xref in `0x144b45310` at `0x144b453cd`. | Referenced bodies are outside the 64 exports. Measurement formula and tolerances are unknown. |
| `selection.json`, `0x1473638e0` and `0x1473638f0`; xrefs in `0x142682850` at `0x142684026` / `0x14268409b` | Separate sewing-direction and sewing-reversal field names occur in one candidate function. | Serialization semantics and orientation conventions remain unverified. |
| `selection.json`, `0x1474662a0` / `0x147467ff0`; xrefs `0x143d30360` at `0x143d303e3` and `0x143d40f80` at `0x143d40ffc` | Exposed API signature strings suggest per-pattern particle-distance getter/setter entry points. | No getter/setter body is in the selected set. This does not prove all patterns have independent resolution. |
| `selection.json`, `0x1474caef0`, xref `0x1441885b0` at `0x14418865c`; `0x1476047e8`, xref `0x14516a450` at `0x145171822` | Sewing-layer and M:N-sewing actions exist as UI labels. | They do not establish physical layer collision behavior or an M:N correspondence algorithm. |

The strongest candidate for further *targeted* analysis is the sewing-length action at `0x144ac4ff0`, following its callees only as needed. A second target is the direction/reversal serialization candidate `0x142682850`. Broad whole-binary re-export would repeat the current selection bias.

## Independent implementation targets

1. **Implemented: physical sewing-length inspection.** `src/patterns.js` exports `measurePatternSeams(doc, {tolerance})`. It measures authored line/cubic and partial ranges, identifies migrated seams/segments deterministically, reports both side lengths, signed A-relative-to-B ease, mismatch, length ratios, explicit orientation, endpoint correspondence and numerical error bounds. Its independently written adaptive de Casteljau subdivision bounds arc length using chord/control-polygon lengths. Default tolerance is 1 µm; depth and subdivision budgets are bounded, and exhausted budgets produce a diagnostic. No vendor pseudocode was translated or copied.
2. **Implemented: actionable sewing editor display.** `src/pattern-designer.js` shows A/B lengths in mm, signed delta/ease and warnings above 10% mismatch. Inspect buttons populate the existing range/direction controls and draw colored direction arrows for the selected seam, including hole/curved ranges. Canvas fitting includes curve control bounds. This exposes sewing direction; it does not add M:N sewing or a gathering solver.
3. **Future independent target: local fabric/resolution and seam correspondence.** Fusion currently uses document-wide fabric and particle distance in `patterns.js`/`hybrid.js`. Its seam pairs use shared sample counts and normalized segment parameter, rather than normalized arc distance, which can produce uneven correspondence when two cubic parameterizations differ. Per-panel resolution/fabric, arc-distance seam mapping and explicit layers would be useful original features. The current export does not reveal their vendor algorithms. These remain design/validation work, not implemented parity.

## Validation

- `node --test tests/seam-diagnostics.test.mjs tests/patterns.test.mjs tests/patterns-v2.test.mjs`: **14 passed**.
- The new six-test seam suite covers deterministic nonmutating legacy migration, exact analytic parabola arc-length comparison, error bounds, curved partial ranges, signed ease/orientation, hole segment IDs, malformed references/ranges and tolerance limits.
- Detailed original fixture: **137,106 triangles** versus **8,447 triangles** after changing particle distance. Authored seam diagnostics stayed exactly identical. Combined detailed builds took approximately 13.5 seconds; this is evidence of measurement independence, not a cloth-performance claim.
- Production source build and existing `node tests/pattern-v2-ui.cjs` desktop regression passed. A desktop probe passed legacy A/B display, selected orientation, switching panels, curved-range warnings, v2 range inspection and cancel without a scene change. Final screenshot was visually checked with the full curved seam and its arrow inside the canvas: `test-output/seam-inspection-editor.png`.
- Remaining limitations: this adds measurements and inspection, not arc-distance remapping, M:N seams, physical ease/gathering controls, layer collision ordering, per-panel materials, or a new cloth solver. The previous garment convergence warnings still apply.

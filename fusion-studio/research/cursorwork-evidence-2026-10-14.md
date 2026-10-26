# CursorWork evidence and exporter repair — 2026-10-14

This is a private reconstruction research record, not recovered source for the
Fusion distribution. No vendor pseudocode or private content was copied into
application source. Evidence IDs below are local ledger IDs, not REA-issued IDs.
Original vendor binaries and legacy dumps were read without alteration.

## Provenance and completeness

`cursorwork-provenance-2026-10-14.json` records exact dump paths, SHA-256, sizes,
and function header counts. `cursorwork-current-binaries-2026-10-14.json` records
the separately measured **current installed** input hashes and PE versions.
Legacy exports did not bind input hashes, so those two inventories must not be
treated as cryptographic proof that old output matches current installed bytes.

| Local evidence | Observation | Coverage |
|---|---|---|
| CW-DzCore.dll | DAZ Studio 6 Public Build target per legacy target manifest; 104,022 function headings, final heading has no body | Partial/unverified; function headings do not equal successful decompilations |
| CW-CharacterCreator.exe | Character Creator 5 target; 39,304 function headings | Export aborted mid-function on CP1252 UnicodeEncodeError |
| CW-MarvelousDesigner | Marvelous Designer Enterprise Offline target | Zero function headings; aborted while exporting strings |
| CW-blender.exe | Blender 5.1 target | Zero function headings; aborted while exporting strings |
| CW-DAZStudio.exe | DAZ 6 launcher target | Zero function headings; no completion proof |

The CC, MD, and Blender log files in `CursorWork/output/parallel_TempProject_*.log`
show Python `encodings/cp1252.py` exceptions. Ghidra subsequently reported its
own post-analysis/save success, which did not mean the Python export succeeded.
Old wrappers accepted any sufficiently large existing output and could select
an unrelated newest dump. Both behaviors are removed from the supported wrapper.
The original DAZStudio4/Blender5.2 application paths remain separate from these
DAZ6/Blender5.1 research targets. Never carry addresses across versions.

## Findings that can inform an original implementation

**DAZ formulas — partially answered, static pseudocode observation.**
CW-DzCore.dll contains `DzFormula::evaluate(int)` at `0x180033e56`, with exported
symbol `?evaluate@DzFormula@@QEBANH@Z`. Its pseudocode shows an operation switch,
temporary evaluation storage, and explicit diagnostics for divide, modulo,
inverse, and root domain errors. Defined strings at `0x182f96d88`,
`0x182f96db0`, and `0x182f96dd8` name constant, linear, and TCB spline operations.
The circular-ERC diagnostic is at `0x183076628`.

This corroborates implementing a bounded expression interpreter and explicit
dependency/domain diagnostics. It does **not** establish DSON opcode numbering,
all stack operand ordering, endpoint interpolation policy, ERC combination
rules, or identical results in DAZ4. Use format fixtures and independently
specified math for those; do not copy the decompiled evaluator.

**DAZ morph/control separation — partially answered, static pseudocode.**
`DzAssetIOMgr::loadMorphDeltas` at `0x180007392` validates an input object and
delegates to `loadMorphDeltasWithOptions` (also present at `0x1800b4736`).
`DzERCLink` construction at `0x180005e0c` associates a numeric property with a
controller scaling value. This supports keeping morph payload loading separate
from property dependency evaluation. Lazy-load caching, full sparse format,
HD deformation, and transfer behavior remain unverified.

**Character Creator controls — partially answered, strings only.**
CW-CharacterCreator.exe records shaping slider category (`0x14466fcb8`), minimum
and maximum (`0x14466fce0`), weight (`0x14466fd00`), and control-weight setter
(`0x14466fd30`) names. A diagnostic at `0x14468f830` describes compensating for
different source/target morph bases. These observations justify explicit control
metadata and topology/base compatibility checks as Fusion design choices.
No execution, actual setters' dataflow, or compensation algorithm was recovered.

**Marvelous patterns — partially answered, strings only.**
CW-MarvelousDesigner contains `ParticleDistance` (`0x14730df28`), internal-line
serialization (`0x147352650`), Bezier type (`0x14735cf00`), and an invalid sewing
segment diagnostic (`0x14735dc70`). These identify useful investigation seeds
and corroborate distinct boundary/internal/sewing concepts. They do not establish
mesh generation, sewing parameterization, constraint equations, or solver parity.
The legacy MD dump contains no decompiled functions; professional simulation
claims cannot be based on it.

## Repaired pipeline

- Preserved all legacy dumps and original `DecompileAll.py`. Backups of the old
  exporter and wrappers are in `CursorWork/backups/pre-v2-2026-10-14/`.
- New `DecompileFocused.py` supports names, exact entry addresses, and direct
  xrefs to selected defined strings. It writes UTF-8 atomic function checkpoints,
  per-function errors, selection evidence, and a completion manifest.
- `export_protocol.py` validates input identity, selection/configuration digest,
  counts, per-function hashes and provenance, and a hash-bound completion marker.
  Interrupted/failed exports remain partial; only verified successful function
  records are reused. Limits and truncated selections remain explicit.
- Wrappers write to `output-v2/`, use unique `projects-v2/` databases, restore
  process environment settings, and never accept arbitrary existing output.
- The REA connector currently has no configured Ghidra path, as confirmed by
  `binary_session` (no target open). Bundled Ghidra/PyGhidra is used directly;
  no global REA or system environment configuration was changed.
- QtWebEngine existing output, project, and job are deliberately untouched.

## Validation

Ten protocol tests passed: Unicode preservation/resume; per-function timeout
and retry; interruption recovery; input/config/count/marker mismatch rejection;
tampered checkpoint recovery; rejection of legacy/empty exports; configuration
change invalidation; internally inconsistent configuration digests, pseudocode
digests, and marker schemas. Python compilation and PowerShell parsing passed.

A real bundled **Ghidra 12.1.4 + PyGhidra** smoke analysis of the pre-existing
Windows whoami test target exported its single selected `entry` function.
Input SHA-256: `23240ef9f8b0a9a324110b1c2331de31dc1b0e08f5359cb707e51a939af56cd3`.
Result: `CursorWork/output-v2/whoami.exe-23240ef9f8b0-55b2aecedc28`.
A repeated identical wrapper invocation validated and reused that completed
export without launching Ghidra. The target program was not executed.

No new full vendor import was launched: existing DAZ pseudocode answered the
bounded architectural questions, while CC/MD require future focused xref work
when a specific implementation uncertainty warrants the large import cost.
The pipeline is ready for those requests, but vendor algorithm reconstruction,
runtime fidelity, and whole-program completion remain explicitly unresolved.

## Independent continuation audit

The preceding smoke job was confirmed finished before starting any new analysis.
After the three additional validator checks, a fresh Ghidra 12.1.4/PyGhidra run
successfully exported the same one-function smoke selection to
`CursorWork/output-v2/whoami.exe-23240ef9f8b0-ae45322866f8`. A repeated invocation
reused the verified result without changing the analysis log timestamp, and the
caller's five scoped environment variables remained unchanged. This smoke
validates exporter operation, not vendor algorithm behavior.

`cursorwork-revalidation-2026-10-14.json` records a fresh SHA-256 comparison of
all five legacy dumps and all five separately inventoried installed research
inputs: **10/10 unchanged**. This is a bounded preservation check, not a claim
that every installed file was inspected or that legacy dump provenance was
retroactively established. No old QtWebEngine process/project was modified.

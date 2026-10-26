# Ghidra Headless Decompile Pipeline

## V2 focused exports (2026-10-14)

The supported wrapper now uses `scripts/DecompileFocused.py` and writes only to
`output-v2/`. Original dumps and `DecompileAll.py` are retained unchanged because
an existing QtWebEngine job may still use them. Pre-upgrade wrappers/exporter are
backed up in `backups/pre-v2-2026-10-14/`. The legacy instructions below describe
the original layout; do not treat an old text dump as verified completion.

```powershell
# Function names are case-insensitive substrings. Addresses select exact entries.
.\bin\Run-GhidraDecompile.ps1 -BinaryPath 'C:\path\target.dll' -FunctionNames 'evaluate','morph' -MaxFunctions 64
# String terms select functions with direct references to matching defined strings.
.\bin\Run-GhidraDecompile.ps1 -BinaryPath 'C:\path\target.dll' -StringTerms 'spline_linear','spline_tcb' -MaxFunctions 32
python -m unittest discover -s .\tests -v
```

Each binary SHA-256 + selection/configuration digest has a separate directory.
The manifest records input file/product version, Ghidra version, selected and
successful function counts, errors, and per-record hashes. `selection.json`
records matched strings, source references, and selection truncation. `complete`
means the **bounded selected subset**, not the entire program. Use
`-AllFunctions -MaxFunctions <explicit-limit>` only when broad export is intended.

Failed functions remain explicit error records. Repeating the same request
resumes valid successes and retries failures. An interruption leaves `running`
or `partial`, never a valid completion marker. Completion validation checks the
current input hash, configuration, counts, checkpoint contents/hashes, and final
marker. File existence or size alone never qualifies. Input and library files
are read by Ghidra; vendor applications are not executed. Temporary analysis
projects use `projects-v2/` with unique names and are deleted by Ghidra on normal
exit. Re-analysis of the binary is still needed after an interrupted run because
the private Ghidra database is ephemeral; successful function exports are reused.

Java/Python/Ghidra environment overrides are scoped to the wrapper process and
restored afterward; no system PATH or REA connector settings are changed.
The original QtWebEngine project and process are not opened, stopped, or modified.

Legacy findings and limitations are recorded in
`../fusion-studio/research/cursorwork-evidence-2026-10-14.md`.

Self-contained setup under `CursorWork` only.

## Layout

| Path | Purpose |
|------|---------|
| `tools/ghidra/` | Prebuilt Ghidra 12.1.4 (analyzeHeadless + PyGhidra) |
| `scripts/DecompileAll.py` | Post-analysis export of strings + pseudo-C |
| `bin/Run-GhidraDecompile.ps1` | Windows wrapper |
| `prompts/binary_analysis_agent.md` | LLM analysis system prompt |
| `output/` | `*_decompiled.txt` dumps |
| `projects/` | Temporary headless project workspace |
| `samples/` | Smoke-test binaries |

## Requirements

- Microsoft OpenJDK 21 (system install via winget)
- Python 3.12+ with `pyghidra` (Ghidra 12 runs `.py` scripts via PyGhidra, not Jython)
- Ghidra under `tools/ghidra` (already extracted)

Install / reinstall the bundled PyGhidra wheel if needed:

```powershell
py -3.12 -m pip install --no-index -f ".\tools\ghidra\Ghidra\Features\PyGhidra\pypkg\dist" pyghidra
```

## Usage

```powershell
cd "C:\Users\Sean\Documents\ChatGPT\Ultimate 3D software\CursorWork"
.\bin\Run-GhidraDecompile.ps1 -BinaryPath "C:\path\to\target_binary"
```

Output: `output\<binary_name>_decompiled.txt`

Then feed that file to an agent using `prompts/binary_analysis_agent.md`.

## Notes

Ghidra 12 must be launched through PyGhidra for Python post-scripts. The wrapper uses:

`python -m pyghidra.ghidra_launch --install-dir <ghidra> ghidra.app.util.headless.AnalyzeHeadless ...`

Plain `analyzeHeadless.bat` alone will fail with: `Ghidra was not started with PyGhidra`.

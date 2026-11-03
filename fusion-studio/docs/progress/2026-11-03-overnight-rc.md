# Overnight candidate — November 3, 2026

User approved bounded `0.19.0-rc.1`: core workflows, editable imports/common DAZ presets, user-configured model profiles/chat, authenticated local MCP, separate Windows candidate and evidence. Existing dirty creator/sculpt/native/research work remains preserved and is not attributed wholesale to this execution.

## Current checkpoint

- Initial inventory: `test-output/rc-20261103/before.json`; 1,113 source/test/doc files, five original assets, 14 vendor files and 32 prior-release artifacts.
- Native rebuild: 47 pass, two existing opt-in diagnostics excluded.
- Model adapters: five HTTP fixture tests pass. Real Electron chat, cancellation, encrypted-key persistence/restart and seven-tool MCP discovery/authentication/revision/undo checks pass.
- DSON pose reference: baseline plus X/Y/Z, 101 source vertices per case; maximum error approximately `1.2e-6` meters against separately evaluated Blender DSON transforms.
- Combined diagnostic matrix: 42/42 pass at `test-output/import-matrix-eCmcdf/results.json`, including required 16 private DSON files and six Blender sources. Subsequent source-identity guard changes require final packaged repetition.
- Initial failed matrices and reference setup failures remain in `test-output/rc-20261103/`. Root reference originally omitted the hip's scene parent; corrected fixture retains strict tolerance.

## Implemented changes

DSF end-to-end routing; static preset classification/application; bounded missing-morph resolution; stable parent-node source mappings; owned material edits; OBJ MTL/texture inventory; missing DSON dependency statuses; import-time deformation state; FBX zero-time offset; root-joint Y-up metadata; isolated Blender test profiles and lifecycle-based native test waits.

Model/MCP modules live in main process and isolated preload interfaces. Model secrets use Electron safeStorage. MCP is disabled by default and uses authenticated localhost Streamable HTTP with seven allowlisted tools and document revisions. Third-party SDK/Zod and compatible fast-uri patch are locked; license inventory regenerated.

## Final candidate

`release-hackathon-20261103-rc1-final/win-unpacked/Fusion Studio.exe`, version `0.19.0-rc.1`. Default parallel gate: 1,191 pass, zero fail/skip. Native tests: 47 pass, two explicit private-input diagnostics ignored. Packaged matrix: 44 passing cases across 42 source files, including both BMW import modes. Packaged connections/MCP, sculpt/save/export smoke, independent DAZ poses, native rendering, modeling, glTF validation, patterns, drape recovery and male/female creator/garment/render workflows pass.

Visual review additionally fixed large-scene fog, saved active Blender scene selection, orphaned-object import and unskinned modifier evaluation. Morph/rig meshes retain base topology with explicit skipped-stack reports. Independent authored fixture verifies geometry, hierarchy, retained morphs, disabled source scripts and source hashes. BMW reference now independently opens actual saved file; CPU/OptiX comparisons retain strict pixel threshold. Old append-only reference failure retained. Frozen `rc1c` differs from tested `rc1b` only in reference harness and fingerprint bookkeeping; runtime remains byte-identical.

Scoped preservation: 51 original/vendor/prior-release files, 16 DSON fixtures/dependencies and 1,073 unrelated baseline sources pass; frozen source has zero unexpected changes. Toolchain hashes were first captured before freeze rather than initial implementation inventory; end hashes/timestamps verified against that capture.

User approved per-feature GitHub pushes to `https://github.com/DiggityDooo/FusionStudio`, branch `codex/overnight-rc1`. Feature commits pushed individually; private content, local settings, test outputs and builds stay local. Remaining unrelated docs and experimental C++ work preserved. No release tag, binary publication or hackathon submission.

Report: `docs/releases/2026-11-03-rc-report.md`. Guide, local fixture/result matrix, screenshots, receipts and hashes accompany portable executable folder. Live model providers remain unverified; cloth/portrait realism, advanced native/DAZ semantics and universal lossless roundtrips remain outside certification.

CCE recording attempts for implementation areas returned `Transport closed`; this log retains the checkpoint locally.

# Historical 0.1 investigation and build checklist

This ledger predates the clarified requirement for one interface, no switching, and all features. Current status is in `../FEATURE-COVERAGE.md` and `dson-support.md`. The complete feature-parity goal remains unfinished; this older ledger must not be read as fulfillment of that clarified goal.

Date: October 12, 2026 (America/Los_Angeles).

| Question | Status | Evidence / result |
| --- | --- | --- |
| Are the four requested installations present? | Answered | Exact executable checks; integrations.json; all four detected in both development and packaged UI tests. |
| Can Blender be driven without changing the install? | Answered | Actual Blender 5.2.0 LTS jobs with factory startup, disabled auto-execution and an isolated writable profile. Static identity: REA ev_93ebb17b278c76eccffe24e51daacde7881b6928f5b7ddbfe82939dbb266053e. |
| What can DAZ, Marvelous Designer and CC expose? | Partially answered | Installed plugins, scripts, SDK wrappers, presets and official format documentation were inspected. File handoffs are implemented. Live vendor plugin sessions were not executed or verified. See integration-findings.md. |
| Is there a usable unified program? | Answered for the implemented workspace | Native Windows app; live 3D editing; local project versions; materials; undo/redo; import/export; Blender mesh operations and render; guided tool launch/handoffs. test-output/ui-results.json and packaged-results.json. |
| Do exchanges execute? | Answered for synthetic static scenes | Runtime export to GLB/OBJ/FBX/BLEND; OBJ/FBX/BLEND re-import; source files unchanged; generated studio helpers excluded on return. test-output/integration-results.json and helper-roundtrip-results.json. |
| Does it reproduce proprietary engines in one process? | Outside the implemented architecture | It keeps those engines in their existing applications. Character generation, cloth simulation, proprietary shaders, controllers and vendor metadata are not recreated in Fusion's canvas. |
| Is an actual vendor character/garment round trip verified? | Unresolved | No user character or garment was supplied or selected. No existing personal scene was opened. Rig, morph, animation and material fidelity requires per-asset validation. |
| Were originals preserved? | Answered within stated audit coverage | No write commands targeted the installations. Size/path/mtime unchanged for 34,837 files; 15 selected SHA-256 checks match. preservation-verification.json states the exact limits. |

The clean application and integration layer were written from scratch. No disassembly or copying of proprietary implementation code was needed to establish this file-based architecture. Static PE resource evidence establishes identity and resources only; it does not establish application behavior. Dynamic Blender results establish only the actions and synthetic inputs actually tested.

## Validation artifacts

- `test-output/studio-ui.png`: actual desktop canvas screenshot.
- `test-output/ui-results.json`: UI workflow checks and zero renderer exceptions.
- `test-output/integration-results.json`: actual Blender operation outputs and measurements.
- `test-output/packaged-results.json`: packaged application IPC, worker, mesh operation, project save, render, invalid request, concurrency rejection and cancellation.
- `test-output/helper-roundtrip-results.json`: generated studio geometry excluded on BLEND re-import.
- `research/preservation-verification.json`: before/after original-installation comparison.

The final packaging pass after the packaged-operation suite changes only the installed-tool label and the project filename sanitizer. Blender's worker remains the version exercised by the packaged-operation tests.

# Fusion Studio 0.6.0 — IK rigging

The Character workspace now creates persistent hand/foot targets, two-bone pole controls and 3–8-parent iterative chains. Numeric controls and a viewport gizmo update the weighted character directly. Control addition warns about imported controller differences and animation baking. Rig edits use small channel/metadata deltas for undo, including FK and pose presets.

## Verified behavior

- Analytic two-bone target accuracy, pole response, constant segment lengths and weighted vertex deformation; uniform transformed owners and unreachable target handling.
- Longer-chain convergence, hierarchy-relative control paths through save/load and duplication.
- Mixed rig-delta and geometry-snapshot undo/redo; no geometry buffer retained per pose.
- Character-local target/pole/enabled keyframes and frame-by-frame export sampling. 24-frame real GLB reload has maximum hand-position error 3.12e-8 m in the fixture.
- Real viewport X-gizmo drag creates one undo command. Numeric target/pole edits, direct FK conflict and invalid scale rejection, export warning and project save/reload are exercised through Electron UI.
- Locally converted Genesis 9 with seven skinned material meshes reaches a hand target within 7.66e-8 m. This does not validate DAZ corrective/controller fidelity or all rig shapes.
- Export/import discovered and repaired excessive unused accessor vertices in split primitives. Index remapping retains UVs, weights and morph attributes. Imported clips now hold their last pose and scrub backwards correctly instead of wrapping at the terminal frame.
- Serialization computes missing geometry bounds before capture, eliminating a render-timing-dependent undo comparison.

## Limits

No joint limits, stretch modes, automatic weight painting/rigging, full-body IK, retargeting, facial rig systems or pole control on iterative chains. Active overlapping drivers and nonuniform/negative scale are rejected. Animated export samples each timeline frame through End, bounded to one million node/frame samples. The .fusion project retains editable controls; exchange files carry evaluated bones/morphs and omit control metadata. Morph curve authoring is still pending.

The parent goal remains active and full four-program parity is unfinished. BMW scenes supplied during this work exposed a separate visual-fidelity failure, documented in the BMW render note; successful image generation is not reported as equivalence.


## Release checks

`npm test`: 31 passed. Source UI v2/foundation passed; after fixing the bounding-sphere cache discrepancy, modeling, pattern and IK UI suites passed. Packaged IK passed with the same 24-frame and Genesis results. Source and packaged test reports are in test-output. The executable is `release-v0.6.0/win-unpacked/Fusion Studio.exe`; the parent workspace has Launch Fusion Studio 0.6.0.lnk. ASAR contains no copied vendor runtime, test output or retired DAZ launcher/helper. Installation preservation check: 34,837 records, zero changed/added/missing and 15 selected SHA-256 matches. BMW source SHA-256 and timestamps also match.
`tests/foundation-ui.cjs --packaged` and `tests/serialization-desktop.cjs` also passed on the packaged 0.6.0 build.

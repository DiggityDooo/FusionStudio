# Fusion launch film

Isolated Remotion 4.0.540 / React 19.3.1 workspace. Windows, Node 22, local packaged Fusion 0.19.0-rc.1, Blender and original fixtures required. App package dependencies remain separate.

```powershell
npm ci
npm run check
npm run capture
npm run capture:outputs
npm run prepare -- --capture local/capture
npm run studio
npm run preview
# Supply local Secret recording for final soundtrack:
npm run prepare -- --capture local/capture --music 'C:/Music/Secret.flac'
npm run render
npm run verify
node scripts/determinism.mjs
# After inspecting shot stills / transition strips and recording local/qa-review-pascal.json:
npm run finalize
```

Output capture records 450 fresh packaged-app viewport frames with deterministic orbit poses, plus verified native render and sculpt export. It uses last successful full capture, recorded in local/last-capture.json; FUSION_CAPTURE_RUN can select another verified capture folder.

Capture validates source hashes and actual operations, then records readable compatibility reviews in separate fresh session. Preparation imports footage, installed Windows fonts, captions and private music. Lifecycle markers drive trims for new captures; fallback cut windows are locked to inspected source hashes. Waiting-time edits are documented in provenance and labeled in film. `--preview` produces visibly marked silent picture review only. Final rendering rejects missing music. Assets, audio and captures stay local; only sanitized evidence and approved film exports belong in Git.

Workflow: [demo-video-creator](https://github.com/chacha95/demo-video-creator/tree/7947a8b4ee9b18c056945b16911bd229d9606251), MIT; see ATTRIBUTION.md. Story and captions are in source manifest; output is separate from original demo. Reproduction requires local DAZ Basic Wear MuscleShirt and matching black 3Delight preset, or original installed library at recorded source locations. No DAZ asset bytes are distributed.

Current edition follows measured [Pascal demo cadence](https://github.com/pascalorg/editor): nine short result shots, stable workflow proof, result recap/invitation. See SPEC.md. All 21 shot cuts and three internal wait cuts receive review strips; QA lives in local/qa-pascal.

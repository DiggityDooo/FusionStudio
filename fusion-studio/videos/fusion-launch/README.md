# Fusion launch film

Isolated Remotion 4.0.540 / React 19.3.1 workspace. Windows, Node 22, local packaged Fusion 0.19.0-rc.1, Blender and original fixtures required. App package dependencies remain separate.

```powershell
npm ci
npm run check
npm run capture
npm run capture:outputs
npm run capture:variety
npm run prepare -- --capture local/capture
npm run studio
npm run preview:direction
npm run preview
# Supply local Secret recording for final soundtrack:
npm run prepare -- --capture local/capture --music 'C:/Music/Secret.flac'
npm run render
npm run verify
node scripts/determinism.mjs
# After inspecting shot stills / transition strips and recording local/qa-review-launch.json:
npm run finalize
```

Output capture records 450 fresh packaged-app viewport frames with deterministic orbit poses, plus verified native render and sculpt export. It uses last successful full capture, recorded in local/last-capture.json; FUSION_CAPTURE_RUN can select another verified capture folder.

Variety capture adds 600 real viewport frames: BMW shaded and elevated wireframe angles, DAZ braided mesh hair rear view, and elevated optics wireframe. BMW scene floor, light cards and second car are hidden in working view only; original file remains unchanged. Mesh-hair viewport materials remain approximations. `local/variety/variety.json` records source hashes, camera settings and visibility for reproduction. `npm run capture:variety -- --preview` checks first camera poses without replacing prepared clips.

Expanded catalogue capture adds 750 poses across a shaded dragon, dragon wireframe, vintage trunk, handbag, and sci-fi crate. Source relative paths and hashes live in `src/catalogue.json`; set `FUSION_DAZ_LIBRARY` for another installed library root. `npm run capture:catalogue -- --preview` checks framing. `local/catalogue/catalogue.json` records import geometry, camera settings and source hashes. Whole steam-carriage scene timed out in exploratory preview and is excluded; these clips demonstrate imported appearance, not additional roundtrip certification.

Typing shots use manifest camera keyframes: 2.8x input-field close-up, pan to actual reply, and save-name detail before returning to viewport. Camera bounds checks prevent blank edges.

Capture validates source hashes and actual operations, then records readable compatibility reviews in separate fresh session. Preparation imports footage, installed Windows fonts, captions and private music. Lifecycle markers drive trims for new captures; fallback cut windows are locked to inspected source hashes. Waiting-time edits are documented in provenance and labeled in film. `--preview` produces visibly marked picture review, with music when prepared. Final rendering rejects missing music. Assets, audio and captures stay local; only sanitized evidence and approved film exports belong in Git.

Workflow: [demo-video-creator](https://github.com/chacha95/demo-video-creator/tree/7947a8b4ee9b18c056945b16911bd229d9606251), MIT; see ATTRIBUTION.md. Story and captions are in source manifest; output is separate from original demo. Reproduction requires local DAZ Basic Wear MuscleShirt and matching black 3Delight preset, or original installed library at recorded source locations. No DAZ asset bytes are distributed.

Current edition follows user feedback requesting a flashy launch demo: 39 shots, oversized masked type, fan-out asset cards, split comparisons, light sweeps, focused UI push-ins and paper-white undo accents. First 24.1 seconds can be rendered quickly with `npm run preview:direction`. All cuts receive review strips; QA lives in local/qa-launch. `npm run prepare:edit` syncs editorial changes after checking prepared media and music hashes, without re-encoding source footage. Full preparation remains required when changing captures or music.

Final render and chapter remux run in separate processes to release Windows render handles before writing delivery MP4. If only chapter packaging fails, retain completed `local/remotion-render.mp4` and run `npm run render:chapters`; then verify final output before finalizing.

## Continuous workflow recording

Separate from the cinematic trailer, `capture:workflow` drives one visible packaged-app session through DAZ import, compatibility review, framing/orbit/wireframe, numeric transform, undo/redo, save/reopen, validated GLB export, lighting and actual Cycles rendering. One CDP start/stop retains native timestamps and all waits. No source trims or speed changes; one Remotion video element adds a caption bar below the complete 1920 × 960 app capture. Output is 1920 × 1080 at 30 fps, silent. Gold pointer is a recording annotation. Only native file-picker paths and Explorer reveal are automated outside Fusion controls.

```powershell
npm run capture:workflow -- --rehearse
npm run capture:workflow -- --leave-open
# Capture writes its receipt before leaving Fusion open; render in another shell:
npm run render:workflow
npm run verify:workflow
```

Requires installed `Vehicles/Steam Powered Carriage/SteamPoweredCarriage Objects/SPowered Trunk.duf` matching `src/catalogue.json`; `FUSION_DAZ_LIBRARY` overrides library root. Private sources, fresh app data, raw frames and timestamp logs remain under ignored `local/`. Rendering rejects rehearsal receipts. Failed takes retain local evidence and never become public footage. Gallery and final delivery report describe observed conversion limits; this walkthrough does not extend release certification.

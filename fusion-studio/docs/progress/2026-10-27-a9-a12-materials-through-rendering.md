# Progress: A9 Materials → A12 Rendering (2026-10-27)

Status: **A9–A12 implemented and evidenced in development source. The 863-item goal is not complete.** Ledger snapshot after this pass: **863 items · done 191 · partial 116 · open 556**.

## What this block covered

Work continued from the user’s “continue to section 9” through Materials (A9), Lighting (A10), Cameras (A11), and Rendering (A12). Each area uses the Fusion pattern: renderer-side validation in Electron, optional sidecar JSON into the Blender job, application in Python, unit + Cycles + desktop UI evidence, and honest `docs/feature-ledger.json` statuses (done / partial / open with existing evidence paths).

## Delivered

### A9 Materials
- Surface materials module, inspector groups, presets (including Toon), shader bake path, Cycles Principled/Hair/Toon/Volume mapping via `surface_materials.py`.
- Evidence: `tests/materials-shading.test.mjs` and related shading UI/Cycles coverage already on the ledger.

### A10 Lighting
- Light kinds, mixer (sidecar-only, not double-applied into intensity), light groups, sun/sky, portals, barn doors, IES/gobo hooks, lighting sidecar → `lighting.py`.
- Evidence: `tests/lighting.test.mjs`, `tests/lighting.cjs`, `tests/lighting-ui.cjs`.

### A11 Cameras
- Perspective/ortho cameras, presets, rigs (dolly/crane/orbit/path), DOF blades, tilt-shift, ISO/WB/shutter, guides, JSON tracks, look-through; `cameras.js` / `cameras.cjs` / `cameras.py`.
- Lens compositor FX only when an existing compositor tree is present (empty Blender 5 compositor trees must not be created or PNG write fails).
- Evidence: `tests/cameras.test.mjs` (5), `tests/cameras.cjs`, `tests/cameras-ui.cjs`.

### A12 Rendering (this finish)
- **Engines / devices:** Cycles (direct assign; factory-startup enum can omit Cycles) and EEVEE; devices CPU / CUDA / OptiX / HIP.
- **Quality:** OIDN/OptiX denoiser choice, adaptive sampling, time limit, draft/preview/final presets, time estimate in the Rendering panel.
- **AOVs:** existing passes plus shadow, Freestyle wireframe/NPR, light groups from `fusion_group`.
- **Region / tiles:** normalized border region + Cycles tile size / out-of-core auto-tile.
- **Compositing:** shadow-catcher floor (existing) + per-object holdout (`fusion_holdout`) and viewport-only proxy (`fusion_proxy`).
- **IPR:** progressive viewport accumulation (Shift+F12 / panel toggle); not a second Cycles session.
- **Queue:** in-app still/animation queue runs through existing render operators.
- **Sequences / video:** PNG, JPEG, TIFF, EXR sequences; H.264 MP4; ProRes when Blender’s FFmpeg build exposes the codec.
- **Colour:** AgX / Filmic / Standard / Khronos PBR Neutral; ACES only if OCIO exposes a matching view transform.

## Evidence recorded (A12)

| Check | Result |
| --- | --- |
| `node --test tests/rendering.test.mjs tests/render-quality.test.cjs …` | Pass (unit + ledger audit in prior run) |
| `node tests/rendering.cjs` | **Rendering PASS** — Cycles, holdout `HoldoutPlate`, border, tile 64, NPR, light group `Key`, 2 JPEG turntable frames (`test-output/rendering-results.json`) |
| `npm run build` + `node tests/rendering-ui.cjs` | **Rendering desktop PASS** — holdout/proxy, EEVEE/HIP/NPR/region/IPR, JPEG output option, shadow/wireframe AOVs, queue + estimate (`test-output/rendering-ui-results.json`) |
| `node scripts/feature-ledger.mjs` | 863 · done 191 · partial 116 · open 556 |

## A12 ledger honesty (still open or partial)

| Item | Status | Why |
| --- | --- | --- |
| Render farm / Deadline / cloud | open | Not implemented |
| Network license management | open | Not implemented |
| Real-time hardware RT / Lumen / third-party engines | partial / open | Cycles + EEVEE only |
| Metal / Vulkan devices | partial | Not exposed |
| Custom OCIO config load | partial | ACES only if already in Blender’s config |
| Out-of-core beyond tiles | partial | Auto-tile only |
| Collection proxy / true render proxies | partial | Viewport wireframe proxy; full mesh still renders |
| Hair/volume as dedicated engines | partial | Materials + world volume exist |
| Stereo/VR HMD | partial | Camera extras into Cycles; no Live Link / HMD |

## What must be done next

1. **A13 continued / A14** — A13 armature slice landed (see `2026-10-27-a13-armature-rigging.md`). Remaining A13 opens: retargeting, ribbon/spline IK, muscle, jiggle, dynamic bones, control-rig graph, facial transfer, proxies. Then **A14 Skinning**.
2. **Do not mark the 863-item goal complete** until every remaining open/partial item has honest evidence.
3. **Optional A12 hardenings** (only if blocking users): ProRes encode smoke on this Blender build; EEVEE still Cycles-job regression; persistent-worker reload when `native_scene.py` changes mid-session.
4. **Continue sequential sections** (A14+ and remaining Part B B1–B14) with the same small-diff + evidence + ledger discipline.

## Key files touched (A12)

- `scripts/native_scene.py` — engine/device/region/tiles/holdout/NPR/light groups/settings
- `scripts/blender_worker.py` — sequence formats + ProRes/H.264; light-group stamp on lamps
- `electron/core.cjs` — validation for new render/animation options
- `src/render-ui.js`, `src/editor.js`, `src/main.js`, `src/keymap.js`, `src/foundation.css`
- `tests/rendering.test.mjs`, `tests/rendering.cjs`, `tests/rendering-ui.cjs`
- `docs/feature-ledger.json` — A12 statuses updated

## Goal reminder

Success criterion remains the full **863-item** reference in `3d-software-features-and-controls.md`, each proven in the ledger. A9–A12 closed a large rendering slice; **~556 open items** remain.

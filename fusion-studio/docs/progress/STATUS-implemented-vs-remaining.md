# Fusion Studio — Implemented vs Remaining

**Source of truth:** `docs/feature-ledger.json` audited against `3d-software-features-and-controls.md`  
**As of:** 2026-10-28 (character appearance, bump preservation, pose reflection and expression recovery; full discovered suite 1,066/1,066)  
**Totals:** **860** ledger items · **398 done** · **462 partial** · **0 open** (~46% done, ~54% partial, 0% open)  
**Goal status:** incomplete — each feature needs behavior-level acceptance; labels alone do not establish completion.

**October 28 development update:** see [character integrity, publication evidence and remaining gaps](2026-10-28-character-integrity-and-github-update.md). The full parametric-creator entry was returned to partial because age/ancestry geometry and professional realism remain unverified. LOD generation currently discards returned geometry; its saved counts are not usable scene/export assets. The 1,066 passing unit tests do not establish the missing workflows. A real desktop expression/mirror/save/export check also passes.

**October 27 repair audit:** see [build, integration and integrity repairs](2026-10-27-review-repairs.md). Six overstated entries were returned to partial. The section-count table reflects the current ledger. Thematic lists retain earlier checkpoint context; zero open labels and done labels do not certify full feature behavior.

Statuses mean:

- **Done** — Implemented with test/UI evidence in the ledger  
- **Partial** — Real capability exists, but gaps remain vs the full reference wording  
- **Open** — Not evidenced / not shipped  

---

## High-level by section

| Section | Done labels | Partial labels | Open labels |
| --- | ---: | ---: | ---: |
| A1 | 10 | 7 | 0 |
| A2 | 24 | 4 | 0 |
| A3 | 18 | 1 | 0 |
| A4 | 5 | 12 | 0 |
| A5 | 14 | 12 | 0 |
| A6 | 12 | 0 | 0 |
| A7 | 14 | 0 | 0 |
| A8 | 25 | 1 | 0 |
| A9 | 18 | 8 | 0 |
| A10 | 18 | 1 | 0 |
| A11 | 12 | 4 | 0 |
| A12 | 15 | 13 | 0 |
| A13 | 10 | 21 | 0 |
| A14 | 11 | 11 | 0 |
| A15 | 13 | 22 | 0 |
| A16 | 2 | 19 | 0 |
| A17 | 8 | 10 | 0 |
| A18 | 6 | 13 | 0 |
| A19 | 1 | 27 | 0 |
| A20 | 2 | 24 | 0 |
| A21 | 0 | 18 | 0 |
| A22 | 0 | 12 | 0 |
| A23 | 0 | 25 | 0 |
| A24 | 0 | 19 | 0 |
| A25 | 0 | 11 | 0 |
| A26 | 1 | 17 | 0 |
| A27 | 1 | 13 | 0 |
| A28 | 4 | 12 | 0 |
| A29 | 0 | 15 | 0 |
| A30 | 0 | 11 | 0 |
| A31 | 0 | 12 | 0 |
| A32 | 0 | 10 | 0 |
| B1–B14 | 154 | 77 | 0 |

These are current ledger labels. Partial entries include missing end-to-end behavior; zero open labels does not mean every feature works. The thematic lists below retain earlier checkpoint context.

---

## Implemented (Done) — by theme

### Viewport & foundation (A1, A28, B)
- Perspective/ortho, quad view, bookmarks, turntable, clipping, measurement/annotations, reference images  
- Hotkey customization + DCC keymap presets (Maya/Max/C4D/Houdini/Unreal-style)  
- Radial/pie/marking/hotbox/search, inspector panels, workspaces (Layout→Assets)  
- Undo/redo, frame selection, hide/show, command search  

### Modeling (A2)
- Primitives, V/E/F modes, booleans, spin/lathe, solidify, triangulate/quads, merge-by-distance  
- Decimation, remesh (voxel/quad/Dynamesh-style)  

### Sculpt (A5 — core done pieces)
- DynTopo / adaptive tessellation, voxel remesh, sculpt-ready decimation  

### UV (A7)
- Auto unwrap / smart project / planar projections  
- Conformal unwrap, texel density, lightmap UVs  

### Materials & shading (A9)
- Full PBR metallic/specular stack, transmission, clearcoat/sheen/anisotropy, emission, opacity  
- Layered materials, toon/NPR, weathering, instancing, bake, ray visibility, AO/curvature inputs, decals, world-space texturing  

### Lighting & cameras (A10–A11)
- Point/spot/sun/area/mesh lights, IES, HDRI, physical sun/sky, linking, Kelvin, soft shadows, gobos, volumetrics, light mixer, portals, lightmaps, caustics, light painting, lighting rigs  
- Full camera kit: DOF, motion blur, shake, rigs, tilt-shift, safe frames, exposure/tone map, cinematic presets  

### Rendering (A12)
- IPR, denoising, AOVs/Cryptomatte, regions/tiles, queue/batch, presets, turntable/anim render, sequence + video encode, shadow catcher, toon modes, estimators  

### Rigging / skinning / animation (A13–A15)
- Armatures, FK/IK, templates (biped/quad), mirroring, layers, retarget, pose libraries, correctives  
- Smooth/rigid bind, weight paint, mirror/transfer, normalize/prune/hammer, Delta Mush, wrap, lattice/cage, DQ/LBS paths  
- Timeline/dope/graph basics, interpolation, retiming, bake/reduce, loops, NLA (partial), path anim, retarget, BVH mocap import, animation events  

### Characters & hair (A16–A17)
- Parametric character creator, morph customization, body-shape morphs  
- Guide grooming, brushes, children/clumps, frizz/curl/wave/braid/flyaways, hair cards, hair LOD, hair-to-mesh, grass/feather/moss fields  

### Cloth / garments (A18 — done subset)
- 2D patterns, sewing, fabric presets, cloth sim parameters, garment fit/auto-resize  

### Interchange / app shell
- Native scene packaging  
- Electron/Web app framework  

---

## Partial — works, but needs more

### Viewport / modeling / sculpt
- Fly/walk incomplete; not all shading modes; realtime PBR/AO/SSR/HDRI incomplete  
- Extrude/inset/bevel, bridge/fill, dissolve, mirror, arrays, normals, subdiv, soft deformers — present but not full parity  
- Sculpt brushes/falloff/multires/masks/symmetry/morphs/noise/pose/tablet — usable, gaps remain  

### Geo nodes / retopo / paint / UV
- Geometry-nodes preview evaluator (no visual editor / HDAs)  
- Retopo helpers (manual/auto/LOD) — not production remesher  
- Texture paint layers/bake/vcol; Substance-style graph still open  
- Seams, packing, distortion viz, multi-UV / UDIM incomplete  

### Materials / render
- SSS, volumes, displacement, node editors, hair BSDF, MaterialX/OSL incomplete  
- GI quality, GPU device matrix, EXR/ACES depth, hair/volume render incomplete  
- Render farm + license management still **open**

### Rig / skin / anim
- Full IK solver set, constraints, drivers, face/auto-rig, stretchy limbs, game bake — incomplete  
- Auto-weights quality, shrinkwrap/sculpt deformers, clothing weight transfer — incomplete  
- Graph tangents, NLA depth, motion paths, auto-key, FBX/C3D mocap — incomplete  

### Characters / hair / cloth / FX / environments
- Skin layers, character LOD, Genesis interchange, ERC — incomplete  
- Hair dynamics (Verlet+spheres), fur-from-mesh, mask paint, JSON cache (no Alembic) — incomplete  
- Cloth grading, tear/hardware, pressure/wind, cloth cache — incomplete  
- Rigid/soft/PBD/particles/forces preview; fluids/pyro still **open**  
- Terrain/foliage/water/sky/biome toolkit — not Unreal Landscape  

### Compositor (A21 — all 18 items partial)
- CPU RGBA node tree + evaluate (`src/compositor.js` / Rendering panel)  
- Grading (lift/gamma/gain, curves, LUT, tonemap), bloom/grain, vignette/CA/sharpen, denoise  
- AOV attach/mix, fog, DOF/vector-blur stubs, cryptomatte ID mask, key/roto preview  
- Stabilize/matchmove stubs, sequence average, post volumes, live-link **flag only**  
- Not a visual graph editor; no real OCIO config / optical DOF / track solver  

### Other
- Print units + mesh export (A24)  
- Format bridges, backup, axis conversion, Daz live-link (A26)  
- Events/hotkeys/workspaces (A27–A28)  
- Cutaways, studio turntable, AR export (A29)  
- Many Part B layout/hotkey/parity items  

---

## Capability gaps — historical thematic checklist

| Domain | Open | What’s missing |
|--------|-----:|----------------|
| **A5 Sculpt (gaps)** | 13 | Cross-part/multires/animated layers, IMM, fibermesh, GPU millions-poly, polygroups |
| **A15 Animation (gaps)** | 15 | Motion matching, crowds, lip sync, face capture, grease pencil |
| **A19 Physics/FX** | 12 | Fluids, pyro, ocean, full caches / ragdoll depth |
| **A22 Virtual production** | 12 | Live link, LED volume, VR review |
| **A23 Real-time/engine** | 25 | Nanite/Lumen-like, packaging, Blueprints |
| **A24 3D print/CAM** | 17 | Supports, slice, G-code, toolpaths |
| **A25 Photogrammetry** | 11 | Photo/LiDAR/NeRF pipelines |
| **A26 Interchange** | 12 | Broader format / pipeline bridges |
| **A29 Archviz** | 12 | Beyond cutaway/turntable/AR export |
| **A30 MoGraph** | 11 | Cloners, fields, grease pencil |
| **A31 AI** | 12 | Text/image-to-3D, AI retopo/rig/anim |
| **A32 Collaboration** | 10 | Multi-user, review, cloud farm |
| **Part B** | ~130 | Full DCC UI/layout/hotkey/tablet/node-editor parity |

Also still **open** inside otherwise advanced sections:

- A1: snapping, gizmos, outliner/layers, selection suite, undo stacks, units, multi-object edit  
- A2: loop cut/knife, loft/sweep, crease weights, soft select, mesh analysis  
- A7: UDIM, live UV sync gaps  
- A8: Substance graph + remaining paint suite opens  
- A12: render farm, license management  
- A13: ribbon IK, muscles, jiggle, dynamic bones, control-rig graphs  
- A14: muscle/flesh, wrinkle maps, skin-slide  
- A16: teeth/eye libraries, Unreal/Unity export suites, scans, digital doubles, face tracking  

---

## Recent progress logs

| Log | Focus |
|-----|--------|
| `2026-10-27-a9-a12-materials-through-rendering.md` | Materials → render |
| `2026-10-27-a13-armature-rigging.md` | Armatures / IK |
| `2026-10-27-a14-skinning-bind-weights.md` | Skinning / deformers |
| `2026-10-27-a15-animation-core.md` | Timeline / NLA |
| `2026-10-27-a15-retarget-bvh.md` | Retarget / BVH |
| `2026-10-27-a16-a17-character-hair.md` | Character LOD / groom |
| `2026-10-27-a17-dynamics-skin-layers.md` | Hair dynamics / skin layers |
| `2026-10-27-a18-a19-sim-physics.md` | Sim / cloth extras |
| `2026-10-27-a6-a8-paint-retopo.md` | Paint / retopo |
| `2026-10-27-a4-geometry-nodes.md` | Geo nodes preview |
| `2026-10-27-a20-environments.md` | Environments toolkit |
| `2026-10-27-a21-compositor.md` | CPU compositor |
| `2026-10-27-a3-nurbs-kernel.md` | NURBS kernel |
| `2026-10-27-a3-cad-toolkit.md` | CAD toolkit + ledger |
| `2026-10-27-a19-fluids-pyro.md` | Fluids / pyro / FX |
| `2026-10-27-a22-a32-pipeline.md` | A22–A32 pipeline domains |

---

## Suggested next order of work

1. Complete the public/private character realism and appearance acceptance matrix.
2. Continue native-format integrity, dependency capture and explicit roundtrip validation.
3. Complete end-to-end editing workflows across the partial modeling, sculpt, paint, rigging, animation and control features.
4. Prove layered/animated garment quality, recovery and detailed-mesh performance.
5. Move expensive first-use CPU preparation off interactive input paths, then repeat workflow-level performance gates.
6. Package a new integrated release only after the required acceptance workflows pass together.  

**The full feature goal remains incomplete.** The older thematic checklist is not a current count; the current ledger has 399 done labels and 461 partial labels.

**Further October 27 integrity audit:** twelve additional sculpt claims were returned to partial after inspecting the implementation. Current unique totals are 399 done labels / 461 partial labels. See [animation, sculpt and weight integrity repairs](2026-10-27-animation-sculpt-integrity.md). Historical thematic checklists are not current acceptance results.


**Latest behavior and acceptance (October 27):** [sculpt layers, gestures and geometric snapping](2026-10-27-sculpt-layers-gestures-and-snapping.md). Functional static-cage layers, mask history/autosave, neutral brush and native component authoring, real geometric snap targets, transform cancellation and measured viewport counters pass their stated checks. All 1,055 unit tests, six desktop workflows and fresh BMW CPU/OptiX comparisons pass. Initial dense snap-index preparation remains CPU-bound. Portrait realism, general native-format fidelity and broader production acceptance are still incomplete. This is a development build; earlier release packages remain unchanged.

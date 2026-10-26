# Codex prompt — Unified excellence product (Fusion Studio)

Use this as the standing product brief for all Fusion Studio work. Prefer it over ad-hoc “clone everything / decompile everything” interpretations.

## Mission

Build **one** original desktop application — **Fusion Studio** — that wraps the *excellence* of four installed reference programs into a single workspace so the user never has to switch apps for the core pipeline:

**shape / pose a character → author / sew garments → drape on the posed body → model accessories → render the same scene.**

Do **not** aim to reproduce every menu, proprietary DLL, trademark, or vendor algorithm. Aim to deliver, in one Fusion-owned UI, the **jobs those products are best at**, with honest Exact / Compatible / Inspired fidelity labels.

## Reference installs (read-only; never modify)


| Program                               | Path                                                             |
| ------------------------------------- | ---------------------------------------------------------------- |
| Blender 5.2                           | `C:\Program Files\Blender Foundation\Blender 5.2`                |
| DAZ Studio 4                          | `C:\Program Files\DAZ 3D\DAZStudio4`                             |
| Marvelous Designer Enterprise Offline | `C:\Program Files\Marvelous Designer Enterprise Network Offline` |
| Character Creator 5                   | `C:\Program Files\Reallusion\Character Creator 5`                |


Preservation rules from `FUSION_STUDIO_WORK_LOG.md` remain in force: private profiles/temp/scripts only; track installation hashes; no packaging of vendor runtimes, paid assets, or decompiled pseudocode.

## What each program excels at (own these *capabilities* in Fusion)



### Blender — modeling workspace, mesh ops, non-destructive stack, final render

Excel at (Fusion must cover):

- Single professional viewport workspace (outliner, properties, modes, operators, undo)
- Mesh modeling and topology edits (component select/transform, extrude, split, dissolve, weld, …)
- Non-destructive modifier stacks evaluated from retained source
- UV / materials / sculpt progression toward production tools
- Animation foundation (keys, playback, export)
- **Hero rendering** via Cycles-class path (bridged worker is acceptable)

Do **not** prioritize: reimplementing every Blender editor, Geometry Nodes graph, or Cycles kernel in-process. Prefer the existing private Blender worker for heavy modifiers and preserved `.blend` renders until an owned path is proven.

### DAZ Studio — character assets, morphs, formulas, figure workflows

Excel at (Fusion must cover):

- Loading and posing production human figures (Genesis-class)
- Sparse morphs, limits, categories, search, keying
- Property dependency / formula / corrective evaluation with diagnostics
- Skin weights + skeleton evaluation feeding garments and export
- Compatibility warnings when topology / morph bases diverge

Do **not** prioritize: launching DAZ, embedding DzCore, copying Iray, or claiming HD/graft/shader parity without fixtures. Prefer direct DSON/DUF/DSF reading and user-exported golden meshes.

### Character Creator — shaping UX, preset reuse, production character controls

Excel at (Fusion must cover):

- Clear shaping / control UX (categories, limits, reset)
- **Reusable shaping presets** with base-mesh / topology / morph-set checks before apply
- Explicit remap review when control sets differ (exact IDs; no silent wrong-base apply)
- Character library / interchange into the same Fusion scene

Do **not** prioritize: cloning SkinGen/Headshot UIs, parsing undocumented project binaries as “done,” or shipping compensation algorithms copied from CC. Independent presets + fingerprints are the Fusion equivalent.

### Marvelous Designer — pattern authoring, sewing, fabric drape, fit diagnostics

Excel at (Fusion must cover):

- 2D pattern drafting (polygons → curved segments, holes, internals, darts)
- Sewing with orientation, partial edges, measurable length / ease / mismatch diagnostics
- Fabric presets and physics drape on the **current** posed character
- Strain, seam gap, clearance / penetration, mesh-quality inspection
- Linked regrade / re-drape when the body morphs or poses (hybrid spine)

Do **not** prioritize: claiming MD solver parity from string dumps, embedding MD executables, or labeling high-strain drapes “production ready.” Own XPBD / contact with visible diagnostics.

## Product shape (non-negotiable)

1. **One Fusion UI** owns the session. No required handoff into Blender / DAZ / MD / CC UIs.
2. **Hybrid spine first:** body change → pattern regrade → drape → render same document.
3. **Compatibility before loss:** warn or block before topology/rig/morph/native-scene damage; offer working / static copies.
4. **Original MIT code only** in the distributable app. Vendor pseudocode, paid assets, and CursorWork dumps stay private research.
5. **Honest labeling:** Exact (measured gate), Compatible (known loss), Inspired (Fusion-original). Never market “MD-identical cloth” without evidence.



## Implementation lanes (pick one per feature)


| Lane            | When                                               | Examples                                                                     |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Own**         | Core Fusion identity; must work without vendor UI  | Half-edge edits, morph presets, pattern schema, XPBD cloth, seam length math |
| **Bridge**      | Authorized installed tool already best-in-class    | Blender worker for modifiers / Cycles / preserved `.blend`                   |
| **Interchange** | Public or reliably observed formats                | DSON, GLB/FBX/OBJ, later USD                                                 |
| **Never**       | Needs proprietary host, DRM, or copied vendor code | Embedding CC/MD/DAZ DLLs; shipping decompiled evaluators                     |


If Blender already does a job well and the worker exists, **bridge it** until the hybrid spine forces an owned implementation.

## How to use reverse engineering (secondary only)

Private evidence may exist under `CursorWork/output-v2/` and `CursorWork/output-v2/CODEX_INDEX.json`.

Rules for Codex:

- Treat indexed exports as **bounded selected subsets**, not whole programs.
- Use them only to answer a **named unknown** that blocks an Own/Interchange task (feature presence, diagnostic wording, workflow seed).
- Translate findings into **original** Fusion behavior + tests.
- Do **not** schedule “decompile all four programs” as a milestone.
- Prefer public docs, Blender Python API, DSON JSON, and golden fixtures over new PE imports.

Research ledgers :  
`fusion-studio/research/codex-index-character-2026-10-15.md`,  
`fusion-studio/research/codex-index-garment-2026-10-15.md`,  
`fusion-studio/research/codex-index-modeling-2026-10-15.md`.

## Current baseline (do not regress)

- App root: `fusion-studio/`
- Status docs: `FUSION_STUDIO_WORK_LOG.md`, `fusion-studio/FEATURE-COVERAGE.md`, `fusion-studio/docs/ROADMAP.md`
- Delivered spine pieces through 0.10.0: retained-source modifier stacks, sparse morphs/formulas/correctives, shaping presets with fingerprints, pattern schema 2, XPBD cloth + seam length diagnostics, preserved Blender render path, schema-2 projects
- Gaps remain: retopology/NURBS/nodes, full sculpt/paint, exact vendor deformation/HD/grafts, native CC/MD projects, production layered/animated cloth, full animation/compositor editors



## What to build next (Codex default priority)

Always choose the highest unfinished item that strengthens the **unified excellence spine**, not random UI chrome:

1. **Character excellence (DAZ + CC strengths):** joint limits / weight editing / safer formula coverage / preset+pose libraries — fixture-gated against real Genesis assets the user owns.
2. **Garment excellence (MD strengths):** quality-constrained panel meshing, layered contact, grading from measurements, animated collider drape — diagnostics stay visible; no false “production ready.”
3. **Modeling excellence (Blender strengths):** deeper edit/sculpt/UV tools and stack coverage via Own kernel and/or Blender bridge; keep retained-source evaluation.
4. **Render excellence (Blender strengths):** keep/improve preserved Cycles path; expand lights/cameras/sequences without claiming Iray/V-Ray.
5. **Interchange:** broaden Exact/Compatible matrices; native CC/MD readers only when format research is solid — otherwise clear “cannot read” with Compatible export paths.

Each milestone must include:

- User-visible capability in the **one** Fusion workspace  
- Acceptance fixture + numeric/visual gate  
- FEATURE-COVERAGE update (Exact / Compatible / Inspired)  
- No vendor binary contents in packages  
- Preservation verification still green



## Explicit anti-goals

- Four bundled vendor UIs glued together  
- “Feature complete” claims without fixtures   
- Silent fidelity loss on morph bases, native scenes, or cloth quality  
- Shipping CursorWork `output-v2` function dumps or proprietary assets



## One-sentence north star for Codex

**Fusion Studio should feel like Blender’s modeling/render cockpit, DAZ/CC’s character shaping power, and Marvelous’s pattern-to-drape craft — in one original program that owns the hybrid character↔garment↔render loop and bridges or interchanges everything else with honest limits.**

## When you finish a slice

Update `fusion-studio/FEATURE-COVERAGE.md` and a dated note under `fusion-studio/docs/progress/`. Keep `FUSION_STUDIO_WORK_LOG.md` aligned with what is actually verified. Leave proprietary research out of release folders.
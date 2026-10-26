# 0.5.0 — polygon panels and static sewing

The user explicitly requested continuous work until the whole application is complete. The full-feature goal is active and remains unfinished. This is a verified Phase 6 slice brought forward to close the most obvious clothing authoring gap, not a declaration of Marvelous Designer parity.

## Built

- Version-1 pattern project stored in the scene: up to 16 panels, 64 straight-outline vertices per panel, placement/front-back orientation, edge pins, 64 full-edge seams, fabric/color, mesh subdivision and sewing/collision settings.
- Pattern & Sewing Editor: draw polygon panels, drag or numerically edit vertices, duplicate/delete/name/place panels, choose pinned edges, add/remove seams with edge direction, and apply or discard the draft. Panel editing is independent of the live scene until Apply; creation/update is one registered undoable operator.
- T-shirt starter with integrated sleeves and an open neck, cuffs and hem. The back shoulder edges anchor it; the front is free to sew against the back. Cotton, silk and denim presets are approximate solver settings, not measured textile models.
- Concave outline triangulation and shared-edge subdivision with planar UVs. Boundary chains retain indices for pins/seams. Seam springs are deduplicated and excluded where a face edge already exists. Maximum generated mesh is 60,000 triangles; adaptive/even-density triangulation is not yet implemented.
- Bounded, validated vertex/face/UV/seam/pin sidecar to the installed Blender worker. It reconstructs a cloth mesh with real loose-edge sewing springs and preserves index correspondence. [Blender's ClothSettings API](https://docs.blender.org/api/5.2/bpy.types.ClothSettings.html) documents the sewing settings used. No commercial host is launched.
- Static character collision and self-collision, authored pin groups, tunable sewing force/collision distance, smooth shading and baked thickness. The worker reports seam gap before/after and pin drift. The baked mesh retains its editable pattern document; editing it preserves the drape and creates a new pattern object.
- Pre-operation warning for static/rebuilt cloth, mismatched seam lengths, no pins and seam endpoints pinned apart. Crossing/touching outlines, missing/duplicate seam edges, nonfinite values and excessive meshes are rejected. A working copy preserves the authoring source. Cancellation and failure use the existing whole-transaction rollback.

## Verified

- `npm test`: 24 passing tests, including concave area preservation, matching boundary samples, seam deduplication, invalid geometry/references, world placement, sidecar validation and JSON roundtrip.
- `npm run test:ui`: existing workspace/foundation/modeling suites and `pattern-ui.cjs` pass. Actual controls draw/delete panels, select a T-shirt, edit fabric/pins, discard drafts, block a crossed outline, simulate with a body, undo/redo in one step, save/load pattern plus drape and preserve a baked source on edit.
- `npm run test:integration`: existing render/export/import/modifier/cloth suites pass, plus four real sewing fixtures. Rectangular cotton/silk/denim fixtures reduce average gap from 0.4 m to about 0.0555–0.0557 m; the intentionally separated pinned endpoints explain the residual and produce a preflight warning. On the T-shirt/character fixture, 68 unique springs reduce mean gap from 0.44 m to 0.00837 m after 80 frames, with zero measured pin drift. This is approximate closure, not a watertight welded result.
- Geometry/fabric differences are measured; screenshots are captured and inspected in `test-output/pattern-drape.png` and `test-output/pattern-designer.png`. Final packaged screenshots/reports use the `-packaged` suffix.

Initial visual inspection showed excessive seam gaps and flat facets. Increased sewing force, correct duplicate-spring removal, appropriate pin placement, collision-distance controls and smooth cloth normals improved the result. No claim is made that all garment/body combinations are robust or penetration-free. A completed solve is not proof of fit.

## Still required

Curved outlines, holes, internal lines, sewing subsegments, darts, seam allowance, grading, layers, fabric calibration, evenly sampled/adaptive remeshing, stitch visualization, quantitative penetration tests, animated colliders and native MD formats. The UI remains a modal pattern editor rather than a fully dockable 2D area. All other feature gaps remain in FEATURE-COVERAGE.md. Next character subphase: working IK posing with persistent target controls and deformation tests.

Release path: `release-v0.5.0/win-unpacked/Fusion Studio.exe`. Project schema stays version 1; the new pattern document is versioned separately. No dependency or license changes and no publishing.

Release verification completed: packaged pattern workflow, foundation/Cycles and serialization suites passed. ASAR contains the new sidecar validator and excludes private runtime/test/vendor content. `Launch Fusion Studio 0.5.0.lnk` is in the parent workspace. Preservation check: 34,837 installation records, zero changed/added/missing, all 15 selected file hashes match. Prior releases remain intact. The active full-feature goal is not marked complete.

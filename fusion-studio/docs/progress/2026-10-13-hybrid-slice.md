# 0.8.0: first native body/pattern/drape slice

The user requested execution of the Hybrid 3D Roadmap. This release starts its native geometry and body-to-garment foundation. It does not finish the roadmap or the overall all-feature goal.

## Behavior

Create a live-fit character and T-shirt in Character or Clothing. The compatibility dialog explains static-pose/proxy collision limits before creation. Original panel points, seams, fabric and pins remain in the project, linked to the character's stable ID. Body control changes rebuild the character, grade those original panels and solve a new drape. Pose presets re-drape in the current pose. Both objects update in one history transaction; errors restore the previous body and garment. Save/reload retains the relationship and can reproduce the original drape after a height roundtrip. Re-drape is also available explicitly in Clothing. The displayed mesh uses the existing Cycles render path.

The source pattern is placed around the body before solving, while stretch constraints retain authored flat-panel rest lengths. Shoulder pins meet at the shoulder plane; seams close gradually. This avoids the initial failed result where a flat front panel collapsed behind the body. Tests now check front AND back torso coverage, in addition to seam convergence.

## Implementation

- `native/src/lib.rs`: bounded triangle half-edge adjacency, winding/manifold checks, connected components, XPBD stretch/opposite-vertex bending/seam constraints, pinned vertices, gravity/damping, ellipsoid collision proxies with AABB rejection and triangle/edge samples, spatial-hash vertex separation. This is a first foundation, not the full topology kernel.
- `electron/geometry*.cjs`: napi-rs native addon in a dedicated worker thread, explicit method allowlist, 8 MB input limit, work limits, result/error handling, cancellation and timeout. A native solve may finish its bounded work before worker termination takes effect.
- `src/hybrid*.js`: retained authoring data, deterministic grading, posed character collision proxies, transactional scene replacement and user controls.
- `src/character.js`: collision-proxy descriptors travel with original Fusion characters. Imported figures are not automatically treated as supported collision rigs.
- Build uses a project-local Rust/GCC toolchain without global PATH changes or vendor install writes. Napi-rs 2.x is pinned because the attempted 3.x Windows GNU setup required a separate libnode DLL. No vendor implementation was copied.

## Measured preview scope

The default fixture is 882 vertices / 1,536 triangles. The latest reviewed run reduced mean seam gap from about 69.36 mm (the wrapped starting placement) to 0.0203 mm. Mean absolute edge strain was about 1.83%, with zero pin drift and zero vertices inside the uninflated body proxies. Maximum local strain was approximately 32.3%; a relaxed pose reached about 74.7%, so this is NOT production fabric acceptance. Re-fit takes about 1.2–1.3 seconds on this PC; runtime varies. The roadmap's interactive 50k-triangle target remains unachieved.

Earlier visual checks found shoulder clipping and 211% local strain. Conservative limb capsules and a wider neckline improved the reviewed default shirt, and a median-split BVH reduced collision-query time. Local strain remains at the neckline and in poses. Zero vertex penetration does not prove triangle-level collision correctness. Collision proxies approximate the character components; self-collision is vertex separation, not robust triangle contact. The bending constraint is an opposite-vertex distance approximation, not a dihedral material model. Shear/pressure/friction material models, holes/darts/curves, grading rules beyond proportional fitting, arbitrary imported-body fitting and continuous animation are pending.

Re-fit is automatic when the body slider change is committed, not on every pointer movement. Pose presets re-fit; manual joint/IK/timeline/object transform changes require explicit re-drape. The linked pattern editor opens original panels at a clearly labeled 1.8 m reference size. Apply regenerates the same garment with undo/rollback; Cancel discards the draft. Continuous re-drape during pointer movement is still pending. Strain colors persist through save/reload; turning them off removes the color attribute so ordinary export/render keeps the fabric color. Native seam compliance and 3 mm clearance are fixed, so the corresponding pattern controls are disabled for linked garments. Multiple linked garments are handled serially; moved garment-root transforms must be reset before re-fit.

## Validation and evidence

- `tests/hybrid.test.mjs`: native connectivity and invalid topology, reversible grading, repeated-output determinism, pinned/seam/coverage/mean-strain gates, height response, posed collider serialization and worker cancel/recovery.
- `tests/hybrid-ui.cjs`: actual desktop compatibility/cancel flow, creation, body re-fit, one-step undo/redo, save/reload with re-fit, pose presets, injected native failure rollback and final-render invocation. Packaged mode checks the native binary loading from the release.
- Existing 33-unit suite passed after character metadata and UI integration changes.
- Three Rust tests pass, including 1,000 BVH-vs-linear query comparisons. Five native/JS hybrid tests pass. The reviewed default mesh has SHA-256 `064ec3625af66b631a2b09c805d5f39e7c529f09c461f94c10ac885442f04f93` after one-micrometer quantization. A changed hash requires inspection, not an automatic golden update.
- Linked pattern edit/cancel, stable object identity, undo/redo, strain view save/reload and hidden-color removal are exercised by the desktop test.
- `test-output/hybrid-ui-results.json`, `hybrid-packaged-results.json` and corresponding screenshots record the latest desktop runs. Only an existing report with `passed: true` confirms its run; an unexecuted check is not evidence.
- Original install preservation checks and package exclusions remain required at release time.

## Technical sources

Native bridge setup follows [napi-rs documentation](https://napi.rs/docs/introduction/manual-setup); the pinned 2.x build behavior was checked against the upstream tagged code. Private compiler setup follows [Rust Windows installation guidance](https://rust-lang.github.io/rustup/installation/windows.html). These are implementation references, not claims of feature parity.

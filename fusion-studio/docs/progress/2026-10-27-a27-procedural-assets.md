# A27 procedural asset generators — 2026-10-27

## Kernel

New `src/procedural-assets.js`: parametric hard-surface generators
emitting indexed meshes in the repo convention (`{positions:
Float32Array, indices: Uint32Array, normals: Float32Array}` with
area-weighted vertex normals).

- `generateStairs({steps, width, tread, riser})`: solid staircase of
  full-height step blocks; total height `steps*riser`, run
  `steps*tread`, volume `width*tread*riser*n(n+1)/2`.
- `generateGear({teeth, radius, toothDepth, thickness})`: extruded
  trapezoidal-tooth gear (4 outline points per tooth, root radius
  `radius`, tip radius `radius+toothDepth`) with center-fan caps and
  separate side ring so cap/side normals stay distinct.
- `generateFence({length, height, postEvery, ...})`: posts at spacing
  intervals plus an end post when the length divides evenly, rails at
  fractional height levels; returns `meta.postCount/railCount`.

Two defects were caught by the tests during development: a back-cap
fan anchored to a ring vertex (fixed index capture order), and a test
assertion that wrongly expected a tooth tip on the +X axis (corrected
to max radial distance — the kernel was right).

## Verified (tests/procedural-assets.test.mjs, 3/3)

Exact bounding dimensions; signed-volume (divergence theorem) matches
analytic values for stairs, gear (shoelace outline area × thickness,
bracketed between root and tip cylinders), and fence (post + rail box
volumes); vertex/index counts; unit normals and index ranges; sparse
post spacing (`floor(3.5/2)+1`); parameter validation errors.

## Ledger

`A27 Procedural asset generators` gains
`tests/procedural-assets.test.mjs`. Stays partial: three generator
families verified — no generator UI or parameter-panel wiring yet.
Backup refreshed (test-output/kernel-backup-2026-10-27).

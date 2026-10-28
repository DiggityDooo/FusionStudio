# A21 compositor deepening — 2026-10-27

## What was there

`src/compositor.js` (from the earlier sweep) had the full node/effect API
surface, but `tests/compositor.test.mjs` (35 lines) mostly asserted that
outputs exist. Inspection found real math gaps and two dishonest stubs.

## Fixes in src/compositor.js

- `applyLut`: nearest-lattice sampling replaced with trilinear
  interpolation (an identity LUT now reproduces its input exactly).
- `bloom`: rewritten as bright-pass + separable binomial blur + additive
  composite. The old version added source pixels into the buffer it was
  still reading (order-dependent feedback). New version is exactly gated
  by threshold, symmetric, and energy-true.
- `chromaticAberration`: now radial on both axes (the vertical coordinate
  was computed and discarded).
- `defocusDof`: real circle-of-confusion mix against a blurred image
  (was an alias of the denoiser that ignored depth falloff shape).
- `vectorBlur`: real 5-tap directional smear along the motion-vector AOV
  (was also an alias of the denoiser; zero vector is now exactly identity).
- `rotoShape`: even-odd point-in-polygon rasterization (was a bounding-box
  fill, as its own comment admitted).
- `evaluateCompositor`: evaluates in link topological order (Kahn, stable
  by insertion) and throws on link cycles; previously it ignored links and
  used raw insertion order.
- `matchmoveCamera`: no longer fabricates `solved: true` with a made-up
  camera. It returns track diagnostics (count, centroid, spread) with
  `solved: false` and a reason. This changes the contract asserted by the
  old shallow test; that assertion was updated deliberately, and the
  reason is recorded here: a solve claim without per-frame tracks,
  intrinsics, or bundle adjustment violates the project's evidence rules.

Untouched but verified correct: lift/gamma/gain formula, ACES/Reinhard
values, tone-curve behavior, .cube round-trip, sharpen/denoise impulse
responses, exponential Z fog, cryptomatte/keying mattes, sequence average,
stabilize translation, post-volume exposure path.

## Verified (tests/compositor-math.test.mjs, 16/16; existing suite 2/2)

Analytic oracles throughout: CDL formula values, ACES(1) = 2.54/3.16,
identity-LUT exactness (fails under the old nearest sampler), bloom energy
= strength × bright-pass energy, sharpen negative lobe −0.125, fog factor
1 − exp(−zd), concave roto notch excluded, vector-blur tap means, focus
depth pixel-exact sharpness, link-order evaluation differing from insertion
order, cycle rejection.

## Ledger

Nine A21 items gain `tests/compositor-math.test.mjs` (node compositor,
grading, glare/bloom, DOF/motion blur, Z fog, cryptomatte, keying/roto,
LUT I/O, vignette/CA/sharpen). All stay partial: this is still a CPU
preview compositor — no GPU viewer, OCIO pipeline, or real matchmove.
Backups refreshed (test-output/kernel-backup-2026-10-27).

## Next

Largest remaining partial blocks: A23 real-time engine (25), A20
environments (24), A15/A13 animation/rigging (43 combined), B6 (21),
A24 print/CAM (19). Continue with whichever kernel slice verifies deepest;
A20 environment/sky math (sun position, atmosphere approximations, HDRI
sampling) is highly oracle-friendly.

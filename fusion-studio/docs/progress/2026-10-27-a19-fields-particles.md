# A19 force fields + particles — 2026-10-27

## Kernels

`src/force-fields.js` — serializable field descriptors, one sampler
(`fieldVector(field, point, t)`, `combinedFieldVector` for superposition):

- gravity, wind (with sinusoidal gusts), vortex (tangential, speed peaks at
  the core radius, 1/r falloff outside), attractor (softened inverse-square,
  negative strength repels), radial (constant-magnitude blast/sink), and
  curl-noise turbulence from a seeded gradient-noise potential.
- `fieldDivergence` numeric probe for field QA.

`src/particles.js` — fixed-capacity pool (dense alive range, swap-remove
death), deterministic seeded emission (cone spread, speed/life jitter),
semi-implicit Euler under any field list, exponential drag, plane and sphere
colliders with restitution + tangential friction.

## Verified (tests/force-fields.test.mjs, 6/6)

- Gravity/wind vectors exact, including gust phase.
- Vortex is exactly perpendicular to radius and axis; speed at r = core is
  strength/(2·core) to 1e-9; falloff log-symmetric.
- Attractor magnitude ratio between r = 1 and r = 2 is exactly 4
  (inverse-square); singular point safe; negative strength repels.
- Curl noise: live (max |F| ≈ 2.5), deterministic per seed, and its measured
  divergence converges to ~3e-5 as the sampling step shrinks. The
  finite-difference curl's raw residue is O(EPS² · potential''''), so EPS was
  tightened to 0.002 — the kernel comment states the honest bound instead of
  claiming exact cancellation.

## Verified (tests/particles.test.mjs, 7/7)

- Free fall matches the semi-implicit Euler closed form to Float32 storage
  precision (positions/velocities are Float32, the app mesh convention).
- Drag reaches the analytic terminal velocity g/drag within 1%.
- Plane bounce: no penetration ever, rebound apex ≈ e² · drop height,
  friction cuts tangential velocity on contact.
- Attractor orbit at the analytic circular speed stays in a tight radius
  band and sweeps > 2 rad. (An earlier super-circular start produced the
  eccentric apoapsis 5.4 predicted by the energy integral — kernel right,
  test fixed.)
- Lifespan death frees slots exactly on schedule; capacity caps emission;
  same-seed runs are bit-identical; curl-advected particles stay finite.

## Ledger

`A19 Wind, turbulence, vortex and force fields` and `A19 Magnetic,
gravitational and custom field forces` gain `tests/force-fields.test.mjs`;
`A19 Particle systems: emitters, forces, collisions, lifespan, instancing`
gains `tests/particles.test.mjs`. All stay partial: no instanced rendering,
no SPH/FLIP liquids, no GPU fields, no UI wiring. Backups refreshed
(test-output/kernel-backup-2026-10-27).

## Next

An XPBD constraint kernel (distance/bend constraints, substeps) would give
verified depth to `A19 Vellum-style position-based dynamics`,
`A19 Rope, chain and cable simulation`, and the cloth family — or SPH
particles for `A19 Fluid/liquid simulation`. Ledger order suggests
continuing A19 depth before returning to Part B parity.

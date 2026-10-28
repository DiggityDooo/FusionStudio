# A14 dual quaternion skinning (2026-10-27)

Kernel: `src/dual-quaternion.js`. Tests:
`tests/dual-quaternion.test.mjs` (3/3).

Dual quaternions `{ real, dual }` (dual = ½·t·q) built from
joint rotation/translation pairs, sign-aligned weighted
blending, translation extraction, and point transformation —
plus `skinVerticesDQS` / `skinVerticesLBS` over the packed
influence layout from `src/skin-reduce.js` so the two skinning
methods compare on identical inputs.

Exact oracles: both methods reproduce a single rigid joint
transform; in the candy-wrapper setup (50/50 blend into a 120°
twist) DQS lands exactly on the 60° point of the unit circle
while LBS lands on the chord midpoint with radius exactly
cos(θ/2) = 0.5, collapsing to zero radius at 180° where DQS
stays on the circle; blending a dual quaternion with its own
negation returns the same transform (sign alignment); pure
translation blends interpolate linearly in both methods.

Limits: rigid joint transforms only (no scale/shear — dual
quaternions cannot represent them), bind-pose/inverse-bind
composition is the caller's scene-graph job.

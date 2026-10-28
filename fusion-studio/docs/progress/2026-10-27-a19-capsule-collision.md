# A19 capsule collision (2026-10-27)

Kernel: `src/capsule-collision.js`. Tests:
`tests/capsule-collision.test.mjs` (4/4). The ragdoll kernel
previously collided spheres only; this adds the capsule shape
end to end: closest points between spine segments, contact
generation, and positional correction.

Pieces:
- `closestPointsBetweenSegments` — Ericson's segment-segment
  algorithm; near-parallel spines pick the center of the
  overlapping projection interval (an endpoint pick would only
  rotate the capsule under correction). Degenerate segments act
  as points.
- `capsuleContact` / `capsuleSphereContact` /
  `capsulePlaneContact` — depth, normal, contact point, and spine
  lever parameters; concentric spines get a deterministic
  fallback normal.
- `applyPairCorrection` — gradient-weighted PBD distribution:
  endpoint weights (1-s, s), effective inverse mass
  w·((1-s)² + s²) per capsule, λ solving the penetration along
  the normal in one application for the rigid modes. The pair's
  spine midpoint is conserved for equal masses; static capsules
  (invMass 0) never move.

Oracles: analytic closest-point configurations (skew, crossing,
endpoint-clamped, parallel, degenerate); parallel-capsule overlap
0.5 separates to exactly touching; tip contact moves only the tip
endpoint; a dropped capsule settles with its spine at radius
height, spine length preserved, residual penetration < 2 cm at
the solver's working tolerance.

Limits: positional (PBD) response only — no friction, restitution,
or angular inertia beyond the two-particle spine model; ground is
a single Y plane; broad-phase is the O(n²) pair enumeration in
`capsuleContacts`.

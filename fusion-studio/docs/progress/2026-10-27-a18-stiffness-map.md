# A18 cloth stiffness weight maps (2026-10-27)

Kernel: `src/stiffness-map.js`. Tests:
`tests/stiffness-map.test.mjs` (4/4).

Per-vertex stiffness painting for cloth: `paintWeights` applies
a spherical brush (smooth/linear/constant falloffs; add, subtract
and set modes; clamped to [0, 1]) over vertex positions,
`adjacencyFromIndices` + `blurWeights` diffuse the map across the
mesh (Jacobi steps, a convex combination so the value range never
grows), `remapWeights` applies gamma/invert, and
`complianceProfile` converts edge-averaged weights into XPBD
constraint compliance on a geometric scale between the soft and
stiff ends.

Exact oracles: falloff values at quarter points (smooth gives
0.84375 at t=0.25, linear 0.75); saturation, subtract, and set
modes hit their exact targets; the first blur step of a spike is
exactly [0, 0.25, 0.5, 0.25, 0]; compliance hits 1e-4 / 1e-6 /
1e-8 at weights 0 / 0.5 / 1. Behavior check through the real
solver: an XPBD hanging chain whose top half is painted stiff
settles with less than half the stretch of an all-soft chain in
the painted region, while its unpainted region matches the
baseline.

Limits: weight maps and their solver mapping only (no painting
UI, no texture-space maps), compliance is per-edge from vertex
averages, no anisotropy (warp/weft) directions.

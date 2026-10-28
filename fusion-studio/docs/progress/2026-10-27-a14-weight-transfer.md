# A14 proxy weight transfer for clothing (2026-10-27)

Kernel: `src/weight-transfer.js`. Tests:
`tests/weight-transfer.test.mjs` (4/4). Evidence added for
`A14 Proxy-based weight transfer for clothes` and
`A14 Fit and weight transfer for clothing to a character`.

Transfers packed skin weights from a source (proxy/body) mesh
to garment target vertices: closest point on the source surface
(Ericson's point-triangle regions) with barycentric blending of
the corner weights, renormalized into the packed layout.
Targets beyond a distance cap fall back to the nearest source
vertex's weights and are counted, so bad fits surface in the
stats instead of silently smearing.

Exact oracles: face/edge/vertex closest-point regions return
exact barycentric coordinates; identity transfer reproduces the
source weights; a target over a triangle centroid receives the
exact corner average; a uniformly offset garment shell keeps
the underlying weights and reports exactly the offset distance;
the far-target fallback copies the nearest vertex and is
counted in the stats.

Limits: brute-force triangle search (proxy-scale meshes; the
BVH in `src/bvh.js` is ray-based, not closest-point), no
normal-direction or UV-space correspondence, fallback is
nearest-vertex rather than smoothed.

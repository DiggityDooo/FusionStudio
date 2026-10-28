# A17 melanin hair shading (2026-10-27)

Kernel: `src/hair-shading.js`. Tests:
`tests/hair-shading.test.mjs` (4/4).

A Principled-Hair-family shading model: two pigment endmembers
(eumelanin, pheomelanin — defaults after Chiang et al. 2016,
exposed as overridable parameters) mix into an absorption
coefficient by melanin load and pheomelanin ratio; strand albedo
follows Beer-Lambert attenuation `exp(-sigma * path)`.
`strandAlbedoGradient` interpolates pigment parameters from root
to tip (the physical route — weathered tips carry less melanin)
rather than lerping reflectance. The anisotropic highlight is
the Kajiya-Kay lobe `pow(sin(angle(tangent, half)), shininess)`.

Law-based oracles (independent of the chosen endmember digits):
zero melanin is exactly white; doubling melanin squares the
albedo per channel; doubling path length does the same; blue is
absorbed first so dark hair reads warm; pheomelanin is lighter
than eumelanin at equal load; gradient endpoints are exact and
per-channel monotone, and provably differ from a naive albedo
lerp; the Kajiya-Kay lobe is exactly 1 perpendicular to the
tangent and exactly 0 along it.

Limits: absorption/albedo model only (no multiple-scattering
R/TT/TRT lobe separation, no glints, no fiber geometry), single
path length rather than diameter-distributed paths.

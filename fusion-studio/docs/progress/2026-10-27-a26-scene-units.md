# A26 scene units & axis conversion — 2026-10-27

## Kernel

New `src/scene-units.js`: frame and unit conversion for interchange.

- Frames `maya` (Y-up RH), `blender` (Z-up RH), `unity` (Y-up LH),
  `unreal` (Z-up LH) are defined by their basis vectors in one
  canonical frame; `conversionMatrix(from, to)` is the orthogonal
  basis-change `B_dstᵀ · B_src`.
- `flipsWinding(from, to)` reports determinant sign, so mirrored
  conversions never silently mirror geometry.
- `convertMesh` converts positions (with unit scale), normals
  (rotation only, never unit-scaled), and flips triangle winding iff
  the conversion mirrors. `windingFlipped` is reported on the result.
- `convertQuaternion` uses basis-change conjugation `C·R·Cᵀ`, which
  also handles the rotation-sense change of mirrored frames.
- Units: m/cm/mm/km/in/ft with exact scale ratios.

## Verified (tests/scene-units.test.mjs, 6/6)

Known mappings (Blender up→Maya up, Unreal forward→away, etc.);
all 16 frame pairs round-trip a probe point exactly with orthonormal
matrices; the winding-flip truth table across handedness pairs;
combined mesh conversion m→cm with correct indices/normals; mirrored
Blender→Unity winding flip `[0,2,1]`; quaternion conversion preserves
the physical rotation (rotated vectors match after conversion,
round-trip matches up to sign); exact unit ratios and error cases.

## Ledger

`A26 Scene units and axis conversion (Y-up/Z-up)` gains
`tests/scene-units.test.mjs`. Stays partial: conversion math is
verified — importers/exporters must still route through it. Backup
refreshed (test-output/kernel-backup-2026-10-27).

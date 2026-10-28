# A20 kernel-to-UI wiring: erosion + solar — 2026-10-27

## What changed

The verified A20 kernels are now reachable from the app's own code paths:

- `src/environments.js`: new `getTerrainHeights(terrain)` and
  `applyTerrainErosion(terrain, {method, droplets, seed, talus, ...})`
  run the droplet/thermal kernels on a real heightfield mesh and write
  results back into the geometry (normals recomputed). The heightfield's
  built-in `erosion` parameter remains the old stylized blur; this is the
  real solver.
- `createSkyAtmosphere` now computes sun elevation/azimuth/direction and
  a daylight factor from `src/solar.js` (latitude/dayOfYear parameters,
  defaults 40N / solstice). The old sine-of-hour elevation is gone;
  `setTimeOfDay` preserves location through the spread. Return shape is
  backward compatible (same fields plus additions); no other consumers
  read `sunElevation`.
- `src/environments-ui.js`: new "Erode terrain (droplet + thermal)"
  button next to sculpt/splat, reporting the sediment audit
  (moved / carried off-map); the sky readout now shows the computed sun
  elevation.

## Verified (tests/environments-kernels.test.mjs, 4/4; existing env suite 3/3)

- Heights round-trip exactly through `geometry.attributes.position`.
- Hydraulic erosion on a real `createHeightfield` mesh: heights change,
  and the mesh-level sum change equals the kernel audit's net flow
  (deposited − eroded), with the eroded − deposited = exported identity
  intact at mesh level; normals finite after recompute.
- Thermal erosion on a mesh enforces max neighbor slope ≤ talus + 1e-3
  in world heights.
- Sky at 40N solstice noon reports 73.4° (matches the solar kernel to
  1e-9 and the known value), midnight is below horizon with daylight 0,
  and time-of-day changes preserve latitude.

## Ledger

Terrain, Sky/atmosphere, and Time-of-day items gain
`tests/environments-kernels.test.mjs`. Still partial: erosion is a
one-shot panel action (no interactive erosion brush), sky model remains
an analytic gradient, and there is no cloud/weather simulation. Backups
refreshed (test-output/kernel-backup-2026-10-27).

## Next

Remaining big blocks: A23 real-time engine (25 partial), A15/A13 (43),
B6 (21), A24 (19), A16 (18). A commit checkpoint of the now-large
uncommitted kernel body of work would be prudent whenever the user wants
one.

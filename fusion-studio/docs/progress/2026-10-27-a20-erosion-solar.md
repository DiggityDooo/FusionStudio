# A20 terrain erosion + solar kernels — 2026-10-27

## Context

The app's `createHeightfield` "erosion" is a power curve plus one blur
pass. Two pure-array kernels (no THREE dependency) now provide the real
thing, alongside a solar model for sky/time-of-day.

## Terrain erosion (src/terrain-erosion.js, tests 5/5)

- `hydraulicErosion`: classic droplet algorithm with a radius-2.5 brush,
  sediment capacity from drop × speed × water, and a sediment audit
  {eroded, deposited, exported}. The audit identity holds exactly: net
  height change = deposited − eroded; eroded − deposited = exported.
- `thermalErosion`: talus-angle relaxation that only moves material
  between cells (sum invariant to 1e-4), converging to max slope ≤ talus.
- Verified: flat plain untouched to the bit; Gaussian hill peak lowers,
  total variation drops; deterministic per seed; cliff becomes a ramp at
  the talus bound.

### Stability postmortem (the interesting part)

The naive port exploded: heights reached 1e24, then 7e5, then 236 across
successive fixes, while the sediment audit balanced throughout. Root
cause: single-cell (bilinear) erosion/deposition creates spike/pit pairs;
capacity grows with drop height and droplet speed, so each pair amplifies
the next. Bisected empirically (variant probes, since deleted): the
stabilizers that matter are (1) spreading each event over a brush of
~12 cells, (2) capping per-cell erosion at the material above the
droplet's water level, (3) a droplet terminal velocity, and (4)
capacityFactor 1 instead of the demo-standard 4 on unit-scale terrains
(those demos assume much taller height scales). The Gaussian test now
runs the exact settings that previously exploded and asserts a stability
envelope (min > −0.5).

## Solar (src/solar.js, tests 7/7)

NOAA-style solar math: declination (solstices ±23.44° to 0.3°), equation
of time, elevation/azimuth (noon elevation = 90 − |φ−δ| verified at
equator equinox and 40N solstice), sunrise equation with polar day/night
reporting, clock→solar-time conversion, unit sun direction, twilight
daylight factor, and an analytic sky gradient (zenith/horizon day and
sunset palettes, sun glow, night fade). Verified against known values:
due-south noon azimuth at 40N, ~14.8h summer day at 40N, elevation ≈ 0 at
computed sunrise.

## Ledger

Terrain item gains `tests/terrain-erosion.test.mjs`; Sky/atmosphere and
Time-of-day gain `tests/solar.test.mjs`. All stay partial: kernels are not
wired into `environments.js` terrain meshes or the sky UI yet, and the sky
model is a gradient approximation, not a physical atmosphere. Backups
refreshed (test-output/kernel-backup-2026-10-27).

## Next

Remaining big partial blocks: A23 real-time engine (25), A15/A13
animation/rigging (43), B6 (21), A24 print/CAM (19), A16 characters (18).
Wiring one verified kernel into its UI (terrain erosion onto the actual
heightfield mesh, solar into the sky) would convert kernel evidence into
user-visible behavior for A20.

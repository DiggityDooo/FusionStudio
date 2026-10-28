# A15 animation compression — 2026-10-27

## Kernel

New `src/anim-compression.js`: error-bounded keyframe reduction for
game export.

- `compressScalarCurve(samples, epsilon)`: recursive refinement keeps
  the sample with the worst vertical deviation until linear
  interpolation between kept keys reproduces **every** dense sample
  within epsilon — the same guarantee a runtime resample relies on.
- `sampleKeys` (binary-search linear interpolation, clamped ends) and
  `maxDeviation` make the guarantee directly measurable.
- `compressTrack` handles multi-channel tracks with per-channel
  epsilons by unioning per-channel key times (still exactly bounded
  per channel); `compressionReport` summarizes savings.

## Verified (tests/anim-compression.test.mjs, 5/5)

The epsilon bound is re-verified against resampling at three
tolerances (0.1/0.01/0.001) on a 241-frame sine; a piecewise-linear
curve at epsilon 0 reduces to exactly its corner keys `[0, 10, 30,
40]` with zero deviation; constant curves collapse to endpoints; a
mixed smooth+zigzag two-channel track satisfies both channel bounds
with the zigzag channel driving the shared key count; validation
errors (empty input, non-increasing times, negative epsilon, channel
mismatch).

One test expectation was corrected during development: at epsilon
0.001 a 2 Hz sine legitimately needs near-per-frame keys (the
h²·|f″|/8 bound), so the savings claim is asserted at epsilon 0.01
(>40% saved) instead.

## Ledger

`A15 Animation compression for game export` gains
`tests/anim-compression.test.mjs`. Stays partial: scalar/vector
channel compression is verified — quaternion tracks (hemisphere-aware
reduction) and exporter wiring are not. Backup refreshed
(test-output/kernel-backup-2026-10-27).

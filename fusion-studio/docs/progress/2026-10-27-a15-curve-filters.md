# A15 F-curve filters and certified key simplification (2026-10-27)

Kernel: `src/curve-filters.js`. Tests:
`tests/curve-filters.test.mjs` (3/3). Single-channel key curves
in the repo's `{ frame, value }` shape, evaluated piecewise-
linearly (complements the object-key `reduceKeys` in
`src/animation.js`, which has no error certificate and no
filters).

Contents: `evaluateCurve` / `maxCurveError` (dense error between
two curves), `simplifyKeysBounded` (RDP-style removal whose value
error is certified ≤ epsilon at every original key time — which
bounds it everywhere for piecewise-linear curves sharing segment
endpoints; verified densely in tests), `movingAverageKeys`,
`gaussianKeys` (frame-distance weights, 3σ truncation),
`medianKeys`, and `resampleKeys`.

Exact oracles: straight line collapses to 2 keys at epsilon 0;
sine keeps all keys at epsilon 0; moving average and Gaussian are
exact on constants and on ramp interiors; the [0,0,10,0,0] spike
gives exactly 10/3 under the box filter, exactly 0 under the
median, and the closed-form 10/(1+2e^(−1/2)+2e^(−2)) under the
Gaussian; a step edge survives the median untouched; on-key and
midpoint resampling are lossless while chord-cutting steps are
measurably not.

Two oracle errors were caught and fixed in testing: a Gaussian
concentrates more weight at its center than a box filter (peak
4.03 > 10/3, not less), and off-key resampling of a
piecewise-linear curve cuts chords rather than staying lossless.

Limits: single-channel value curves (no tangent/handle editing,
no per-key interpolation modes), filters are index-windowed
(except the Gaussian, which is frame-distance weighted).

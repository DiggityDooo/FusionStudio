# A31/A21 image denoise and upscale filters (2026-10-27)

Kernel: `src/image-filter.js`. Tests:
`tests/image-filter.test.mjs` (3/3). Evidence added for
`A31 AI denoising and upscaling` and `A21 Denoising passes` —
honestly scoped: these are the classical, provable filters
(Gaussian, bilateral, median, bilinear/nearest upscale) over
compositor RGBA buffers, not neural denoisers; the compositor's
existing `denoisePass` remains the in-graph effect.

Exact oracles: constant images are invariant under every
filter; the Gaussian impulse response equals the normalized
kernel outer product and conserves energy; the bilateral filter
preserves a step edge to <1e-6 at small range sigma and
approaches the Gaussian result (mirror pixels summing to 1) as
range sigma grows; the median filter deletes a salt pixel
exactly while leaving a step edge untouched; 2× bilinear
upscaling reproduces the hand-computed sample grid (0.75 at the
(1,1) output of a 0/1/2/3 source) and nearest replicates blocks.

Limits: small fixed windows (no wavelet or patch-based
denoising, no learned upscaling), alpha is filtered like any
channel, no tiling for large frames.

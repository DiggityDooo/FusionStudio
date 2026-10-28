# 2026-10-27 — A22 object/body tracking (patch tracker + affine motion)

## Landed

- `src/patch-tracker.js` — grayscale patch tracking by normalized cross-correlation over an integer search window, with subpixel refinement by hill-climbing the NCC over fractional offsets with bilinear sampling of the target frame; multi-point tracking; least-squares 2D affine estimation between point sets (Cramer-solved normal equations, degenerate/collinear rejection) with RMS residual reporting.
- `tests/patch-tracker.test.mjs` — 5/5: integer translation recovered exactly (score > 0.99); **subpixel (1.4, 0.6) px shift recovered within 0.2 px**; unrelated content and featureless patches report lost (`null`) instead of guessing; affine recovery exact to 1e-9 on noiseless correspondences; end-to-end tracking + affine recovers a (2.5, 1.5) translation with identity linear part and sub-0.15 residual. Three refinement iterations during development: (1) parabolic interpolation of the integer NCC grid was biased ~0.2 px; (2) fractional NCC hill-climbing hit a real NCC pathology — on smooth near-linear patches a ridge of wrong shifts scores NCC = 1.0000, because NCC is contrast-invariant; (3) final: **Lucas–Kanade Gauss–Newton SSD refinement** plus a caller-frame fix (results are returned as `cx + fx` with candidates anchored on the rounded template center; returning the anchor frame corrupted chained tracking by up to 0.5 px/step — found via the stabilization slice, worst chained error dropped 0.9 px → 0.14 px).

## Ledger

- `A22 Object and body tracking` gains `tests/patch-tracker.test.mjs` evidence; stays partial (2D patch tracking and affine motion only — no solvePnP/3D camera solve, no articulated body tracking UI).

## Verification

- Slice: 5/5. Full suite run after this slice (see summary).

## Limits

Brightness-sensitive NCC without illumination gain compensation; search is exhaustive in a fixed window (no pyramid for large motions).

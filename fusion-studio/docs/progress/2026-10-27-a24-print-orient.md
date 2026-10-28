# 2026-10-27 — A24 print orientation optimization

## Landed

- `src/print-orient.js` — build-direction evaluation (support area from downward-facing faces with plate exemption, build height) over deterministic candidate directions (axes + fibonacci sphere), with support-then-height optimization.
- `tests/print-orient.test.mjs` — 4/4: cube on any axis needs exactly zero support (plate exemption works); a slight tilt makes exactly the bottom face (area 4) count, while a body diagonal correctly needs none (faces at 54.7° from vertical-down are self-supporting — the first oracle I wrote claimed 12 and was wrong, kernel was right); a hemisphere dome needs zero support flat-down, > 1.5 flipped, and the optimizer finds flat-down; a thin plate's optimizer chooses flat over on-edge via the height tie-break (both zero-support, 10× height difference).

## Ledger

- `A24 Print orientation optimization` gains `tests/print-orient.test.mjs` evidence; stays partial (evaluation/optimization only — no auto-support generation from the chosen orientation, no strength/surface-quality objectives, no UI).

## Verification

- Slice: 4/4. Full suite run after this slice (see summary).

## Limits

Whole-face support classification (no per-region overhang analysis), candidate directions sampled rather than continuous optimization.

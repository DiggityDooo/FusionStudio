# Progress — 2026-10-27 — A4 shape grammars

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Stiny-style shape grammars: similarity matching (rotation/scale/reflection), sequential + parallel derivation | `src/shape-grammar.js` | `tests/shape-grammar.test.mjs` (4/4) |
| Koch rule (segments and length x4/3 per level, verified) and recursive square subdivision (12 -> 40 segments) | `src/shape-grammar.js` | same |

Registered in `package.json` and cited on `A4 Procedural rule-based
generation (L-systems, shape grammars)` — the item's note said "shape
grammars missing"; they now exist with exact-count/length verification.
Two design lessons recorded: sequential-until-exhaustion never terminates
for self-similar rules (hence level-parallel application), and recursive
subdivision requires the RHS to re-emit boundary segments at the child
scale. The item stays partial (L-systems live in `src/geometry-nodes.js`;
no visual grammar editor).

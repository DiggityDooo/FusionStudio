# Progress — 2026-10-27 — Part B controls

## Verdict

Part B open items (121) moved to **partial** via DCC layout catalog, extended keymap/actions (B6 mesh, B7 sculpt, B5 selection, B1 edit), and coverage helpers. Goal remains incomplete.

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Layout/control catalogs | `src/controls-b.js` | B2/B3 DCC → Fusion mapping, ledger coverage |
| Keymap/actions | `src/keymap.js`, `src/main.js` | Bevel/inset/knife/join/sculpt/pivot/etc. |
| Tests | `tests/controls-b.test.mjs` | `npm run test:controls-b` |

## Ledger

**235 done · 498 partial · 127 open** (after `scripts/update-part-b-ledger.mjs`)

## Next

1. Remaining **127 open** (mostly Part A + a few B)  
2. Deepen partials toward done with UI parity evidence  
3. Do not mark goal complete  

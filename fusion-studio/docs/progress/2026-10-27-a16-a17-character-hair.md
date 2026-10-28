# Progress — 2026-10-27 — A16 character tools + A17 hair groom

## Verdict

A17 guide grooming / brushes / cards / LOD / mesh conversion landed with tests and Character-workspace UI. A16 LOD, bone-scale, expression presets, and base-mesh listing advanced as partials. Goal remains incomplete (**222 done · 143 partial · 498 open** of 863).

## Shipped

| Area | Files | Evidence |
|------|-------|----------|
| Hair groom core | `src/hair-groom.js` | Guides, comb/cut/grow/puff/smooth/clump/length, children, frizz/curl, wind+gravity, melanin/root/tip, cards, LOD, JSON cache, bob/straight + brow/lash/beard packs |
| Character LOD / scale / expr | `src/character-lod.js` | Stride LODs, bone scale 0.1–3, expression presets, base-mesh list |
| UI / operators | `src/character-tools-ui.js`, `src/main.js` | Character workspace panel + operators |
| Tests | `tests/hair-groom.test.mjs`, `tests/character-lod.test.mjs` | 5/5 · `npm run test:character-tools` |

## Ledger (honest)

**Done:** A17 Guide-curve grooming; Comb/cut/grow/puff/smooth/clump/length; Hair interpolation; Hair-card conversion; Hair LOD; Hair-to-mesh.

**Partial:** A16 base meshes, expression presets/libraries, hair/beard/eyebrow libs, bone-scale (+ separate retarget), character LOD; A17 strands+cards (no fur), frizz/curl (no braid/wave), wind/gravity (not dynamics), shading metadata, brow/lash/beard tools, JSON cache (no Alembic), groom libraries.

**Still open (examples):** A17 hair collision/dynamics, fur, texture/mask painting, procedural groom nodes, grass/feather/moss; A16 scan/digital-double/UDIM/face-track, wardrobe systems, Unreal/Unity export suites.

## Next

1. A17 hair collision + dynamics (or fur / texture masks)
2. A16 skin layering (makeup/tattoo/scar) or shoe/accessory fitting
3. Remaining A15 opens (FBX/C3D mocap, motion matching) if animation priority returns
4. Continue sequential A18+ / Part B only after honest evidence — **do not mark the 863-item goal complete**

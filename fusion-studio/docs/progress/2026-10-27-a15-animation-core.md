# Progress — 2026-10-27 — A15 animation core

## Verdict

A15 foundation landed: per-key interpolation, dope sheet + graph view, NLA tracks/clips, auto-key, loop/pingpong, retime/stretch/reduce, motion path, follow path, animation library clips, events, camera+object keys. Ledger audited after update. Goal remains incomplete (hundreds open across A16–32 / B).

## What shipped

| Area | Files | Evidence |
|------|-------|----------|
| Curve/NLA/path/events | `src/animation.js` | Unit coverage in `tests/animation.test.mjs` |
| Timeline | `src/timeline.js` | Interp, auto-key, loop, timeScale, NLA remap, follow, events |
| Auto-key hook | `src/editor.js` | `finishTransform` inserts when `timeline.autoKey` |
| Animation workspace UI | `src/animation-ui.js`, `src/main.js` | Dope sheet, graph, NLA, path, events panel |
| Tests | `tests/animation.test.mjs` | 5/5; creator shape-key timeline still green |

### Ledger (honest)

**Done:** keyframe+dope+graph; interp modes; pose-to-pose/straight-ahead; retime/stretch; bake+reduce; loop/pingpong; pose+anim libraries; path follow; camera/object anim; events.

**Partial:** F-curve tangent drag UI; NLA multi-layer blend; onion ghosts in viewport; auto-key channel filters; procedural/expression editor depth.

**Still open under A15:** retargeting; mocap; motion matching; state machines; lip sync; facial capture; crowd; muscle anim; ragdoll; shot sequencer; previs; grease pencil; MoGraph; mesh cache; compression.

## What must be done next

1. **A15 remaining** — retargeting (also closes A13 retarget) or mocap BVH import are highest leverage.
2. **A16+** already largely done for character creator; audit and push first open A17+ / Part B.
3. **Do not mark the 863-item goal complete** until every open/partial item has honest evidence.

## Commands

```text
node --test tests/animation.test.mjs
node scripts/feature-ledger.mjs
npm run build
```

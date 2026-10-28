# A15 animation state machine kernel — 2026-10-27

## Kernel

New `src/anim-state-machine.js` (the A15 state-machine item previously
cited only the catch-all remaining-features stub):

- States with duration + loop flag; per-state normalized clocks.
- Parameters (bool/float) and latching triggers; conditions with
  ==, !=, >, >=, <, <=, truthy and trigger forms.
- Transitions: from-state or 'any', exit-time gating, declaration-order
  search (any-state first, self-transitions skipped), timed linear
  cross-blends that mix the two states' sampled values.
- Documented choices: a mid-blend machine finishes its blend before
  searching again; triggers are consumed only by the transition that
  fires on them; the incoming state's clock starts at the fire instant.

## Verified (tests/anim-state-machine.test.mjs, 6/6)

- Condition gating and exact blend math: at fire instant the value is
  still the old state's (blend 0), at half duration it is the exact
  midpoint, at completion the pure target state.
- Any-state trigger fires once, is consumed, and cannot re-fire;
  exit-time gates a landing until normalized time ≥ 0.9 despite the
  condition being true earlier.
- Any-state beats a local transition to a different target (documented
  order) and never self-fires.
- Looping clocks wrap (2.5s in a 2s state = 0.25), non-looping clamp at
  normalized 1; samplers receive normalized time.
- Mid-blend parameter changes cannot interrupt; the return transition
  fires on the first search after the blend completes.
- Graph validation rejects empty/duplicate/unknown-state machines.

## Ledger

`A15 State machines and animation blending (game engines)` gains
`tests/anim-state-machine.test.mjs`. Stays partial: scalar channel
values via injected samplers — blend trees, 1D/2D blend spaces, and UI
authoring are not claimed. Backup refreshed
(test-output/kernel-backup-2026-10-27).

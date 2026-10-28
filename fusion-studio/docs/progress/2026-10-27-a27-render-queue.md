# A27 render automation / farm queue — 2026-10-27

## Kernel

New `src/render-queue.js`: the scheduling core for render automation
and farm submission scripts.

- `parseFrameRange("1-10x2, 20, -5-0")`: ranges, steps, comma lists,
  negative frames; sorted and de-duplicated; malformed specs,
  descending ranges, and non-positive steps throw.
- `chunkFrames(frames, size)` splits work into farm-sized chunks.
- `frameFilename('render_####.exr', 7)` → `render_0007.exr`, with
  natural widening on overflow and sign-aware negative padding.
- `createRenderQueue()`: jobs with priority, `dependsOn`,
  `maxRetries` (default 2), and output patterns. `claimNext` takes the
  best dependency-ready job; `failJob` re-queues while retries remain,
  then marks the job `dead`; `outputs(id)` expands the filename list;
  `summary()` counts statuses. A job depending on a missing job stays
  blocked rather than erroring.

## Verified (tests/render-queue.test.mjs, 5/5)

Range/step/list/negative parsing with exact arrays and error cases;
chunk shapes and padding arithmetic (including `-003`); dependency
gating beats priority (a priority-99 comp job waits for its beauty
pass); retry lifecycle 1 initial + 2 retries → dead, and
`maxRetries: 0` dies on first failure; duplicate/id/state validation.

## Ledger

`A27 Render automation and farm submission scripts` gains
`tests/render-queue.test.mjs`. Stays partial: scheduling logic is
verified — no farm backend or submission UI attached. Backup refreshed
(test-output/kernel-backup-2026-10-27).

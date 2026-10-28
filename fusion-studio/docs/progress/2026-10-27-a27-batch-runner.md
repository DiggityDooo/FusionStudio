# A27 headless batch runner — 2026-10-27

## Kernel

New `src/batch-runner.js`: executes a list of jobs (each an inline step
list or a serialized `fusion-macro`) against a caller-supplied tool
registry, for command-line/headless operation.

- `validateBatch` resolves every step of every job against the registry
  before anything executes; unknown tools, invalid macros, and empty
  jobs are reported as problems.
- `runBatch` gives each job a fresh scratch `context` (no state leaks
  between jobs), isolates failures per job, and supports
  `stopOnError`, `only`/`skip` filters, per-job parameter overrides,
  and an `onJob` observer.
- Reports are machine-readable: per-job `{id, status, stepsRun, error,
  stepIndex, stepName}` plus counts; `batchExitCode` maps a report to
  0 (ok), 1 (job failures), 2 (validation failure).
- No filesystem/process access in the kernel — a CLI layer owns I/O and
  can exit-code on the report.

## Verified (tests/batch-runner.test.mjs, 5/5)

A failing middle job is isolated with exact step accounting (the
failing step does not count as run); per-job context isolation proven
by independent totals; stopOnError halts and only/skip filter;
validation rejects unknown tools and empty jobs with zero execution;
serialized-macro jobs with per-job overrides replay headlessly.

## Ledger

`A27 Batch processing and command-line/headless operation` now cites
`tests/batch-runner.test.mjs` alongside the macros and expressions
tests. Stays partial: the runner engine is verified, but no shipped CLI
binary wires it to scene files yet. Backup refreshed
(test-output/kernel-backup-2026-10-27).

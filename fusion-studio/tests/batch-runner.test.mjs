import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatch, validateBatch, batchExitCode } from '../src/batch-runner.js';
import { createMacro } from '../src/macros.js';

function registry() {
  return {
    // context acts as the per-job scratch scene
    add: (params, ctx) => { ctx.total = (ctx.total || 0) + params.n; return ctx.total; },
    fail: () => { throw new Error('tool exploded'); },
    total: (params, ctx) => ctx.total || 0,
  };
}

const JOBS = [
  { id: 'a', steps: [{ name: 'add', params: { n: 2 } }, { name: 'add', params: { n: 3 } }] },
  { id: 'b', steps: [{ name: 'add', params: { n: 1 } }, { name: 'fail' }, { name: 'add', params: { n: 100 } }] },
  { id: 'c', steps: [{ name: 'add', params: { n: 10 } }] },
];

test('a failing job is isolated: later jobs still run; report is exact', () => {
  const report = runBatch(JOBS, registry());
  assert.equal(report.ok, false);
  assert.deepEqual(report.counts, { total: 3, ok: 2, failed: 1, skipped: 0 });
  assert.deepEqual(report.jobs.map((j) => j.status), ['ok', 'failed', 'ok']);
  assert.equal(report.jobs[0].stepsRun, 2);
  assert.equal(report.jobs[1].stepsRun, 1, 'the failing step itself does not count as run');
  assert.equal(report.jobs[1].stepIndex, 1);
  assert.equal(report.jobs[1].stepName, 'fail');
  assert.match(report.jobs[1].error, /tool exploded/);
  assert.equal(batchExitCode(report), 1);
});

test('per-job context isolation: totals never leak between jobs', () => {
  const seen = [];
  const reg = registry();
  const origTotal = reg.total;
  reg.total = (p, ctx) => { const v = origTotal(p, ctx); seen.push(v); return v; };
  const jobs = [
    { id: 'x', steps: [{ name: 'add', params: { n: 5 } }, { name: 'total' }] },
    { id: 'y', steps: [{ name: 'total' }] },
  ];
  const report = runBatch(jobs, reg);
  assert.equal(report.ok, true);
  assert.deepEqual(seen, [5, 0], 'second job starts from a fresh context');
  assert.equal(batchExitCode(report), 0);
});

test('stopOnError halts the batch; only/skip filter jobs', () => {
  const halted = runBatch(JOBS, registry(), { stopOnError: true });
  assert.deepEqual(halted.jobs.map((j) => j.status), ['ok', 'failed', 'skipped']);

  const onlyC = runBatch(JOBS, registry(), { only: ['c'] });
  assert.deepEqual(onlyC.jobs.map((j) => j.status), ['skipped', 'skipped', 'ok']);

  const skipB = runBatch(JOBS, registry(), { skip: ['b'] });
  assert.deepEqual(skipB.jobs.map((j) => j.status), ['ok', 'skipped', 'ok']);
  assert.equal(skipB.ok, true);
});

test('validation rejects unknown tools and empty jobs before anything executes', () => {
  let executed = 0;
  const reg = { add: () => { executed++; } };
  const jobs = [
    { id: 'bad', steps: [{ name: 'nope' }] },
    { id: 'empty', steps: [] },
    { id: 'fine', steps: [{ name: 'add', params: {} }] },
  ];
  const problems = validateBatch(jobs, registry());
  assert.equal(problems.length, 2);
  assert.match(problems[0].problem, /unknown tool 'nope'/);
  assert.match(problems[1].problem, /no steps/);

  const report = runBatch(jobs, reg);
  assert.equal(report.ok, false);
  assert.equal(batchExitCode(report), 2);
  assert.deepEqual(report.jobs.map((j) => j.status), ['skipped', 'skipped', 'skipped']);
  assert.equal(executed, 0, 'validation failure means zero execution');
});

test('macro JSON jobs and per-job overrides run headlessly', () => {
  const macro = createMacro('recorded');
  macro.record('add', { n: 1 });
  macro.record('add', { n: 1 });
  const jobs = [{ id: 'm', macro: JSON.parse(JSON.stringify(macro.toJSON())) }];
  const seen = [];
  const reg = registry();
  const orig = reg.add;
  reg.add = (p, ctx) => { const v = orig(p, ctx); seen.push(v); return v; };
  const report = runBatch(jobs, reg, { overrides: { m: { 1: { n: 41 } } } });
  assert.equal(report.ok, true);
  assert.deepEqual(seen, [1, 42], 'override replaced the second step params');

  // onJob callback observes every report in order.
  const observed = [];
  runBatch(JOBS, registry(), { onJob: (r) => observed.push(r.id) });
  assert.deepEqual(observed, ['a', 'b', 'c']);
});

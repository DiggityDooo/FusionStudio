'use strict';
// Headless batch runner (A27 "Batch processing and command-line/
// headless operation"): executes a list of jobs -- each a macro step
// sequence -- against a caller-supplied tool registry, with per-job
// isolation so one failing job does not stop the batch (unless
// stopOnError). Produces a machine-readable report a CLI can print and
// exit-code on. No filesystem or process access lives here; the CLI
// layer owns I/O.

import { createMacro, macroFromJSON } from './macros.js';

function macroFor(job) {
  if (job.macro && job.macro.kind === 'fusion-macro') return macroFromJSON(job.macro);
  const macro = createMacro(job.id || job.name || 'job');
  for (const step of job.steps || []) macro.record(step.name, step.params || {});
  return macro;
}

/**
 * Validate a batch without executing: every step of every job must
 * resolve to a registered tool. Returns a list of problems (empty when
 * the batch is runnable).
 */
export function validateBatch(jobs, toolRegistry) {
  const problems = [];
  jobs.forEach((job, jobIndex) => {
    const id = job.id || job.name || `job-${jobIndex}`;
    let steps;
    try {
      steps = macroFor(job).steps();
    } catch (err) {
      problems.push({ job: id, problem: `invalid macro: ${err.message}` });
      return;
    }
    steps.forEach((step, stepIndex) => {
      if (typeof toolRegistry[step.name] !== 'function') {
        problems.push({ job: id, step: stepIndex, problem: `unknown tool '${step.name}'` });
      }
    });
    if (steps.length === 0) problems.push({ job: id, problem: 'job has no steps' });
  });
  return problems;
}

/**
 * Run a batch. toolRegistry maps tool names to (params, context)
 * handlers; context is a fresh per-job object handlers may use as
 * scratch state. Options: { stopOnError=false, only=null, skip=null,
 * overrides={} (per job id), onJob(jobReport) }.
 *
 * Returns { ok, counts: {total, ok, failed, skipped}, jobs: [...] }.
 * Each job report: { id, status, stepsRun, error|null }.
 */
export function runBatch(jobs, toolRegistry, options = {}) {
  const { stopOnError = false, only = null, skip = null, overrides = {}, onJob = null } = options;
  const problems = validateBatch(jobs, toolRegistry);
  if (problems.length > 0) {
    return {
      ok: false,
      validationProblems: problems,
      counts: { total: jobs.length, ok: 0, failed: 0, skipped: jobs.length },
      jobs: jobs.map((job, i) => ({
        id: job.id || job.name || `job-${i}`, status: 'skipped', stepsRun: 0, error: 'validation failed',
      })),
    };
  }

  const reports = [];
  let halted = false;
  jobs.forEach((job, jobIndex) => {
    const id = job.id || job.name || `job-${jobIndex}`;
    const filtered = (only && !only.includes(id)) || (skip && skip.includes(id));
    if (halted || filtered) {
      const report = { id, status: 'skipped', stepsRun: 0, error: null };
      reports.push(report);
      if (onJob) onJob(report);
      return;
    }
    const macro = macroFor(job);
    const context = {};
    let stepsRun = 0;
    try {
      macro.replay((name, params) => {
        const value = toolRegistry[name](params, context);
        stepsRun++;
        return value;
      }, { overrides: overrides[id] || {} });
      const report = { id, status: 'ok', stepsRun, error: null };
      reports.push(report);
      if (onJob) onJob(report);
    } catch (err) {
      const report = {
        id, status: 'failed', stepsRun,
        error: err.message, stepIndex: err.stepIndex ?? null, stepName: err.stepName ?? null,
      };
      reports.push(report);
      if (onJob) onJob(report);
      if (stopOnError) halted = true;
    }
  });

  const counts = {
    total: reports.length,
    ok: reports.filter((r) => r.status === 'ok').length,
    failed: reports.filter((r) => r.status === 'failed').length,
    skipped: reports.filter((r) => r.status === 'skipped').length,
  };
  return { ok: counts.failed === 0, counts, jobs: reports };
}

/** Process exit code for a batch report: 0 ok, 1 failures, 2 invalid. */
export function batchExitCode(report) {
  if (report.validationProblems) return 2;
  return report.ok ? 0 : 1;
}

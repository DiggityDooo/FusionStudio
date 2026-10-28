'use strict';
// Render automation / farm submission kernel (A27 "Render automation
// and farm submission scripts"): frame-range parsing, chunking, and a
// dependency-aware job queue with priorities and bounded retries.
// Pure scheduling logic -- actual render processes are the farm's job.

/**
 * Parse a frame range spec like "1-10", "1-10x2, 20, 25-28" into a
 * sorted, de-duplicated frame list. Steps use 'x'. Negative frames are
 * allowed ("-5-5"). Throws on malformed input.
 */
export function parseFrameRange(spec) {
  if (typeof spec !== 'string' || !spec.trim()) throw new Error('render-queue: empty frame range');
  const frames = new Set();
  for (const rawPart of spec.split(',')) {
    const part = rawPart.trim();
    if (!part) throw new Error(`render-queue: empty segment in '${spec}'`);
    const stepSplit = part.split('x');
    if (stepSplit.length > 2) throw new Error(`render-queue: bad segment '${part}'`);
    const step = stepSplit.length === 2 ? Number(stepSplit[1]) : 1;
    if (!Number.isInteger(step) || step <= 0) throw new Error(`render-queue: bad step in '${part}'`);
    const rangePart = stepSplit[0].trim();
    // Range endpoints may be negative; split on the middle '-'.
    const m = rangePart.match(/^(-?\d+)(?:-(-?\d+))?$/);
    if (!m) throw new Error(`render-queue: bad segment '${part}'`);
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (end < start) throw new Error(`render-queue: descending range '${part}'`);
    for (let f = start; f <= end; f += step) frames.add(f);
  }
  return [...frames].sort((a, b) => a - b);
}

/** Split a frame list into consecutive chunks of at most `size`. */
export function chunkFrames(frames, size) {
  if (!Number.isInteger(size) || size <= 0) throw new Error('render-queue: chunk size must be a positive integer');
  const chunks = [];
  for (let i = 0; i < frames.length; i += size) chunks.push(frames.slice(i, i + size));
  return chunks;
}

/** Output filename for a frame: pad frame number into a '#' pattern. */
export function frameFilename(pattern, frame) {
  const hashes = pattern.match(/#+/);
  if (!hashes) return pattern;
  const width = hashes[0].length;
  const num = frame < 0
    ? '-' + String(Math.abs(frame)).padStart(width - 1, '0')
    : String(frame).padStart(width, '0');
  return pattern.replace(/#+/, num);
}

/**
 * A render queue. Jobs: { id, scene, range (spec string or frame
 * array), chunkSize=1, priority=0, dependsOn=[], maxRetries=2,
 * output=null }. Job status flows queued -> running -> done | failed,
 * with failed jobs re-queued until retries are exhausted (then dead).
 */
export function createRenderQueue() {
  const jobs = new Map();
  let seq = 0;

  function addJob(spec) {
    if (!spec || !spec.id) throw new Error('render-queue: job needs an id');
    if (jobs.has(spec.id)) throw new Error(`render-queue: duplicate job '${spec.id}'`);
    const frames = Array.isArray(spec.range) ? [...spec.range].sort((a, b) => a - b) : parseFrameRange(spec.range);
    if (frames.length === 0) throw new Error('render-queue: job has no frames');
    const job = {
      id: spec.id,
      scene: spec.scene || null,
      frames,
      chunks: chunkFrames(frames, spec.chunkSize || 1),
      priority: spec.priority || 0,
      dependsOn: [...(spec.dependsOn || [])],
      maxRetries: spec.maxRetries ?? 2,
      output: spec.output || null,
      status: 'queued',
      attempts: 0,
      seq: seq++,
    };
    jobs.set(job.id, job);
    return job;
  }

  function getJob(id) {
    const job = jobs.get(id);
    if (!job) throw new Error(`render-queue: no job '${id}'`);
    return job;
  }

  /** Jobs whose dependencies are all done, best first. */
  function readyJobs() {
    const ready = [];
    for (const job of jobs.values()) {
      if (job.status !== 'queued') continue;
      const blocked = job.dependsOn.some((dep) => {
        const depJob = jobs.get(dep);
        return !depJob || depJob.status !== 'done';
      });
      if (!blocked) ready.push(job);
    }
    return ready.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  /** Claim the best ready job (marks it running). Null when none. */
  function claimNext() {
    const ready = readyJobs();
    if (ready.length === 0) return null;
    const job = ready[0];
    job.status = 'running';
    job.attempts++;
    return job;
  }

  function completeJob(id) {
    const job = getJob(id);
    if (job.status !== 'running') throw new Error(`render-queue: job '${id}' is not running`);
    job.status = 'done';
    return job;
  }

  /** Fail a running job: re-queue while retries remain, else dead. */
  function failJob(id) {
    const job = getJob(id);
    if (job.status !== 'running') throw new Error(`render-queue: job '${id}' is not running`);
    job.status = job.attempts <= job.maxRetries ? 'queued' : 'dead';
    return job;
  }

  /** Output filenames a job will produce (empty without a pattern). */
  function outputs(id) {
    const job = getJob(id);
    if (!job.output) return [];
    return job.frames.map((f) => frameFilename(job.output, f));
  }

  function summary() {
    const counts = { queued: 0, running: 0, done: 0, dead: 0, total: jobs.size };
    for (const job of jobs.values()) counts[job.status]++;
    return counts;
  }

  return { addJob, getJob, readyJobs, claimNext, completeJob, failJob, outputs, summary };
}

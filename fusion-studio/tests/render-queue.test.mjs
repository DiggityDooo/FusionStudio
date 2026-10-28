import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrameRange, chunkFrames, frameFilename, createRenderQueue } from '../src/render-queue.js';

test('frame range parsing: ranges, steps, lists, negatives, dedupe', () => {
  assert.deepEqual(parseFrameRange('1-5'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseFrameRange('1-10x3'), [1, 4, 7, 10]);
  assert.deepEqual(parseFrameRange('1-3, 8, 10-11'), [1, 2, 3, 8, 10, 11]);
  assert.deepEqual(parseFrameRange('3, 1-3'), [1, 2, 3], 'sorted and de-duplicated');
  assert.deepEqual(parseFrameRange('-2-2'), [-2, -1, 0, 1, 2]);
  assert.deepEqual(parseFrameRange('7'), [7]);
  assert.throws(() => parseFrameRange(''), /empty frame range/);
  assert.throws(() => parseFrameRange('5-1'), /descending/);
  assert.throws(() => parseFrameRange('1-5x0'), /bad step/);
  assert.throws(() => parseFrameRange('a-b'), /bad segment/);
});

test('chunking and output filename padding', () => {
  assert.deepEqual(chunkFrames([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkFrames([], 4), []);
  assert.throws(() => chunkFrames([1], 0), /positive integer/);
  assert.equal(frameFilename('render_####.exr', 7), 'render_0007.exr');
  assert.equal(frameFilename('f_##.png', 123), 'f_123.png', 'overflow widens naturally');
  assert.equal(frameFilename('f_####.png', -3), 'f_-003.png');
  assert.equal(frameFilename('still.png', 9), 'still.png');
});

test('queue scheduling honors dependencies and priority', () => {
  const q = createRenderQueue();
  q.addJob({ id: 'beauty', scene: 'shot010', range: '1-4', chunkSize: 2, priority: 1 });
  q.addJob({ id: 'comp', scene: 'shot010-comp', range: [1], dependsOn: ['beauty'], priority: 99 });
  q.addJob({ id: 'other', scene: 'shot020', range: '1-2', priority: 5 });

  // comp has the highest priority but is dependency-blocked.
  assert.deepEqual(q.readyJobs().map((j) => j.id), ['other', 'beauty']);
  const claimed = q.claimNext();
  assert.equal(claimed.id, 'other');
  assert.equal(claimed.status, 'running');
  assert.deepEqual(q.getJob('beauty').chunks, [[1, 2], [3, 4]]);

  q.completeJob('other');
  assert.equal(q.claimNext().id, 'beauty');
  q.completeJob('beauty');
  assert.deepEqual(q.readyJobs().map((j) => j.id), ['comp'], 'dependency unblocked only after done');
  assert.deepEqual(q.summary(), { queued: 1, running: 0, done: 2, dead: 0, total: 3 });
});

test('failed jobs retry up to maxRetries, then die', () => {
  const q = createRenderQueue();
  q.addJob({ id: 'flaky', range: '1', maxRetries: 2 });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const job = q.claimNext();
    assert.equal(job.id, 'flaky');
    assert.equal(job.attempts, attempt);
    q.failJob('flaky');
  }
  assert.equal(q.getJob('flaky').status, 'dead', 'dead after 1 initial + 2 retries');
  assert.equal(q.claimNext(), null);
  assert.deepEqual(q.summary(), { queued: 0, running: 0, done: 0, dead: 1, total: 1 });

  // maxRetries 0: a single failure is final.
  const q2 = createRenderQueue();
  q2.addJob({ id: 'strict', range: '1', maxRetries: 0 });
  q2.claimNext();
  q2.failJob('strict');
  assert.equal(q2.getJob('strict').status, 'dead');
});

test('outputs expand patterns per frame; invalid operations throw', () => {
  const q = createRenderQueue();
  q.addJob({ id: 'seq', range: '98-100', output: 'out_###.png' });
  assert.deepEqual(q.outputs('seq'), ['out_098.png', 'out_099.png', 'out_100.png']);
  q.addJob({ id: 'nopattern', range: '1' });
  assert.deepEqual(q.outputs('nopattern'), []);

  assert.throws(() => q.addJob({ id: 'seq', range: '1' }), /duplicate job/);
  assert.throws(() => q.addJob({ range: '1' }), /needs an id/);
  assert.throws(() => q.completeJob('seq'), /not running/);
  assert.throws(() => q.getJob('ghost'), /no job 'ghost'/);
  // A job depending on a missing job is simply never ready.
  q.addJob({ id: 'orphan', range: '1', dependsOn: ['ghost'] });
  assert.equal(q.claimNext().id, 'seq');
  assert.deepEqual(q.readyJobs().map((j) => j.id), ['nopattern'], 'orphan stays blocked');
});

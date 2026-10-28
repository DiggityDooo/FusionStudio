import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addComment, applyOps, canPerform, compactLog, createActor, createDocument,
  createPresence, createReview, documentFromLog, documentState, isPresenceStale,
  mergeLogs, nextOp, observeOp, openComments, resolveComment, restoreSnapshot,
  snapshot,
} from '../src/collab-sync.js';

// Deterministic shuffle for convergence tests.
function shuffled(arr, seed) {
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test('two replicas converge regardless of op delivery order', () => {
  const alice = createActor('alice'), bob = createActor('bob');
  const log = [];
  log.push(nextOp(alice, { type: 'set', objectId: 'cube', key: 'position', value: [0, 0, 0] }));
  log.push(nextOp(bob, { type: 'set', objectId: 'cube', key: 'color', value: 'red' }));
  log.push(nextOp(alice, { type: 'set', objectId: 'cube', key: 'position', value: [1, 2, 3] }));
  log.push(nextOp(bob, { type: 'set', objectId: 'light', key: 'intensity', value: 5 }));
  log.push(nextOp(alice, { type: 'set', objectId: 'light', key: 'intensity', value: 9 }));
  const a = documentState(documentFromLog(shuffled(log, 42)));
  const b = documentState(documentFromLog(shuffled(log, 777)));
  assert.deepEqual(a, b);
  assert.deepEqual(a.cube.position, [1, 2, 3], 'later clock wins the field');
  assert.equal(a.light.intensity, 9);
});

test('last-writer-wins holds even when the stale op arrives last', () => {
  const fresh = { opId: 'alice:10', actor: 'alice', clock: 10, type: 'set', objectId: 'o', key: 'x', value: 'new' };
  const stale = { opId: 'alice:2', actor: 'alice', clock: 2, type: 'set', objectId: 'o', key: 'x', value: 'old' };
  const doc = applyOps(createDocument(), [fresh, stale]);
  assert.equal(documentState(doc).o.x, 'new');
});

test('remove beats older sets; a newer set resurrects the object', () => {
  const alice = createActor('alice'), bob = createActor('bob');
  const log = [];
  log.push(nextOp(alice, { type: 'set', objectId: 'o', key: 'x', value: 1 })); // clock 1
  observeOp(bob, log[0]);
  log.push(nextOp(bob, { type: 'remove', objectId: 'o' })); // clock 2
  assert.deepEqual(documentState(documentFromLog(log)), {});
  log.push(nextOp(alice, { type: 'set', objectId: 'o', key: 'y', value: 2 })); // alice clock 2... tie broken by actor
  const state = documentState(documentFromLog(log));
  // alice's set has stamp [2,'alice'] vs tomb [2,'bob']: bob wins the tie.
  assert.deepEqual(state, {});
  const carol = createActor('carol');
  carol.clock = 5;
  log.push(nextOp(carol, { type: 'set', objectId: 'o', key: 'y', value: 2 }));
  assert.deepEqual(documentState(documentFromLog(log)), { o: { y: 2 } }, 'newer set resurrects');
});

test('log merge dedupes and compaction preserves state', () => {
  const alice = createActor('alice');
  const log = [];
  for (let i = 0; i < 12; i++) log.push(nextOp(alice, { type: 'set', objectId: 'o', key: 'x', value: i }));
  log.push(nextOp(alice, { type: 'set', objectId: 'p', key: 'a', value: 1 }));
  const merged = mergeLogs(log, log.slice(0, 5));
  assert.equal(merged.length, log.length);
  const compact = compactLog(log);
  assert.ok(compact.length < log.length, `compact ${compact.length} < ${log.length}`);
  assert.deepEqual(documentState(documentFromLog(compact)), documentState(documentFromLog(log)));
  assert.equal(documentState(documentFromLog(compact)).o.x, 11);
});

test('snapshots restore and roll back state', () => {
  const alice = createActor('alice');
  const doc = createDocument();
  applyOps(doc, [nextOp(alice, { type: 'set', objectId: 'o', key: 'v', value: 1 })]);
  const snap = snapshot(doc, 'v1');
  applyOps(doc, [nextOp(alice, { type: 'set', objectId: 'o', key: 'v', value: 2 })]);
  assert.equal(documentState(doc).o.v, 2);
  assert.equal(documentState(restoreSnapshot(snap)).o.v, 1, 'rollback to snapshot');
});

test('roles gate actions; presence goes stale; review comments resolve', () => {
  assert.ok(canPerform('viewer', 'view') && !canPerform('viewer', 'comment'));
  assert.ok(canPerform('commenter', 'comment') && !canPerform('commenter', 'edit'));
  assert.ok(canPerform('editor', 'edit') && !canPerform('editor', 'admin'));
  assert.ok(canPerform('owner', 'admin'));
  const presence = createPresence(createActor('alice'), { selection: ['cube'] });
  assert.ok(!isPresenceStale(presence, presence.heartbeat + 1000));
  assert.ok(isPresenceStale(presence, presence.heartbeat + 60000));
  const review = createReview();
  const c = addComment(review, { author: 'bob', position: [1, 2, 3], text: 'Fix this edge' });
  assert.equal(openComments(review).length, 1);
  resolveComment(review, c.id);
  assert.equal(openComments(review).length, 0);
  assert.throws(() => addComment(review, { author: 'x', text: ' ' }), /text required/);
});

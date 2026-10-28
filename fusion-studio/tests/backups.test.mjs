import test from 'node:test';
import assert from 'node:assert/strict';
import { backupName, parseBackupName, planRotation, createBackupManager, createMemoryStore } from '../src/backups.js';

const DAY = 86400000;
function nameAt(project, ms) {
  return backupName(project, new Date(ms));
}

test('backup names round-trip and sort chronologically', () => {
  const date = new Date(Date.UTC(2026, 9, 27, 14, 30, 5));
  const name = backupName('My Scene', date);
  assert.equal(name, 'My Scene_2026-10-27T14-30-05.fsn.bak');
  const parsed = parseBackupName(name);
  assert.equal(parsed.project, 'My Scene');
  assert.equal(parseBackupName('random.txt'), null);
  assert.equal(parseBackupName('Scene_2026-13-99.fsn.bak'), null, 'shape must be a full timestamp');
  const names = [nameAt('A', 3000), nameAt('A', 1000), nameAt('A', 2000)];
  assert.deepEqual([...names].sort(), [nameAt('A', 1000), nameAt('A', 2000), nameAt('A', 3000)]);
});

test('rotation keeps newest N plus one per recent day, deletes the rest', () => {
  const now = Date.UTC(2026, 9, 27, 12, 0, 0);
  const names = [];
  // 3 backups today, 1 yesterday, 1 three days ago, 1 thirty days ago.
  names.push(nameAt('P', now), nameAt('P', now - 3600000), nameAt('P', now - 2 * 3600000));
  names.push(nameAt('P', now - DAY), nameAt('P', now - 3 * DAY), nameAt('P', now - 30 * DAY));
  names.push('unrelated.txt');
  const plan = planRotation(names, { keepCount: 2, keepDays: 7 });
  assert.equal(plan.keep.length, 4, 'newest 2 + yesterday + 3-days-ago representatives');
  assert.ok(plan.keep.includes(nameAt('P', now - DAY)));
  assert.ok(plan.keep.includes(nameAt('P', now - 3 * DAY)));
  assert.deepEqual(plan.delete.sort(), [nameAt('P', now - 2 * 3600000), nameAt('P', now - 30 * DAY)].sort());
  assert.ok(!plan.keep.includes('unrelated.txt') && !plan.delete.includes('unrelated.txt'));

  const strict = planRotation(names, { keepCount: 1, keepDays: 0 });
  assert.deepEqual(strict.keep, [nameAt('P', now)], 'keepDays 0 keeps only the count window');
});

test('backup + restore round-trip through the envelope; projects isolated', () => {
  const store = createMemoryStore();
  const mgr = createBackupManager(store);
  mgr.backup('Hero', '{"version":1}', new Date(Date.UTC(2026, 9, 27, 10)));
  const second = mgr.backup('Hero', '{"version":2}', new Date(Date.UTC(2026, 9, 27, 11)));
  mgr.backup('Other', '{"version":99}', new Date(Date.UTC(2026, 9, 27, 12)));
  const restored = mgr.restoreLatest('Hero');
  assert.equal(restored.name, second);
  assert.equal(restored.payload, '{"version":2}');
  assert.deepEqual(restored.skipped, []);
  assert.equal(mgr.restoreLatest('Missing').payload, null);
  assert.equal(mgr.projectBackups('Hero').length, 2);
});

test('recovery falls back past a corrupted newest backup', () => {
  const store = createMemoryStore();
  const mgr = createBackupManager(store);
  mgr.backup('Hero', 'good-old', new Date(Date.UTC(2026, 9, 27, 10)));
  const newest = mgr.backup('Hero', 'good-new', new Date(Date.UTC(2026, 9, 27, 11)));
  // Corrupt the newest: flip payload characters without fixing checksum.
  const raw = store._files.get(newest);
  store._files.set(newest, raw.replace('good-new', 'evil-new'));
  const restored = mgr.restoreLatest('Hero');
  assert.equal(restored.payload, 'good-old', 'checksum mismatch skips to the previous valid backup');
  assert.deepEqual(restored.skipped, [newest]);

  // Corrupt everything (truncated JSON): recovery reports null, no throw.
  store._files.set(restored.name, '{truncated');
  const none = mgr.restoreLatest('Hero');
  assert.equal(none.payload, null);
  assert.equal(none.skipped.length, 2);
});

test('manager rotation deletes per plan and keeps other projects untouched', () => {
  const store = createMemoryStore();
  const mgr = createBackupManager(store);
  const now = Date.UTC(2026, 9, 27, 12);
  for (let i = 0; i < 6; i++) mgr.backup('P', `v${i}`, new Date(now - i * 3600000));
  mgr.backup('Q', 'keepme', new Date(now));
  const plan = mgr.rotate('P', { keepCount: 3, keepDays: 0 });
  assert.equal(plan.delete.length, 3);
  assert.equal(mgr.projectBackups('P').length, 3);
  assert.equal(mgr.restoreLatest('P').payload, 'v0');
  assert.equal(mgr.restoreLatest('Q').payload, 'keepme');
  assert.throws(() => createBackupManager({}), /store needs list/);
});

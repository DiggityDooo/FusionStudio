import test from 'node:test';
import assert from 'node:assert/strict';
import { expandLSystem, interpretLSystem, generatePlant, plantStats } from '../src/l-system.js';

test('rewriting is parallel and exact: Fibonacci word growth', () => {
  const rules = { A: 'AB', B: 'A' };
  assert.equal(expandLSystem('A', rules, 0), 'A');
  assert.equal(expandLSystem('A', rules, 1), 'AB');
  assert.equal(expandLSystem('A', rules, 2), 'ABA');
  assert.equal(expandLSystem('A', rules, 3), 'ABAAB');
  assert.equal(expandLSystem('A', rules, 5), 'ABAABABAABAAB');
  // Length follows Fibonacci: 1, 2, 3, 5, 8, 13.
  assert.equal(expandLSystem('A', rules, 6).length, 21);
  // Symbols without rules pass through untouched.
  assert.equal(expandLSystem('F+F', { F: 'FF' }, 1), 'FF+FF');
  assert.throws(() => expandLSystem('A', rules, -1), /non-negative integer/);
});

test('a binary tree system produces the exact segment count and symmetry', () => {
  // Classic bracketed tree: each F splits via axiom growth.
  const { text, segments } = generatePlant({
    axiom: 'F', rules: { F: 'F[+F][-F]' }, iterations: 3,
    step: 1, angleDeg: 30, decay: 1, radiusDecay: 1,
  });
  const fCount = [...text].filter((c) => c === 'F').length;
  assert.equal(segments.length, fCount, 'one segment per F');
  // F counts: 1 -> 3 -> 9 -> 27? expansion triples F each generation after the first:
  assert.equal(fCount, 27);
  // Symmetric tree: segment endpoints mirror around the Y axis.
  const xs = segments.flatMap((s) => [s.a[0], s.b[0]]);
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9, 'left/right extents mirror');
  const stats = plantStats(segments);
  assert.equal(stats.segmentCount, 27);
  assert.ok(stats.maxHeight > 2, 'tree grows upward');
});

test('straight growth, decay, and tropism bend as specified', () => {
  const straight = interpretLSystem('FFFF', { step: 0.5, decay: 1 });
  assert.equal(straight.length, 4);
  assert.ok(Math.abs(straight[3].b[1] - 2) < 1e-9, 'four 0.5 steps = height 2');
  // Bracket depth decays segment length: trunk 1, branch 0.5.
  const branched = interpretLSystem('F[F]F', { step: 1, decay: 0.5 });
  const lengths = branched.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]));
  assert.ok(Math.abs(lengths[0] - 1) < 1e-9 && Math.abs(lengths[1] - 0.5) < 1e-9 && Math.abs(lengths[2] - 1) < 1e-9);
  assert.equal(branched[1].depth, 1);
  // Tropism pulls a horizontal shoot upward over its length.
  const bent = interpretLSystem('FFFFFF', { step: 1, decay: 1, heading: [1, 0, 0], tropism: 1 });
  assert.ok(bent[5].b[1] > 0.5, `tropism lifted the tip to y=${bent[5].b[1].toFixed(2)}`);
  const straightShot = interpretLSystem('FFFFFF', { step: 1, decay: 1, heading: [1, 0, 0], tropism: 0 });
  assert.ok(Math.abs(straightShot[5].b[1]) < 1e-9, 'no tropism, no bend');
});

test('seeded jitter is deterministic per seed and changes shape, not counts', () => {
  const opts = { step: 1, angleDeg: 20, jitterDeg: 8, seed: 42 };
  const a = generatePlant({ axiom: 'F', rules: { F: 'F[+F][-F]' }, iterations: 3, ...opts });
  const b = generatePlant({ axiom: 'F', rules: { F: 'F[+F][-F]' }, iterations: 3, ...opts });
  assert.deepEqual(a.segments, b.segments, 'same seed, same plant');
  const c = generatePlant({ axiom: 'F', rules: { F: 'F[+F][-F]' }, iterations: 3, ...opts, seed: 7 });
  assert.equal(c.segments.length, a.segments.length);
  assert.notDeepEqual(c.segments, a.segments, 'different seed, different shape');
});

test('bracket balance and stack restore are enforced', () => {
  assert.throws(() => interpretLSystem('F]'), /unbalanced \]/);
  assert.throws(() => interpretLSystem('F['), /unbalanced \[/);
  // After ], the turtle resumes exactly at the branch point.
  const segs = interpretLSystem('F[+F]F', { step: 1, angleDeg: 90, decay: 1 });
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[2].a, segs[0].b, 'main stem continues from the fork point');
  assert.ok(Math.abs(segs[1].b[0]) > 0.9, 'branch went sideways at 90 degrees');
});

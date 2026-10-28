import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateHair, strandLength, strandRestPositions } from '../src/hair-sim.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

function makeStrand(root, direction, options) {
  return { positions: strandRestPositions(root, direction, options) };
}

test('a free strand hangs straight down with its length and root preserved', () => {
  const strand = makeStrand([0.2, 1.7, 0.1], [1, 0.2, 0], { segments: 8, length: 0.4 });
  // The strand starts near-horizontal and pendulum-settles; 6 s of
  // damped XPBD brings it to vertical (probed: max deviation
  // 0.0035 at 6 s vs 0.045 still swinging at 3 s).
  const [settled] = simulateHair({ strands: [strand], seconds: 6 });
  assert.deepEqual(settled[0], [0.2, 1.7, 0.1], 'root pinned exactly');
  for (const p of settled) {
    assert.ok(near(p[0], 0.2, 5e-3) && near(p[2], 0.1, 5e-3), `hangs vertically (${p})`);
  }
  for (let i = 1; i < settled.length; i++) {
    assert.ok(settled[i][1] < settled[i - 1][1], 'monotonically descending');
  }
  assert.ok(near(strandLength(settled), 0.4, 0.004), `length preserved (${strandLength(settled)})`);
});

test('wind deflects strands downwind, longer strands deflect more', () => {
  const short = makeStrand([0, 1.7, 0], [0, -1, 0], { segments: 6, length: 0.2 });
  const long = makeStrand([0.5, 1.7, 0], [0, -1, 0], { segments: 12, length: 0.5 });
  const [shortSettled, longSettled] = simulateHair({
    strands: [short, long], wind: [6, 0, 0], seconds: 2,
  });
  const shortTip = shortSettled.at(-1), longTip = longSettled.at(-1);
  assert.ok(shortTip[0] > 0.01, `short strand blows downwind (${shortTip[0]})`);
  assert.ok(longTip[0] - 0.5 > shortTip[0] + 0.02,
    `long strand deflects farther (${longTip[0] - 0.5} vs ${shortTip[0]})`);
  assert.ok(near(strandLength(longSettled), 0.5, 0.008), 'length kept under wind');
});

test('sphere colliders keep every particle outside the head volume', () => {
  // Strand rooted just above a sphere, initially pointing down at it.
  const strand = makeStrand([0.05, 1.75, 0], [0, -1, 0], { segments: 10, length: 0.5 });
  const collider = { center: [0, 1.45, 0], radius: 0.22 };
  const [settled] = simulateHair({
    strands: [strand], sphereColliders: [collider], seconds: 2,
  });
  for (const p of settled) {
    const d = Math.hypot(p[0] - collider.center[0], p[1] - collider.center[1], p[2] - collider.center[2]);
    assert.ok(d >= collider.radius - 1e-6, `particle outside collider (d=${d})`);
    assert.ok(Number.isFinite(p[0] + p[1] + p[2]), 'no NaN');
  }
  assert.deepEqual(settled[0], [0.05, 1.75, 0], 'root stays pinned outside the collider');
  assert.ok(settled.some((p) => Math.abs(p[0]) > 0.1), 'strand drapes around the sphere instead of passing through');
  assert.ok(near(strandLength(settled), 0.5, 0.01), 'drape keeps strand length');
  assert.throws(() => simulateHair({ strands: [] }), /at least one strand/);
  assert.throws(() => strandRestPositions([0, 0, 0], [0, 0, 0]), /non-zero/);
});

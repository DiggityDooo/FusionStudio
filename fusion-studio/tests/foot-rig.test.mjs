import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootRig } from '../src/foot-rig.js';

function rotateAboutX(point, pivot, deg) {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dy = point[1] - pivot[1], dz = point[2] - pivot[2];
  return [point[0], pivot[1] + dy * cos - dz * sin, pivot[2] + dy * sin + dz * cos];
}

test('rest pose is the identity and phases select the right pivots', () => {
  const rig = createFootRig();
  assert.deepEqual(rig.solve({ roll: 0 }), {
    pitchDeg: 0, bankDeg: 0, pitchSteps: [], pitchPivot: [0, 0, 0.13], bankPivot: [0.05, 0, 0], phase: 'ball',
  });
  assert.deepEqual(rig.transformPoint([0.2, 0.12, -0.05], { roll: 0 }), [0.2, 0.12, -0.05]);
  assert.equal(rig.solve({ roll: -0.4 }).phase, 'heel');
  assert.equal(rig.solve({ roll: 0.25 }).phase, 'ball');
  assert.equal(rig.solve({ roll: 0.9 }).phase, 'toe');
  // Clamping outside [-1, 1].
  assert.equal(rig.solve({ roll: 5 }).pitchDeg, rig.solve({ roll: 1 }).pitchDeg);
  assert.equal(rig.solve({ roll: -5 }).pitchDeg, rig.solve({ roll: -1 }).pitchDeg);
});

test('the active ground pivot stays fixed in world space (contact invariance)', () => {
  const rig = createFootRig();
  for (const [roll, pivotName] of [[-0.7, 'heel'], [0.3, 'ball']]) {
    const pivot = rig.pivots[pivotName];
    const moved = rig.transformPoint(pivot, { roll });
    assert.ok(Math.hypot(...moved.map((v, i) => v - pivot[i])) < 1e-12,
      `roll ${roll}: ${pivotName} pivot ${moved} != ${pivot}`);
  }
  // Toe phase: the toe material point stops moving at its phase-start
  // position (it is the contact), even though the ball phase moved it.
  const toeAtPhaseStart = rig.transformPoint(rig.pivots.toe, { roll: 0.5 });
  const toeDuring = rig.transformPoint(rig.pivots.toe, { roll: 0.8 });
  assert.ok(Math.hypot(...toeDuring.map((v, i) => v - toeAtPhaseStart[i])) < 1e-12,
    'toe contact fixed during the toe phase');
  // Bank pivots likewise.
  const rig2 = createFootRig();
  const edge = [0.05, 0, 0.02];
  const banked = rig2.transformPoint(edge, { bank: 0.8 });
  assert.ok(Math.abs(banked[0] - 0.05) < 1e-12 && Math.abs(banked[1]) < 1e-12, 'bank edge contact fixed');
});

test('ankle trajectory matches independent pivot-rotation math', () => {
  const rig = createFootRig({ ballAngle: 40 });
  const roll = 0.25; // halfway through the ball phase: +20 degrees
  const solved = rig.solve({ roll });
  assert.equal(solved.pitchDeg, 20);
  const expected = rotateAboutX([0, 0.12, 0], [0, 0, 0.13], 20);
  const actual = rig.anklePosition({ roll });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(actual[i] - expected[i]) < 1e-12,
    `axis ${i}: ${actual[i]} vs ${expected[i]}`);
  assert.ok(actual[1] > 0.12, 'heel lift raises the ankle');
});

test('pitch is continuous across phase boundaries', () => {
  const rig = createFootRig();
  for (const boundary of [0, 0.5]) {
    const before = rig.solve({ roll: boundary - 1e-9 }).pitchDeg;
    const at = rig.solve({ roll: boundary }).pitchDeg;
    const after = rig.solve({ roll: boundary + 1e-9 }).pitchDeg;
    assert.ok(Math.abs(before - at) < 1e-6 && Math.abs(after - at) < 1e-6,
      `boundary ${boundary}: ${before} / ${at} / ${after}`);
  }
  // Ankle position is continuous too (no pops when phases change).
  const a = rig.anklePosition({ roll: 0.499999 });
  const b = rig.anklePosition({ roll: 0.500001 });
  assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < 1e-4);
});

test('full toe roll lifts the heel end clear of the ground', () => {
  const rig = createFootRig();
  const heelPoint = [0, 0, -0.07];
  const lifted = rig.transformPoint(heelPoint, { roll: 1 });
  assert.ok(lifted[1] > 0.1, `heel at y=${lifted[1].toFixed(3)} after full roll`);
  // And a backward roll lifts the toe.
  const toeLifted = rig.transformPoint([0, 0, 0.21], { roll: -1 });
  assert.ok(toeLifted[1] > 0.05, `toe at y=${toeLifted[1].toFixed(3)} after heel roll`);
});

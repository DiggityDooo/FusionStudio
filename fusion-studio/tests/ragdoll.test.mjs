import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRagdoll, simulateRagdoll, centerOfMass, maxConstraintError, totalKineticEnergy } from '../src/ragdoll.js';
import { applyImpulse } from '../src/rigid-body.js';

test('zero-g drift: internal rods cannot move the center of mass', () => {
  const rig = buildRagdoll({ height: 1.8, origin: [0, 3, 0] });
  for (const b of rig.bodies) b.velocity = [0.7, 0.2, -0.4];
  const com0 = centerOfMass(rig.bodies);
  simulateRagdoll(rig, 1.5, { gravity: 0, damping: 0 });
  const com1 = centerOfMass(rig.bodies);
  const expected = [com0[0] + 0.7 * 1.5, com0[1] + 0.2 * 1.5, com0[2] - 0.4 * 1.5];
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(com1[i] - expected[i]) < 0.01, `COM[${i}] ${com1[i].toFixed(3)} vs ${expected[i].toFixed(3)}`);
  assert.ok(maxConstraintError(rig) < 0.005, 'rods hold in drift');
});

test('drop and settle: constraints hold, nothing tunnels, energy dissipates', () => {
  const rig = buildRagdoll({ height: 1.8, origin: [0, 0.6, 0] });
  // Watch constraint health DURING the fall, not just at the end.
  let worstDuring = 0;
  const dt = 1 / 240;
  for (let s = 0; s < 3.5; s += 0.25) {
    simulateRagdoll(rig, 0.25, { dt });
    worstDuring = Math.max(worstDuring, maxConstraintError(rig));
  }
  assert.ok(worstDuring < 0.03, `worst rod error during drop ${worstDuring.toFixed(4)} m`);
  // Everything ends above ground (sphere bottoms >= 0 within contact slop).
  for (const b of rig.bodies) {
    assert.ok(b.position[1] - b.shape.radius > -0.01, `${b.name} bottom ${b.position[1] - b.shape.radius}`);
    assert.ok(Number.isFinite(b.position[1]), `${b.name} finite`);
  }
  // The ragdoll ends up lying/resting low, not standing at full height.
  const com = centerOfMass(rig.bodies);
  assert.ok(com[1] < 0.6, `settled COM height ${com[1].toFixed(2)} (fell from ~1.5)`);
  // Energy mostly dissipated after 3.5 s of settling.
  const ke = totalKineticEnergy(rig.bodies);
  assert.ok(ke < 2, `residual kinetic energy ${ke.toFixed(3)} J`);
});

test('a shove to the chest topples the ragdoll (it is articulated, not a statue)', () => {
  const rig = buildRagdoll({ height: 1.8, origin: [0, 0, 0] });
  const comBefore = centerOfMass(rig.bodies);
  // Strong horizontal impulse at the chest.
  applyImpulse(rig.bodyByName.torso, [rig.bodyByName.torso.mass * 2.2, 0, 0], rig.bodyByName.torso.position);
  simulateRagdoll(rig, 2.5, {});
  const comAfter = centerOfMass(rig.bodies);
  assert.ok(comAfter[1] < comBefore[1] - 0.3, `COM fell: ${comBefore[1].toFixed(2)} -> ${comAfter[1].toFixed(2)}`);
  assert.ok(comAfter[0] > comBefore[0] + 0.4, `COM traveled downrange: ${comAfter[0].toFixed(2)}`);
  assert.ok(maxConstraintError(rig) < 0.03, 'rods hold through the fall');
  // Head ends near the ground (lying), not at standing height.
  assert.ok(rig.bodyByName.head.position[1] < 0.5, `head height ${rig.bodyByName.head.position[1].toFixed(2)}`);
});

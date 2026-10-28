import test from 'node:test';
import assert from 'node:assert/strict';
import { createGranularWorld, addGrain, pourGrains, stepGranular, kineticEnergy, surfaceProfile } from '../src/granular.js';

function settledWorld() {
  const world = createGranularWorld({ width: 10, radius: 0.09, friction: 0.7 });
  // Pour a column of grains above the center.
  pourGrains(world, { x0: 4.6, x1: 5.4, y0: 3.2, rows: 26, seed: 7 });
  for (let s = 0; s < 60 * 6; s++) stepGranular(world, 1 / 60);
  return world;
}

test('poured grains settle: energy decays, grains rest inside the container', () => {
  const world = createGranularWorld({ width: 10, radius: 0.09, friction: 0.7 });
  pourGrains(world, { x0: 4.6, x1: 5.4, y0: 3.2, rows: 26, seed: 7 });
  assert.ok(world.count > 80, `poured ${world.count} grains`);
  let peak = 0;
  for (let s = 0; s < 60 * 2; s++) { stepGranular(world, 1 / 60); peak = Math.max(peak, kineticEnergy(world)); }
  for (let s = 0; s < 60 * 4; s++) stepGranular(world, 1 / 60);
  const rest = kineticEnergy(world);
  assert.ok(peak > 1, 'grains actually fell (energy rose during the pour)');
  assert.ok(rest < peak * 0.02, `settled: rest energy ${rest.toFixed(4)} vs peak ${peak.toFixed(2)}`);
  for (let i = 0; i < world.count; i++) {
    const x = world.positions[i * 2], y = world.positions[i * 2 + 1];
    assert.ok(x >= world.radius - 1e-9 && x <= world.width - world.radius + 1e-9, 'inside walls');
    assert.ok(y >= world.radius - 1e-9, 'above floor');
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
});

test('settled grains do not interpenetrate beyond solver tolerance', () => {
  const world = settledWorld();
  const diameter = world.radius * 2;
  let worst = 0;
  for (let i = 0; i < world.count; i++) {
    for (let j = i + 1; j < world.count; j++) {
      const d = Math.hypot(
        world.positions[j * 2] - world.positions[i * 2],
        world.positions[j * 2 + 1] - world.positions[i * 2 + 1]);
      worst = Math.max(worst, diameter - d);
    }
  }
  assert.ok(worst / diameter < 0.15, `worst overlap ${(worst / diameter * 100).toFixed(1)}% of diameter`);
});

test('the pile forms a heap with a bounded angle of repose', () => {
  const world = settledWorld();
  const { profile, binWidth } = surfaceProfile(world, 20);
  const peak = Math.max(...profile);
  const edge = Math.max(profile[0], profile[profile.length - 1]);
  assert.ok(peak > edge + 0.4, `heap: peak ${peak.toFixed(2)} vs edge ${edge.toFixed(2)}`);
  assert.ok(peak > 0.6, 'pile has real height (not spread flat like a liquid)');
  // Repose from the heap envelope: rise over half the base width above
  // the single-grain floor level -- steeper than a liquid, gentler
  // than a tower.
  const floorLevel = world.radius * 2;
  const above = profile.map((v, i) => (v > floorLevel + 0.05 ? i : -1)).filter((i) => i >= 0);
  const baseWidth = (above[above.length - 1] - above[0] + 1) * binWidth;
  const angleDeg = Math.atan((peak - floorLevel) / (baseWidth / 2)) * 180 / Math.PI;
  assert.ok(angleDeg > 8, `repose ${angleDeg.toFixed(1)} degrees: grains heap, not flow flat`);
  assert.ok(angleDeg < 50, `repose ${angleDeg.toFixed(1)} degrees is heap-like, not a wall`);
});

test('a single grain falls, lands, and stays landed', () => {
  const world = createGranularWorld({ width: 4, radius: 0.1 });
  addGrain(world, 2, 3);
  for (let s = 0; s < 60 * 3; s++) stepGranular(world, 1 / 60);
  assert.ok(Math.abs(world.positions[1] - 0.1) < 1e-6, `landed at y=${world.positions[1]}`);
  assert.ok(Math.abs(world.velocities[1]) < 1e-6, 'at rest');
  assert.throws(() => stepGranular(world, 0), /dt must be positive/);
  assert.throws(() => createGranularWorld({ radius: -1 }), /must be positive/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createXPBDWorld, addDistanceConstraint, addVolumeConstraint, tetraVolume,
  pinParticle, buildRope, stepXPBD, maxConstraintError, chainLength,
} from '../src/xpbd.js';

const range = (n) => Array.from({ length: n + 1 }, (_, i) => i);

test('a single rigid distance constraint is satisfied exactly', () => {
  const world = createXPBDWorld([[0, 0, 0], [3, 0, 0]], [1, 1], { gravity: [0, 0, 0] });
  addDistanceConstraint(world, 0, 1, 2, 0);
  stepXPBD(world, 0.016, { substeps: 1 });
  assert.ok(maxConstraintError(world) < 1e-12, `error ${maxConstraintError(world)}`);
  // Symmetric masses split the correction: midpoint stays at 1.5.
  const mid = (world.positions[0] + world.positions[3]) / 2;
  assert.ok(Math.abs(mid - 1.5) < 1e-12);
});

test('rope hangs straight down with conserved length', () => {
  const segments = 10, segLen = 0.2;
  const world = buildRope({
    origin: [0, 2, 0], direction: [1, 0, 0], segments, segmentLength: segLen, mass: 0.1,
  });
  // Damped: an undamped rope swings forever and never "hangs".
  for (let s = 0; s < 480; s++) stepXPBD(world, 1 / 60, { substeps: 10, damping: 3 });
  const total = chainLength(world, range(segments));
  assert.ok(Math.abs(total - segments * segLen) / (segments * segLen) < 0.01, `length ${total}`);
  // Free end hangs below the pin, chain nearly vertical.
  const endX = world.positions[segments * 3], endY = world.positions[segments * 3 + 1];
  assert.ok(endY < 0.2, `free end dropped: y=${endY}`);
  assert.ok(Math.abs(endX) < 0.05, `hangs straight: x=${endX}`);
  assert.ok(maxConstraintError(world) < 0.01, 'segments stay near rest length');
});

test('compliance stretches monotonically (XPBD physical units)', () => {
  const stretch = (compliance) => {
    const world = buildRope({
      origin: [0, 2, 0], direction: [1, 0, 0], segments: 4, segmentLength: 0.25, mass: 0.5, compliance,
    });
    // Damped to static equilibrium: compliance stretch is a statics claim,
    // and an undamped chain's dynamic extension would swamp it.
    for (let s = 0; s < 600; s++) stepXPBD(world, 1 / 60, { substeps: 20, damping: 3 });
    return chainLength(world, range(4)) - 1.0;
  };
  const stiff = stretch(0);
  const soft = stretch(1e-3);
  const softer = stretch(1e-2);
  assert.ok(Math.abs(stiff) < 0.005, `rigid rope stretch ${stiff}`);
  assert.ok(soft > stiff + 0.002, `soft ${soft} > stiff ${stiff}`);
  assert.ok(softer > soft + 0.002, `softer ${softer} > soft ${soft}`);
});

test('pendulum period matches sqrt(L/g) and conserves height', () => {
  const L = 1.0;
  // Small-angle release (10 deg): at 90 deg the true period is 1.18x the
  // small-angle formula (elliptic correction) -- the solver follows the
  // full nonlinear dynamics either way, so test where the formula applies.
  const tilt = 10 * Math.PI / 180;
  const world = buildRope({
    origin: [0, 0, 0], direction: [Math.sin(tilt), -Math.cos(tilt), 0], segments: 1, segmentLength: L, mass: 1,
  });
  const releaseY = -Math.cos(tilt) * L;
  const bob = () => [world.positions[3], world.positions[4]];
  let prevX = bob()[0], crossings = [];
  let maxHeightAfterRelease = -Infinity;
  const dt = 1 / 240;
  for (let s = 0; s < 240 * 8; s++) {
    stepXPBD(world, dt, { substeps: 4 });
    const [x, y] = bob();
    if (s > 10) maxHeightAfterRelease = Math.max(maxHeightAfterRelease, y);
    if (prevX < 0 && x >= 0 && world.velocities[3] > 0) crossings.push(s * dt);
    prevX = x;
  }
  assert.ok(crossings.length >= 2, `crossings ${crossings.length}`);
  const period = crossings[1] - crossings[0];
  const expected = 2 * Math.PI * Math.sqrt(L / 9.81);
  assert.ok(Math.abs(period - expected) / expected < 0.05, `period ${period} vs ${expected}`);
  // Energy: the bob must swing back to (nearly) its release height.
  assert.ok(maxHeightAfterRelease > releaseY - 0.02, `returns to ${maxHeightAfterRelease} from ${releaseY}`);
});

test('more substeps means less stretch under a violent yank', () => {
  const yank = (substeps) => {
    const world = buildRope({
      origin: [0, 0, 0], direction: [0, -1, 0], segments: 8, segmentLength: 0.2, mass: 0.2,
    });
    world.velocities.fill(0);
    for (let i = 1; i <= 8; i++) world.velocities[i * 3] = 30; // sideways snap
    stepXPBD(world, 1 / 30, { substeps });
    return maxConstraintError(world);
  };
  const coarse = yank(1);
  const fine = yank(40);
  assert.ok(fine < coarse, `stretch coarse ${coarse} vs fine ${fine}`);
  assert.ok(fine < 0.05, `fine stretch ${fine}`);
});

test('single tetrahedron volume is restored exactly, centroid invariant', () => {
  const world = createXPBDWorld(
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [1, 1, 1, 1], { gravity: [0, 0, 0] });
  addVolumeConstraint(world, 0, 1, 2, 3);
  const rest = tetraVolume(world.positions, 0, 1, 2, 3);
  // Crush: move every vertex 40% toward the centroid.
  const c = [0.25, 0.25, 0.25];
  for (let i = 0; i < 4; i++) {
    for (let a = 0; a < 3; a++) {
      const ix = i * 3 + a;
      world.positions[ix] = c[a] + (world.positions[ix] - c[a]) * 0.6;
    }
  }
  assert.ok(tetraVolume(world.positions, 0, 1, 2, 3) < rest * 0.3, 'crushed');
  for (let s = 0; s < 30; s++) stepXPBD(world, 1 / 60, { substeps: 5 });
  const v = tetraVolume(world.positions, 0, 1, 2, 3);
  assert.ok(Math.abs(v - rest) < 1e-9, `volume restored: ${v} vs ${rest}`);
  // Equal masses: constraint corrections sum to zero, centroid cannot move.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < 4; i++) { cx += world.positions[i * 3]; cy += world.positions[i * 3 + 1]; cz += world.positions[i * 3 + 2]; }
  assert.ok(Math.abs(cx / 4 - 0.25) < 1e-9 && Math.abs(cy / 4 - 0.25) < 1e-9 && Math.abs(cz / 4 - 0.25) < 1e-9,
    'centroid invariant');
});

// Unit cube as 12 tets fanning from a center particle (index 8).
function buildTetCube({ withVolume = true, volumeScale = 1 } = {}) {
  const signs = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const positions = signs.map(([x, y, z]) => [x * 0.5, y * 0.5 + 1.2, z * 0.5]);
  positions.push([0, 1.2, 0]);
  const world = createXPBDWorld(positions, new Array(9).fill(1), { groundY: 0 });
  const faces = [[4, 5, 6, 7], [1, 0, 3, 2], [3, 7, 6, 2], [0, 1, 5, 4], [1, 2, 6, 5], [0, 4, 7, 3]];
  const tets = [];
  for (const [q0, q1, q2, q3] of faces) {
    for (const tri of [[q0, q1, q2], [q0, q2, q3]]) {
      let [a, b, cc] = tri;
      if (tetraVolume(world.positions, 8, a, b, cc) < 0) [b, cc] = [cc, b];
      tets.push([8, a, b, cc]);
    }
  }
  const rests = tets.map(([a, b, cc, d]) => tetraVolume(world.positions, a, b, cc, d));
  if (withVolume) {
    tets.forEach(([a, b, cc, d], i) => addVolumeConstraint(world, a, b, cc, d, rests[i] * volumeScale));
  }
  // Outer cube edges only: without volume constraints the shell is floppy.
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [i, j] of edges) addDistanceConstraint(world, i, j);
  const totalVolume = () => tets.reduce((s, [a, b, cc, d]) => s + tetraVolume(world.positions, a, b, cc, d), 0);
  return { world, totalVolume };
}

test('volume constraints preserve soft-body volume through a squash', () => {
  const run = (withVolume) => {
    const { world, totalVolume } = buildTetCube({ withVolume });
    assert.ok(Math.abs(totalVolume() - 1) < 1e-9, 'fixture is a unit cube');
    for (let s = 0; s < 420; s++) stepXPBD(world, 1 / 60, { substeps: 10, damping: 2 });
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < world.count; i++) {
      minY = Math.min(minY, world.positions[i * 3 + 1]);
      maxY = Math.max(maxY, world.positions[i * 3 + 1]);
    }
    return { volume: totalVolume(), height: maxY - minY, minY };
  };
  const withVol = run(true);
  const withoutVol = run(false);
  assert.ok(withVol.minY >= -1e-9 && withoutVol.minY >= -1e-9, 'no ground penetration');
  assert.ok(withVol.height < 1.0, `squashed: height ${withVol.height}`);
  assert.ok(withVol.volume > 0.88 && withVol.volume < 1.08, `volume preserved: ${withVol.volume}`);
  assert.ok(withoutVol.volume < withVol.volume - 0.08,
    `volume constraints matter: ${withoutVol.volume} vs ${withVol.volume}`);
});

test('inflated rest volumes expand the blob to the scaled volume', () => {
  const { world, totalVolume } = buildTetCube({ withVolume: true, volumeScale: 1.4 });
  world.gravity = [0, 0, 0];
  world.groundY = null;
  // Remove the edge constraints' rest influence by dropping them: rebuild
  // volume-only so uniform scaling is an exact solution.
  world.constraints.length = 0;
  for (let s = 0; s < 240; s++) stepXPBD(world, 1 / 60, { substeps: 10, damping: 1 });
  const v = totalVolume();
  assert.ok(v > 1.25 && v < 1.55, `expanded to ${v} (target 1.4)`);
});

test('rope settles on the ground plane without penetration', () => {
  const segments = 6;
  const world = buildRope({
    origin: [0, 0.5, 0], direction: [1, 0, 0], segments, segmentLength: 0.2, mass: 0.1,
  });
  world.groundY = 0;
  world.pins.clear(); // dropped rope: unpin by clearing pins
  world.invMass[0] = 10; // restore inverse mass (pin zeroed it)
  for (let s = 0; s < 300; s++) stepXPBD(world, 1 / 60, { substeps: 10 });
  let minY = Infinity;
  for (let i = 0; i < world.count; i++) minY = Math.min(minY, world.positions[i * 3 + 1]);
  assert.ok(minY >= -1e-9, `penetration ${minY}`);
  assert.ok(minY < 1e-6, `rests on floor: minY ${minY}`);
});

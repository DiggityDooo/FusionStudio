import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, applyImpulse, stepWorld, solveDistanceConstraint, kineticEnergy } from '../src/rigid-body.js';

const DT = 1 / 240;

test('free fall matches the analytic 1/2 g t^2 trajectory', () => {
  const ball = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [0, 10, 0], restitution: 0 });
  const steps = Math.round(1.2 / DT);
  for (let i = 0; i < steps; i++) stepWorld([ball], { dt: DT });
  // Semi-implicit Euler: y = y0 - g * dt^2 * n(n+1)/2.
  const expected = 10 - 9.81 * DT * DT * (steps * (steps + 1)) / 2;
  assert.ok(Math.abs(ball.position[1] - expected) < 1e-6, `y ${ball.position[1]} vs discrete-exact ${expected}`);
  // Continuous oracle within the method's O(dt) error (1/2 g t dt = 0.0245 here).
  assert.ok(Math.abs(ball.position[1] - (10 - 0.5 * 9.81 * 1.44)) < 0.03, 'and close to the continuous oracle');
  assert.ok(Math.abs(ball.velocity[1] + 9.81 * 1.2) < 1e-6, 'velocity exact under semi-implicit Euler');
});

test('bounce apex follows the restitution energy law e^2', () => {
  const ball = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [0, 2.5, 0], restitution: 0.6, friction: 0 });
  let apexAfterBounce = 0, bounced = false;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    stepWorld([ball], { dt: DT });
    if (ball.position[1] <= 0.5001 && ball.velocity[1] > 0) bounced = true;
    if (bounced) apexAfterBounce = Math.max(apexAfterBounce, ball.position[1] - 0.5);
  }
  const dropHeight = 2.0;
  const expected = 0.36 * dropHeight; // e^2 * h
  assert.ok(Math.abs(apexAfterBounce - expected) < 0.04, `apex ${apexAfterBounce.toFixed(3)} vs e^2 h ${expected}`);
});

test('resting contact settles and sleeps without sinking or jitter', () => {
  const ball = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [0, 0.8, 0], restitution: 0.2 });
  for (let i = 0; i < Math.round(4 / DT); i++) stepWorld([ball], { dt: DT });
  assert.ok(ball.sleeping, 'body sleeps');
  assert.ok(Math.abs(ball.position[1] - 0.5) < 1e-9, `rest height ${ball.position[1]}`);
  const yAtSleep = ball.position[1];
  for (let i = 0; i < 240; i++) stepWorld([ball], { dt: DT });
  assert.equal(ball.position[1], yAtSleep, 'sleeping body never drifts');
  // An impulse wakes it.
  applyImpulse(ball, [0, 3, 0], ball.position);
  assert.ok(!ball.sleeping && ball.velocity[1] > 2.9);
});

test('equal-mass elastic sphere collision swaps velocities (momentum + energy oracle)', () => {
  const a = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [-2, 5, 0], velocity: [3, 0, 0], restitution: 1, friction: 0 });
  const b = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [2, 5, 0], velocity: [-1, 0, 0], restitution: 1, friction: 0 });
  const energyBefore = kineticEnergy(a) + kineticEnergy(b);
  const momentumBefore = a.velocity[0] + b.velocity[0];
  for (let i = 0; i < Math.round(1.2 / DT); i++) stepWorld([a, b], { dt: DT, gravity: 0 });
  assert.ok(Math.abs(a.velocity[0] - -1) < 1e-6, `a takes b's velocity (${a.velocity[0]})`);
  assert.ok(Math.abs(b.velocity[0] - 3) < 1e-6, `b takes a's velocity (${b.velocity[0]})`);
  assert.ok(Math.abs((kineticEnergy(a) + kineticEnergy(b)) - energyBefore) < 1e-6, 'energy conserved');
  assert.ok(Math.abs((a.velocity[0] + b.velocity[0]) - momentumBefore) < 1e-9, 'momentum conserved');
});

test('tangential impulse spins a sphere per omega = (r x J) / I; orientation integrates exactly', () => {
  const ball = createBody({ shape: { type: 'sphere', radius: 0.5 }, position: [0, 5, 0], mass: 2 });
  // Impulse +X applied at the top of the sphere (r = +Y * r).
  applyImpulse(ball, [1, 0, 0], [0, 5.5, 0]);
  const I = 0.4 * 2 * 0.25;
  const expectedOmegaZ = -(0.5 * 1) / I; // r x J = (0,0,-0.5)
  assert.ok(Math.abs(ball.angularVelocity[2] - expectedOmegaZ) < 1e-12, `omega_z ${ball.angularVelocity[2]} vs ${expectedOmegaZ}`);
  assert.ok(Math.abs(ball.velocity[0] - 0.5) < 1e-12);
  // Integrate 0.4 s of pure spin (no gravity): quaternion must equal
  // the axis-angle rotation about Z by omega * t.
  const steps = Math.round(0.4 / DT);
  for (let i = 0; i < steps; i++) stepWorld([ball], { dt: DT, gravity: 0 });
  const angle = expectedOmegaZ * 0.4;
  const expectedQ = [Math.cos(angle / 2), 0, 0, Math.sin(angle / 2)];
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(ball.quaternion[i] - expectedQ[i]) < 2e-3, `q[${i}]`);
});

test('distance constraint holds two falling bodies at rod length', () => {
  const a = createBody({ shape: { type: 'sphere', radius: 0.3 }, position: [0, 8, 0], restitution: 0 });
  const b = createBody({ shape: { type: 'sphere', radius: 0.3 }, position: [1.5, 8, 0], restitution: 0 });
  const constraint = { a, b, restLength: 2.5, stiffness: 1 };
  for (let i = 0; i < Math.round(1.0 / DT); i++) stepWorld([a, b], { dt: DT, constraints: [constraint] });
  const dist = Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]);
  assert.ok(Math.abs(dist - 2.5) < 0.01, `rod length ${dist.toFixed(4)}`);
  // Center of mass free-falls on the analytic path despite the rod.
  const comY = (a.position[1] + b.position[1]) / 2;
  assert.ok(Math.abs(comY - (8 - 0.5 * 9.81)) < 0.05, `COM ${comY.toFixed(3)}`);
  assert.throws(() => createBody({ mass: 0 }), /positive/);
  assert.throws(() => stepWorld([a], { dt: 0 }), /positive/);
});

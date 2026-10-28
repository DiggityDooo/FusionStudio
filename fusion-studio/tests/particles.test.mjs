import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticleSystem, emitParticles, stepParticles } from '../src/particles.js';

const gravity = [{ type: 'gravity', direction: [0, -1, 0], strength: 9.81 }];

test('free fall matches the semi-implicit Euler closed form exactly', () => {
  const sys = createParticleSystem(4);
  emitParticles(sys, { count: 1, origin: [0, 10, 0], velocity: [0, 0, 0], life: 100 });
  const dt = 0.02, steps = 50;
  for (let s = 0; s < steps; s++) stepParticles(sys, dt, { fields: gravity });
  // v_n = -g*dt*n; y_n = y0 - g*dt^2 * n(n+1)/2 for semi-implicit Euler.
  // Positions/velocities are Float32-stored (mesh convention), so agreement
  // is to Float32 quantization (~1e-7 at these magnitudes), not float64.
  const expectedY = 10 - 9.81 * dt * dt * steps * (steps + 1) / 2;
  const expectedV = -9.81 * dt * steps;
  assert.ok(Math.abs(sys.positions[1] - expectedY) < 2e-6, `y ${sys.positions[1]} vs ${expectedY}`);
  assert.ok(Math.abs(sys.velocities[1] - expectedV) < 2e-6, `v ${sys.velocities[1]} vs ${expectedV}`);
});

test('drag produces the analytic terminal velocity', () => {
  const sys = createParticleSystem(2);
  emitParticles(sys, { count: 1, origin: [0, 1000, 0], velocity: [0, 0, 0], life: 1000 });
  const drag = 0.5;
  for (let s = 0; s < 3000; s++) stepParticles(sys, 0.01, { fields: gravity, drag });
  const terminal = 9.81 / drag;
  const vy = sys.velocities[1];
  assert.ok(Math.abs(-vy - terminal) / terminal < 0.01, `vy ${vy} vs terminal ${terminal}`);
});

test('plane bounce keeps restitution energy ratio and never penetrates', () => {
  const sys = createParticleSystem(2);
  emitParticles(sys, { count: 1, origin: [0, 2, 0], velocity: [1.5, 0, 0], life: 100 });
  const ground = [{ type: 'plane', point: [0, 0, 0], normal: [0, 1, 0], restitution: 0.5, friction: 0.25 }];
  let minY = Infinity, apexAfterBounce = 0, bouncedVx = null, phase = 0;
  for (let s = 0; s < 400; s++) {
    stepParticles(sys, 0.005, { fields: gravity, colliders: ground });
    const y = sys.positions[1];
    minY = Math.min(minY, y);
    if (phase === 0 && sys.velocities[1] > 0) { phase = 1; bouncedVx = sys.velocities[0]; }
    if (phase === 1) apexAfterBounce = Math.max(apexAfterBounce, y);
  }
  assert.ok(minY >= -1e-9, `penetration ${minY}`);
  // Drop height 2, restitution 0.5 -> rebound apex ~ e^2 * 2 = 0.5.
  assert.ok(apexAfterBounce > 0.4 && apexAfterBounce < 0.6, `apex ${apexAfterBounce}`);
  assert.ok(bouncedVx !== null && bouncedVx <= 1.5 * 0.75 + 1e-6 && bouncedVx > 0, `friction cut vx to ${bouncedVx}`);
});

test('attractor produces a bounded orbit (symplectic integrator)', () => {
  const sys = createParticleSystem(2);
  const fields = [{ type: 'attractor', center: [0, 0, 0], strength: 4, softening: 2 }];
  // Circular-orbit speed at r=2: v = sqrt(r * F(r)) = sqrt(2 * 4/(4+4)) = 1.
  // (At v = sqrt(2) the orbit is eccentric with apoapsis ~5.4 by energy
  // conservation -- the integrator follows the force law either way.)
  emitParticles(sys, { count: 1, origin: [2, 0, 0], velocity: [0, 1, 0], life: 1000 });
  let minR = Infinity, maxR = 0, angle = 0, prevAngle = 0;
  for (let s = 0; s < 2000; s++) {
    stepParticles(sys, 0.005, { fields });
    const [x, y] = [sys.positions[0], sys.positions[1]];
    const r = Math.hypot(x, y);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    const a = Math.atan2(y, x);
    let da = a - prevAngle;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    angle += da; prevAngle = a;
  }
  assert.ok(minR > 1.7 && maxR < 2.3, `radius band [${minR}, ${maxR}]`);
  assert.ok(angle > 2, `swept angle ${angle}`);
});

test('lifespan, capacity, and death compaction', () => {
  const sys = createParticleSystem(10);
  const spawned = emitParticles(sys, { count: 20, origin: [0, 0, 0], velocity: [0, 1, 0], life: 0.5 });
  assert.equal(spawned, 10, 'pool caps emission');
  assert.equal(sys.alive, 10);
  stepParticles(sys, 0.3, {});
  assert.equal(sys.alive, 10, 'still alive before lifespan');
  stepParticles(sys, 0.3, {});
  assert.equal(sys.alive, 0, 'all dead after lifespan');
  // Freed slots are reusable.
  assert.equal(emitParticles(sys, { count: 3, velocity: [0, 1, 0], life: 5 }), 3);
  assert.equal(sys.alive, 3);
});

test('emission is deterministic per seed and curl advection stays finite', () => {
  const spec = { count: 50, origin: [0, 0, 0], direction: [0, 1, 0], speed: 3, spread: 0.4, life: 10, lifeSpread: 0.3 };
  const fields = [{ type: 'curlNoise', scale: 0.4, seed: 9, strength: 2 }];
  const run = (seed) => {
    const sys = createParticleSystem(64, { seed });
    emitParticles(sys, spec);
    for (let s = 0; s < 100; s++) stepParticles(sys, 0.016, { fields });
    return Float32Array.from(sys.positions.slice(0, sys.alive * 3));
  };
  const a = run(5), b = run(5), c = run(6);
  assert.deepEqual(a, b, 'same seed, same result');
  assert.notDeepEqual(a, c, 'different seed differs');
  let moved = 0;
  for (let i = 0; i < a.length; i++) {
    assert.ok(Number.isFinite(a[i]), 'no NaN');
    moved = Math.max(moved, Math.abs(a[i]));
  }
  assert.ok(moved > 0.5, 'curl field actually advects particles');
});

test('invalid capacity rejected', () => {
  assert.throws(() => createParticleSystem(0), RangeError);
});

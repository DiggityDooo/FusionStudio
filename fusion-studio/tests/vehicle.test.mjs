import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicle, stepVehicle, driveFor, snapshot, vehicleForces, axleLoads, wheelAngularSpeed, DEFAULT_VEHICLE } from '../src/vehicle.js';

const WHEELBASE = DEFAULT_VEHICLE.frontAxle + DEFAULT_VEHICLE.rearAxle;

test('steady cornering converges to the kinematic bicycle yaw rate', () => {
  const car = createVehicle();
  car.vx = 10;
  const steer = 0.06;
  // Hold speed roughly constant with modest throttle against drag.
  const samples = driveFor(car, { throttle: 0.03, brake: 0, steer }, { duration: 8, dt: 1 / 240, sampleEvery: 240 });
  const tail = samples.slice(-3);
  for (const s of tail) {
    const kinematic = s.vx * Math.tan(steer) / WHEELBASE;
    // The dynamic model understeers slightly vs the kinematic limit
    // (understeer gradient); at this mild steer the gap is ~6%.
    const ratio = s.yawRate / kinematic;
    assert.ok(ratio > 0.85 && ratio < 1.02,
      `yaw ${s.yawRate.toFixed(4)} vs kinematic ${kinematic.toFixed(4)} at v=${s.vx.toFixed(2)} (ratio ${ratio.toFixed(3)})`);
    assert.ok(Math.abs(s.speed - 10) < 1.5, 'cruise throttle roughly holds speed');
  }
  assert.ok(car.heading > 1, 'the car actually turned');
});

test('full braking stops within the friction-limit distance', () => {
  const car = createVehicle();
  car.vx = 30;
  const mu = DEFAULT_VEHICLE.mu, g = DEFAULT_VEHICLE.gravity;
  let distance = 0, prevX = car.x, prevY = car.y;
  for (let s = 0; s < 240 * 20 && car.vx > 0.01; s++) {
    stepVehicle(car, { brake: 1 }, 1 / 240);
    distance += Math.hypot(car.x - prevX, car.y - prevY);
    prevX = car.x; prevY = car.y;
  }
  const frictionOnly = (30 * 30) / (2 * mu * g);
  assert.ok(car.vx <= 0.01, 'car stopped');
  assert.ok(distance > frictionOnly * 0.95, `distance ${distance.toFixed(1)} not shorter than physics allows (${frictionOnly.toFixed(1)})`);
  assert.ok(distance < frictionOnly * 1.25, `distance ${distance.toFixed(1)} vs friction limit ${frictionOnly.toFixed(1)} (drag/rolling only help)`);
});

test('launch acceleration is capped by tire friction, not engine force', () => {
  const heavy = createVehicle({ maxEngineForce: 1e9 });
  heavy.vx = 0.1;
  const before = heavy.vx;
  stepVehicle(heavy, { throttle: 1 }, 0.05);
  const accel = (heavy.vx - before) / 0.05;
  const cap = heavy.params.mu * heavy.params.gravity;
  assert.ok(accel <= cap + 1e-9, `launch accel ${accel.toFixed(2)} exceeds friction cap ${cap.toFixed(2)} despite a huge engine`);
  assert.ok(accel > cap * 0.9, 'and it genuinely reaches the cap');
  const forces = vehicleForces(heavy, { throttle: 0 });
  const loads = axleLoads(heavy.params);
  assert.ok(Math.abs(forces.fyFront) <= heavy.params.mu * loads.front + 1e-9);
  assert.ok(Math.abs(forces.fyRear) <= heavy.params.mu * loads.rear + 1e-9);
});

test('high-speed cornering saturates at the tire friction limit', () => {
  const car = createVehicle();
  car.vx = 30;
  const steer = 0.12;
  const latCap = DEFAULT_VEHICLE.mu * DEFAULT_VEHICLE.gravity;
  let maxLatForce = 0;
  for (let s = 0; s < 240 * 2; s++) {
    const f = vehicleForces(car, { throttle: 0.35, steer });
    maxLatForce = Math.max(maxLatForce, Math.abs(f.fyFront + f.fyRear) / car.params.mass);
    stepVehicle(car, { throttle: 0.35, steer }, 1 / 240);
  }
  assert.ok(maxLatForce <= latCap + 1e-6, `tire lateral force peaked at ${maxLatForce.toFixed(2)} (cap ${latCap.toFixed(2)})`);
  assert.ok(maxLatForce > latCap * 0.95, 'the tires genuinely reach saturation in this maneuver');
  const kinematic = car.vx * Math.tan(steer) / WHEELBASE;
  assert.ok(car.yawRate > 0.3, `car is turning (yaw ${car.yawRate.toFixed(3)})`);
  assert.ok(car.yawRate < kinematic * 0.75,
    `saturated yaw ${car.yawRate.toFixed(3)} well below kinematic demand ${kinematic.toFixed(3)}`);
});

test('straight-line driving stays straight; wheel speed matches rolling', () => {
  const car = createVehicle();
  car.vx = 12;
  driveFor(car, { throttle: 0.1, steer: 0 }, { duration: 3, dt: 1 / 240 });
  assert.ok(Math.abs(car.y) < 1e-6, `no lateral drift (y=${car.y})`);
  assert.ok(Math.abs(car.heading) < 1e-9);
  assert.ok(Math.abs(wheelAngularSpeed(car) - car.vx / car.params.wheelRadius) < 1e-9);
  const snap = snapshot(car);
  assert.ok(Math.abs(snap.speed - Math.abs(car.vx)) < 1e-9);
  assert.throws(() => stepVehicle(car, {}, 0), /dt must be positive/);
});

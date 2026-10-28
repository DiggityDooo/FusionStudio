'use strict';
// Vehicle and wheel physics (A19 "Vehicle and wheel physics"): a
// dynamic bicycle model with linear-range tire forces saturated by a
// per-axle friction limit (mu * static load). At low lateral demand
// it converges to the kinematic bicycle (yaw rate = v * tan(steer) /
// wheelbase); at high demand the friction cap produces understeer.

export const DEFAULT_VEHICLE = {
  mass: 1200,          // kg
  inertiaZ: 1800,      // kg m^2
  frontAxle: 1.2,      // CG to front axle, m
  rearAxle: 1.4,       // CG to rear axle, m
  corneringFront: 60000, // N/rad
  corneringRear: 60000,  // N/rad
  mu: 0.9,
  gravity: 9.81,
  dragQuad: 0.35,      // N / (m/s)^2
  rollingResistance: 0.012,
  maxEngineForce: 9000,  // N at throttle 1
  maxBrakeForce: 14000,  // N at brake 1 (further capped by friction)
  wheelRadius: 0.33,
};

export function createVehicle(params = {}) {
  return {
    params: { ...DEFAULT_VEHICLE, ...params },
    x: 0, y: 0, heading: 0,
    vx: 0, vy: 0, yawRate: 0,
  };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Static axle loads (N). */
export function axleLoads(p) {
  const L = p.frontAxle + p.rearAxle;
  return {
    front: p.mass * p.gravity * (p.rearAxle / L),
    rear: p.mass * p.gravity * (p.frontAxle / L),
  };
}

/**
 * Tire/vehicle forces for a state + input. Returns lateral axle
 * forces, longitudinal force, and slip angles -- exposed so tests and
 * debug views can verify saturation directly.
 */
export function vehicleForces(vehicle, { throttle = 0, brake = 0, steer = 0 } = {}) {
  const p = vehicle.params;
  const loads = axleLoads(p);
  const vxSafe = Math.abs(vehicle.vx) < 0.5 ? 0.5 * Math.sign(vehicle.vx || 1) : vehicle.vx;
  const alphaFront = steer - Math.atan2(vehicle.vy + p.frontAxle * vehicle.yawRate, vxSafe);
  const alphaRear = -Math.atan2(vehicle.vy - p.rearAxle * vehicle.yawRate, vxSafe);
  const capFront = p.mu * loads.front, capRear = p.mu * loads.rear;
  // alphaFront = steer - velocityAngle(front), alphaRear =
  // -(velocityAngle(rear)); tire force acts along +C * alpha in these
  // conventions (force toward the wheel plane's heading).
  const fyFront = clamp(p.corneringFront * alphaFront, -capFront, capFront);
  const fyRear = clamp(p.corneringRear * alphaRear, -capRear, capRear);
  const frictionCap = p.mu * p.mass * p.gravity;
  // Drive force is friction-capped too: tires cannot push harder than mu*N.
  const engineForce = clamp(throttle * p.maxEngineForce, -frictionCap, frictionCap);
  let fx = engineForce - brake * Math.min(p.maxBrakeForce, frictionCap) * Math.sign(vehicle.vx || 1);
  fx -= p.dragQuad * vehicle.vx * Math.abs(vehicle.vx);
  fx -= p.rollingResistance * p.mass * p.gravity * Math.sign(vehicle.vx || 0);
  if (vehicle.vx === 0 && brake > 0) fx = Math.max(0, fx); // brakes cannot reverse the car
  return { fyFront, fyRear, fx, alphaFront, alphaRear, loads };
}

/** Advance the vehicle. Input steer in radians (road-wheel angle). */
export function stepVehicle(vehicle, input, dt) {
  if (!(dt > 0)) throw new Error('vehicle: dt must be positive');
  const p = vehicle.params;
  const steer = clamp(input.steer || 0, -0.6, 0.6);
  const { fyFront, fyRear, fx } = vehicleForces(vehicle, { ...input, steer });
  const ax = (fx - fyFront * Math.sin(steer)) / p.mass + vehicle.vy * vehicle.yawRate;
  const ay = (fyFront * Math.cos(steer) + fyRear) / p.mass - vehicle.vx * vehicle.yawRate;
  const yawAcc = (p.frontAxle * fyFront * Math.cos(steer) - p.rearAxle * fyRear) / p.inertiaZ;
  vehicle.vx += ax * dt;
  vehicle.vy += ay * dt;
  vehicle.yawRate += yawAcc * dt;
  if (vehicle.vx < 0 && (input.throttle || 0) === 0) vehicle.vx = 0; // no reverse without throttle input model
  vehicle.heading += vehicle.yawRate * dt;
  const cos = Math.cos(vehicle.heading), sin = Math.sin(vehicle.heading);
  vehicle.x += (vehicle.vx * cos - vehicle.vy * sin) * dt;
  vehicle.y += (vehicle.vx * sin + vehicle.vy * cos) * dt;
  return vehicle;
}

/** Simulate a duration at fixed input; returns sampled states. */
export function driveFor(vehicle, input, { duration = 1, dt = 1 / 240, sampleEvery = 0 } = {}) {
  const steps = Math.max(1, Math.round(duration / dt));
  const samples = [];
  for (let s = 0; s < steps; s++) {
    stepVehicle(vehicle, input, dt);
    if (sampleEvery > 0 && s % sampleEvery === 0) samples.push(snapshot(vehicle));
  }
  samples.push(snapshot(vehicle));
  return samples;
}

export function snapshot(vehicle) {
  return {
    x: vehicle.x, y: vehicle.y, heading: vehicle.heading,
    vx: vehicle.vx, vy: vehicle.vy, yawRate: vehicle.yawRate,
    speed: Math.hypot(vehicle.vx, vehicle.vy),
    lateralAccel: vehicle.vx * vehicle.yawRate,
  };
}

/** Wheel ground speed / angular speed for a driven wheel. */
export function wheelAngularSpeed(vehicle) {
  return vehicle.vx / vehicle.params.wheelRadius;
}

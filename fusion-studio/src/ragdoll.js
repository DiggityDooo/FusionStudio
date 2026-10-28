'use strict';
// Ragdoll physics (A19 "Ragdoll physics"): an articulated humanoid of
// rigid bodies joined by distance-constraint rods, simulated with
// src/rigid-body.js. Segment bodies are spheres at segment midpoints;
// rods connect adjacent body centers at their build-time distance.

import { createBody, stepWorld } from './rigid-body.js';

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Build a standing ragdoll. Returns { bodies, constraints, joints,
 * bodyByName }. origin is the ground point under the feet.
 */
export function buildRagdoll({ height = 1.8, origin = [0, 0, 0], totalMass = 70 } = {}) {
  const H = height;
  const J = {
    ankleL: [-0.09 * H, 0.08 * H, 0], ankleR: [0.09 * H, 0.08 * H, 0],
    kneeL: [-0.095 * H, 0.28 * H, 0], kneeR: [0.095 * H, 0.28 * H, 0],
    hipL: [-0.09 * H, 0.52 * H, 0], hipR: [0.09 * H, 0.52 * H, 0],
    pelvis: [0, 0.53 * H, 0],
    chest: [0, 0.72 * H, 0],
    neck: [0, 0.83 * H, 0],
    head: [0, 0.92 * H, 0],
    shoulderL: [-0.22 * H, 0.80 * H, 0], shoulderR: [0.22 * H, 0.80 * H, 0],
    elbowL: [-0.26 * H, 0.60 * H, 0], elbowR: [0.26 * H, 0.60 * H, 0],
    wristL: [-0.27 * H, 0.42 * H, 0], wristR: [0.27 * H, 0.42 * H, 0],
  };
  for (const key of Object.keys(J)) {
    J[key] = [J[key][0] + origin[0], J[key][1] + origin[1], J[key][2] + origin[2]];
  }
  // name, jointA, jointB (body spans the segment), radius, massShare
  const segments = [
    ['pelvis', 'hipL', 'hipR', 0.085 * H, 0.14],
    ['torso', 'pelvis', 'chest', 0.095 * H, 0.22],
    ['head', 'neck', 'head', 0.065 * H, 0.07],
    ['upperArmL', 'shoulderL', 'elbowL', 0.035 * H, 0.028],
    ['upperArmR', 'shoulderR', 'elbowR', 0.035 * H, 0.028],
    ['forearmL', 'elbowL', 'wristL', 0.03 * H, 0.02],
    ['forearmR', 'elbowR', 'wristR', 0.03 * H, 0.02],
    ['thighL', 'hipL', 'kneeL', 0.06 * H, 0.10],
    ['thighR', 'hipR', 'kneeR', 0.06 * H, 0.10],
    ['shinL', 'kneeL', 'ankleL', 0.045 * H, 0.045],
    ['shinR', 'kneeR', 'ankleR', 0.045 * H, 0.045],
  ];
  const links = [
    ['pelvis', 'torso'], ['torso', 'head'],
    ['torso', 'upperArmL'], ['torso', 'upperArmR'],
    ['upperArmL', 'forearmL'], ['upperArmR', 'forearmR'],
    ['pelvis', 'thighL'], ['pelvis', 'thighR'],
    ['thighL', 'shinL'], ['thighR', 'shinR'],
    // Shoulder/hip width stabilizers: keep limbs from folding through.
    ['upperArmL', 'pelvis'], ['upperArmR', 'pelvis'],
  ];
  const bodyByName = {};
  const bodies = segments.map(([name, ja, jb, radius, share]) => {
    const body = createBody({
      shape: { type: 'sphere', radius },
      position: lerp3(J[ja], J[jb], 0.5),
      mass: totalMass * share,
      restitution: 0.1,
      friction: 0.7,
    });
    body.name = name;
    bodyByName[name] = body;
    return body;
  });
  const constraints = links.map(([a, b]) => {
    const A = bodyByName[a], B = bodyByName[b];
    const restLength = Math.hypot(
      B.position[0] - A.position[0], B.position[1] - A.position[1], B.position[2] - A.position[2],
    );
    return { a: A, b: B, restLength, stiffness: 1 };
  });
  return { bodies, constraints, joints: J, bodyByName };
}

/** Simulate; returns the rig after `seconds`. */
export function simulateRagdoll(rig, seconds, { dt = 1 / 240, gravity = -9.81, groundY = 0, constraintIterations = 10, damping = 0.5 } = {}) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    stepWorld(rig.bodies, {
      dt, gravity, groundY, constraints: rig.constraints, constraintIterations,
      linearDamping: damping, angularDamping: damping,
    });
  }
  return rig;
}

export function centerOfMass(bodies) {
  let total = 0;
  const com = [0, 0, 0];
  for (const b of bodies) {
    total += b.mass;
    com[0] += b.position[0] * b.mass;
    com[1] += b.position[1] * b.mass;
    com[2] += b.position[2] * b.mass;
  }
  return com.map((v) => v / total);
}

export function maxConstraintError(rig) {
  let worst = 0;
  for (const c of rig.constraints) {
    const d = Math.hypot(
      c.b.position[0] - c.a.position[0], c.b.position[1] - c.a.position[1], c.b.position[2] - c.a.position[2],
    );
    worst = Math.max(worst, Math.abs(d - c.restLength));
  }
  return worst;
}

export function totalKineticEnergy(bodies) {
  return bodies.reduce((sum, b) => sum + 0.5 * b.mass * b.velocity.reduce((s, v) => s + v * v, 0), 0);
}

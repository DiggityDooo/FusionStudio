import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPairCorrection, applyPlaneCorrection, capsuleContact, capsuleContacts,
  capsulePlaneContact, capsuleSphereContact, closestPointsBetweenSegments,
} from '../src/capsule-collision.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const vecNear = (a, b, eps = 1e-9) => a.every((v, i) => near(v, b[i], eps));

test('segment-segment closest points match analytic configurations', () => {
  // Skew: X axis segment vs vertical segment offset in Z.
  let r = closestPointsBetweenSegments([0, 0, 0], [2, 0, 0], [1, -1, 1], [1, 1, 1]);
  assert.ok(vecNear(r.a, [1, 0, 0]) && vecNear(r.b, [1, 0, 1]) && near(r.distance, 1), JSON.stringify(r));
  // Crossing diagonals: meet exactly at the center.
  r = closestPointsBetweenSegments([0, 0, 0], [2, 2, 0], [0, 2, 0], [2, 0, 0]);
  assert.ok(near(r.distance, 0) && vecNear(r.a, [1, 1, 0]) && vecNear(r.b, [1, 1, 0]));
  // Endpoint-endpoint clamping.
  r = closestPointsBetweenSegments([0, 0, 0], [1, 0, 0], [3, 1, 0], [3, 2, 0]);
  assert.ok(vecNear(r.a, [1, 0, 0]) && vecNear(r.b, [3, 1, 0]) && near(r.distance, Math.sqrt(5)));
  // Parallel axes: distance only (closest points not unique).
  r = closestPointsBetweenSegments([0, 0, 0], [2, 0, 0], [0, 1, 3], [2, 1, 3]);
  assert.ok(near(r.distance, Math.sqrt(10)), `parallel distance ${r.distance}`);
  // Degenerate segment behaves as a point.
  r = closestPointsBetweenSegments([0, 2, 0], [0, 2, 0], [-1, 0, 0], [1, 0, 0]);
  assert.ok(near(r.distance, 2) && vecNear(r.a, [0, 2, 0]) && vecNear(r.b, [0, 0, 0]));
});

test('capsule contacts: depth, normal, separation, and crossing bones', () => {
  const bone = (a, b, radius = 1) => ({ a, b, radius });
  // Parallel spines 1.5 apart, r=1 each: overlap 0.5, normal +Y from B to A.
  let c = capsuleContact(bone([0, 1.5, 0], [2, 1.5, 0]), bone([0, 0, 0], [2, 0, 0]));
  assert.ok(near(c.depth, 0.5) && vecNear(c.normal, [0, 1, 0]), JSON.stringify(c));
  // Separated: no contact.
  assert.equal(capsuleContact(bone([0, 2.5, 0], [2, 2.5, 0]), bone([0, 0, 0], [2, 0, 0])), null);
  // Crossing spines: distance 0, full radii as depth, point at crossing.
  c = capsuleContact(bone([0, 0, 0], [2, 2, 0], 0.3), bone([0, 2, 0], [2, 0, 0], 0.4));
  assert.ok(near(c.depth, 0.7) && vecNear(c.point, [1, 1, 0]), JSON.stringify(c));
  // Sphere on a capsule: axis distance drives depth.
  const s = capsuleSphereContact({ a: [0, 0, 0], b: [2, 0, 0], radius: 0.5 }, [0.5, 0.9, 0], 0.5);
  assert.ok(near(s.depth, 0.1) && near(s.s, 0.25) && vecNear(s.normal, [0, -1, 0]), JSON.stringify(s));
  assert.equal(capsuleSphereContact({ a: [0, 0, 0], b: [2, 0, 0], radius: 0.5 }, [0.5, 3, 0], 0.5), null);
  // Ground plane: deepest endpoint rules; horizontal capsule rests on both ends.
  const p = capsulePlaneContact({ a: [0, 0.3, 0], b: [2, 0.8, 0], radius: 0.5 }, 0);
  assert.ok(near(p.depth, 0.2) && p.s === 0 && vecNear(p.point, [0, 0.3, 0]));
  assert.equal(capsulePlaneContact({ a: [0, 0.6, 0], b: [2, 0.8, 0], radius: 0.5 }, 0), null);
});

test('pair correction separates exactly and conserves the shared midpoint', () => {
  const A = { a: [0, 1.5, 0], b: [2, 1.5, 0], radius: 1, invMass: 1 };
  const B = { a: [0, 0, 0], b: [2, 0, 0], radius: 1, invMass: 1 };
  const midBefore = [1, 0.75, 0];
  for (let iter = 0; iter < 8; iter++) {
    const c = capsuleContact(A, B);
    if (!c) break;
    applyPairCorrection(A, B, c);
  }
  assert.equal(capsuleContact(A, B), null, 'just touching after correction');
  const spineMid = (c) => [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2];
  const midAfter = [
    (spineMid(A)[0] + spineMid(B)[0]) / 2,
    (spineMid(A)[1] + spineMid(B)[1]) / 2,
    (spineMid(A)[2] + spineMid(B)[2]) / 2,
  ];
  assert.ok(vecNear(midAfter, midBefore), 'equal masses: pair midpoint conserved');
  // Static partner takes no motion; dynamic one takes the full depth.
  const dyn = { a: [0, 1.5, 0], b: [2, 1.5, 0], radius: 1, invMass: 1 };
  const stat = { a: [0, 0, 0], b: [2, 0, 0], radius: 1, invMass: 0 };
  for (let iter = 0; iter < 8; iter++) {
    const c = capsuleContact(dyn, stat);
    if (!c) break;
    applyPairCorrection(dyn, stat, c);
  }
  assert.equal(capsuleContact(dyn, stat), null, 'dynamic capsule fully separated from static');
  assert.ok(vecNear(stat.a, [0, 0, 0]) && vecNear(stat.b, [2, 0, 0]), 'static capsule never moves');
  assert.ok(near(dyn.a[1], 2, 1e-6) && near(dyn.b[1], 2, 1e-6), `dynamic capsule rests on top: ${JSON.stringify(dyn)}`);
  // Lever weighting: a contact at A's tip moves mostly that endpoint.
  const tip = { a: [0, 0, 0], b: [2, 0, 0], radius: 0.5, invMass: 1 };
  const other = { a: [2, 0.8, 0], b: [2, 3, 0], radius: 0.5, invMass: 0 };
  const contact = capsuleContact(tip, other);
  assert.ok(contact && near(contact.sA, 1), `contact at tip s=${contact?.sA}`);
  applyPairCorrection(tip, other, contact);
  assert.ok(Math.abs(tip.a[1]) < 1e-12 && Math.abs(tip.b[1] + contact.depth) < 1e-9,
    `tip endpoint takes the correction: a=${tip.a} b=${tip.b}`);
  // Plane correction lifts the low endpoint exactly onto the surface.
  const cap = { a: [0, 0.3, 0], b: [2, 0.8, 0], radius: 0.5, invMass: 1 };
  applyPlaneCorrection(cap, capsulePlaneContact(cap, 0));
  assert.ok(near(cap.a[1], 0.5) && near(cap.b[1], 0.8), JSON.stringify(cap));
});

test('capsule world: a dropped capsule settles on the ground without sinking', () => {
  const cap = { a: [0, 2.0, 0], b: [0.8, 2.6, 0], radius: 0.25, invMass: 1 };
  const vel = { a: [0, 0, 0], b: [0, 0, 0] };
  const dt = 1 / 240, g = -9.81;
  const restLen = Math.hypot(cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]);
  let maxPenetrationAfterSolve = 0;
  for (let step = 0; step < 240 * 3; step++) {
    for (const end of ['a', 'b']) {
      vel[end][1] += g * dt;
      cap[end] = cap[end].map((v, i) => v + vel[end][i] * dt);
    }
    for (let iter = 0; iter < 8; iter++) {
      // Rod constraint keeps the spine rigid.
      const d = [cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]];
      const len = Math.hypot(...d) || 1;
      const diff = (len - restLen) / len * 0.5;
      cap.a = cap.a.map((v, i) => v + d[i] * diff);
      cap.b = cap.b.map((v, i) => v - d[i] * diff);
      const contact = capsulePlaneContact(cap, 0);
      if (contact) applyPlaneCorrection(cap, contact);
    }
    // Velocity from positions (PBD-style), then kill ground penetration velocity.
    for (const end of ['a', 'b']) {
      // (prev positions not tracked; use restitution-free damping toward rest)
    }
    const contact = capsulePlaneContact(cap, 0);
    maxPenetrationAfterSolve = Math.max(maxPenetrationAfterSolve, contact ? contact.depth : 0);
    // Simple settle: bleed vertical velocity when in contact.
    if (contact) { vel.a[1] *= 0.8; vel.b[1] *= 0.8; }
  }
  assert.ok(maxPenetrationAfterSolve < 0.02, `residual penetration ${maxPenetrationAfterSolve}`);
  const lowY = Math.min(cap.a[1], cap.b[1]);
  assert.ok(Math.abs(lowY - 0.25) < 0.02, `capsule rests at spine height ${lowY} (radius 0.25)`);
  const lenNow = Math.hypot(cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]);
  assert.ok(Math.abs(lenNow - restLen) < 1e-6, 'spine stays rigid');
  const contacts = capsuleContacts([cap, { a: [0, 0.25, 0], b: [1, 0.25, 0], radius: 0.25 }]);
  assert.ok(contacts.length === 1 && contacts[0].i === 0 && contacts[0].j === 1, 'pair enumeration finds the resting contact');
});

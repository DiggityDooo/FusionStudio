'use strict';
// Capsule collision (A19 "Collision proxies and collision shapes" /
// "Ragdoll physics"): closest points between capsule spine segments,
// contact generation (capsule-capsule, capsule-sphere, capsule-
// ground-plane), and mass-weighted positional correction distributed
// to spine endpoints by contact lever (1-s, s). Capsules are
// { a: [x,y,z], b: [x,y,z], radius, invMass? } (invMass 0 = static).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

/**
 * Closest points between segments p1-q1 and p2-q2 (Ericson's
 * segment-segment algorithm; degenerate segments act as points).
 * Returns { a, b, s, t, distance } with a on segment 1 at parameter
 * s, b on segment 2 at t.
 */
export function closestPointsBetweenSegments(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-15 && e <= 1e-15) {
    s = 0; t = 0;
  } else if (a <= 1e-15) {
    s = 0; t = clamp01(f / e);
  } else if (e <= 1e-15) {
    const c = dot(d1, r);
    t = 0; s = clamp01(-c / a);
  } else {
    const c = dot(d1, r), b = dot(d1, d2), denom = a * e - b * b;
    s = denom > 1e-15 ? clamp01((b * f - c * e) / denom) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp01(-c / a); }
    else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    if (denom <= 1e-12 * a * e) {
      // Near-parallel spines: the closest pair is not unique. Pick
      // the center of the overlapping projection interval so the
      // contact lever is representative (an endpoint pick would
      // just rotate the capsule under correction).
      const u1 = dot(sub(p2, p1), d1) / a, u2 = dot(sub(q2, p1), d1) / a;
      const lo = Math.max(0, Math.min(u1, u2)), hi = Math.min(1, Math.max(u1, u2));
      if (hi > lo) {
        s = (lo + hi) / 2;
        t = clamp01(dot(sub(lerp(p1, q1, s), p2), d2) / e);
      }
    }
  }
  const pa = lerp(p1, q1, s), pb = lerp(p2, q2, t);
  return { a: pa, b: pb, s, t, distance: Math.hypot(...sub(pa, pb)) };
}

/**
 * Capsule-capsule contact, or null when separated. Normal points
 * from capsule B toward capsule A; point is the midpoint between
 * the two spine closest points.
 */
export function capsuleContact(capA, capB) {
  const { a, b, s, t, distance } = closestPointsBetweenSegments(capA.a, capA.b, capB.a, capB.b);
  const depth = capA.radius + capB.radius - distance;
  if (depth <= 0) return null;
  let normal;
  if (distance > 1e-12) {
    normal = scale(sub(a, b), 1 / distance);
  } else {
    // Concentric spines: fall back to A's spine direction crossed
    // with any non-parallel axis (deterministic).
    const d = sub(capA.b, capA.a);
    const len = Math.hypot(...d);
    const axis = len > 1e-12 ? scale(d, 1 / len) : [1, 0, 0];
    const ref = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = [
      axis[1] * ref[2] - axis[2] * ref[1],
      axis[2] * ref[0] - axis[0] * ref[2],
      axis[0] * ref[1] - axis[1] * ref[0],
    ];
    const cl = Math.hypot(...cross) || 1;
    normal = scale(cross, 1 / cl);
  }
  return { normal, depth, point: scale(add(a, b), 0.5), sA: s, sB: t, spineA: a, spineB: b };
}

/** Capsule vs sphere contact (normal from sphere toward capsule spine point). */
export function capsuleSphereContact(cap, center, radius) {
  const d1 = sub(cap.b, cap.a);
  const len2 = dot(d1, d1);
  const s = len2 <= 1e-15 ? 0 : clamp01(dot(sub(center, cap.a), d1) / len2);
  const spine = lerp(cap.a, cap.b, s);
  const delta = sub(spine, center);
  const distance = Math.hypot(...delta);
  const depth = cap.radius + radius - distance;
  if (depth <= 0) return null;
  const normal = distance > 1e-12 ? scale(delta, 1 / distance) : [0, 1, 0];
  return { normal, depth, point: spine, s };
}

/** Capsule vs ground plane y = planeY contact at the deepest spine endpoint. */
export function capsulePlaneContact(cap, planeY = 0) {
  const aLow = cap.a[1] <= cap.b[1];
  const low = aLow ? cap.a : cap.b;
  const depth = cap.radius - (low[1] - planeY);
  if (depth <= 0) return null;
  return { normal: [0, 1, 0], depth, point: low, s: aLow ? 0 : 1 };
}

/**
 * Positional correction for a capsule pair contact: endpoints move
 * weighted by their lever (1-s, s) and the capsules' inverse
 * masses. Static capsules (invMass 0) do not move; the pair's
 * spine midpoint is conserved when masses are equal.
 */
export function applyPairCorrection(capA, capB, contact) {
  const wA = capA.invMass ?? 1, wB = capB.invMass ?? 1;
  if (contact.depth <= 0) return;
  // Gradient-weighted PBD distribution: the contact point rides the
  // spine at parameter s, so endpoint a carries gradient weight
  // (1-s), endpoint b carries s. Effective inverse mass at the
  // contact is w*((1-s)^2 + s^2) per capsule; lambda solves the
  // penetration exactly along the normal.
  const eff = (w, s) => w * ((1 - s) * (1 - s) + s * s);
  const denom = eff(wA, contact.sA) + eff(wB, contact.sB);
  if (denom <= 0) return;
  const lambda = contact.depth / denom;
  const shift = (cap, s, w, sign) => {
    if (w <= 0) return;
    const base = scale(contact.normal, sign * lambda * w);
    cap.a = add(cap.a, scale(base, 1 - s));
    cap.b = add(cap.b, scale(base, s));
  };
  shift(capA, contact.sA, wA, 1);
  shift(capB, contact.sB, wB, -1);
}

/** Positional correction pushing a capsule out of the ground plane. */
export function applyPlaneCorrection(cap, contact) {
  const w = cap.invMass ?? 1;
  if (w <= 0 || contact.depth <= 0) return;
  const move = [0, contact.depth, 0];
  const s = contact.s;
  cap.a = add(cap.a, scale(move, 1 - s));
  cap.b = add(cap.b, scale(move, s));
}

/** All pairwise capsule contacts in a set (i < j), in index order. */
export function capsuleContacts(capsules) {
  const contacts = [];
  for (let i = 0; i < capsules.length; i++) {
    for (let j = i + 1; j < capsules.length; j++) {
      const contact = capsuleContact(capsules[i], capsules[j]);
      if (contact) contacts.push({ i, j, ...contact });
    }
  }
  return contacts;
}

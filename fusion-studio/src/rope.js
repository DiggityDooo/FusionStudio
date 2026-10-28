'use strict';
// Rope, chain and cable simulation (A19 "Rope, chain and cable
// simulation"): Verlet particles joined by distance constraints,
// solved with relaxation iterations. Pinned points are exact; segment
// lengths are preserved to solver tolerance; a hanging chain settles
// to the catenary.

/**
 * Create a rope from points [[x,y,z],...]. Consecutive points are
 * linked by distance constraints at their initial spacing (or
 * `segmentLength` when given). options: { pinned: [indices],
 * gravity: [x,y,z], damping: 0..1 (velocity retained per step) }.
 */
export function createRope(points, { pinned = [], gravity = [0, -9.81, 0], damping = 0.999, segmentLength = null } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('rope: needs at least 2 points');
  const positions = new Float32Array(points.length * 3);
  const previous = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    positions.set(p, i * 3);
    previous.set(p, i * 3);
  });
  const restLengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentLength !== null) { restLengths.push(segmentLength); continue; }
    const a = i * 3, b = (i + 1) * 3;
    restLengths.push(Math.hypot(
      positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]));
  }
  return {
    positions, previous, restLengths,
    pinned: new Set(pinned),
    gravity: [...gravity],
    damping,
    count: points.length,
    totalLength: restLengths.reduce((s, v) => s + v, 0),
  };
}

/** Convenience: a straight cable between two points. */
export function createCable(start, end, segments, options = {}) {
  if (!Number.isInteger(segments) || segments < 1) throw new Error('rope: segments must be a positive integer');
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ]);
  }
  return createRope(points, { pinned: [0, segments], ...options });
}

export function pinPoint(rope, index, position) {
  rope.pinned.add(index);
  if (position) {
    rope.positions.set(position, index * 3);
    rope.previous.set(position, index * 3);
  }
}

export function getPoint(rope, index) {
  const o = index * 3;
  return [rope.positions[o], rope.positions[o + 1], rope.positions[o + 2]];
}

/** Total current polyline length. */
export function currentLength(rope) {
  let total = 0;
  for (let i = 0; i < rope.count - 1; i++) {
    const a = i * 3, b = (i + 1) * 3;
    total += Math.hypot(
      rope.positions[b] - rope.positions[a],
      rope.positions[b + 1] - rope.positions[a + 1],
      rope.positions[b + 2] - rope.positions[a + 2]);
  }
  return total;
}

/** Advance the simulation. Colliders: optional [{center, radius}] spheres. */
export function stepRope(rope, dt, { iterations = 24, colliders = [] } = {}) {
  if (!(dt > 0)) throw new Error('rope: dt must be positive');
  const { positions, previous, pinned, gravity, damping } = rope;
  const g = [gravity[0] * dt * dt, gravity[1] * dt * dt, gravity[2] * dt * dt];
  for (let i = 0; i < rope.count; i++) {
    if (pinned.has(i)) continue;
    const o = i * 3;
    for (let a = 0; a < 3; a++) {
      const current = positions[o + a];
      const velocity = (current - previous[o + a]) * damping;
      previous[o + a] = current;
      positions[o + a] = current + velocity + g[a];
    }
  }
  const pinnedPositions = new Map();
  for (const i of pinned) pinnedPositions.set(i, getPoint(rope, i));
  for (let iter = 0; iter < iterations; iter++) {
    // Alternate sweep direction: one-way Gauss-Seidel biases the chain.
    const forward = iter % 2 === 0;
    for (let s = 0; s < rope.count - 1; s++) {
      const i = forward ? s : rope.count - 2 - s;
      const a = i * 3, b = (i + 1) * 3;
      const dx = positions[b] - positions[a];
      const dy = positions[b + 1] - positions[a + 1];
      const dz = positions[b + 2] - positions[a + 2];
      const dist = Math.hypot(dx, dy, dz) || 1e-9;
      const diff = (dist - rope.restLengths[i]) / dist;
      const aPinned = pinned.has(i), bPinned = pinned.has(i + 1);
      const wa = aPinned ? 0 : (bPinned ? 1 : 0.5);
      const wb = bPinned ? 0 : (aPinned ? 1 : 0.5);
      positions[a] += dx * diff * wa;
      positions[a + 1] += dy * diff * wa;
      positions[a + 2] += dz * diff * wa;
      positions[b] -= dx * diff * wb;
      positions[b + 1] -= dy * diff * wb;
      positions[b + 2] -= dz * diff * wb;
    }
    for (const collider of colliders) {
      for (let i = 0; i < rope.count; i++) {
        if (pinned.has(i)) continue;
        const o = i * 3;
        const dx = positions[o] - collider.center[0];
        const dy = positions[o + 1] - collider.center[1];
        const dz = positions[o + 2] - collider.center[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < collider.radius * collider.radius && d2 > 0) {
          const d = Math.sqrt(d2);
          const push = (collider.radius - d) / d;
          positions[o] += dx * push;
          positions[o + 1] += dy * push;
          positions[o + 2] += dz * push;
        }
      }
    }
    for (const [i, pos] of pinnedPositions) positions.set(pos, i * 3);
  }
  return rope;
}

/** Step repeatedly; returns the rope for chaining. */
export function simulateRope(rope, { duration = 1, dt = 1 / 60, iterations = 24, colliders = [] } = {}) {
  const steps = Math.max(1, Math.round(duration / dt));
  for (let s = 0; s < steps; s++) stepRope(rope, dt, { iterations, colliders });
  return rope;
}

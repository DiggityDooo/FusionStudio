'use strict';
// Hair/fur strand simulation (A19 "Hair/fur simulation"): guide
// strands as XPBD particle chains (./xpbd.js) pinned at scalp
// roots, with distance constraints, uniform gravity + wind
// acceleration, and sphere colliders (scalp/head volumes)
// resolved by positional projection after each step.

import { addDistanceConstraint, createXPBDWorld, pinParticle, stepXPBD } from './xpbd.js';

/** Rest positions for a straight strand from root along direction. */
export function strandRestPositions(root, direction, { segments = 8, length = 0.3 } = {}) {
  if (!Number.isInteger(segments) || segments < 1) throw new Error('hair: segments must be a positive integer');
  if (!(length > 0)) throw new Error('hair: length must be positive');
  const len = Math.hypot(...direction);
  if (len < 1e-15) throw new Error('hair: direction must be non-zero');
  const dir = direction.map((v) => v / len);
  const segLen = length / segments;
  const positions = [];
  for (let i = 0; i <= segments; i++) {
    positions.push([root[0] + dir[0] * segLen * i, root[1] + dir[1] * segLen * i, root[2] + dir[2] * segLen * i]);
  }
  return positions;
}

/**
 * Simulate strands to a settled state.
 * strands: [{ positions (from strandRestPositions), rootIndex? 0 }]
 * options: { gravity, wind (constant acceleration), sphereColliders:
 * [{ center, radius }], compliance, mass, seconds, dt, substeps,
 * damping, collisionIterations }
 * Returns per-strand final positions (arrays of [x,y,z]).
 */
export function simulateHair({
  strands,
  gravity = [0, -9.81, 0],
  wind = [0, 0, 0],
  sphereColliders = [],
  compliance = 0,
  mass = 0.01,
  seconds = 1.5,
  dt = 1 / 60,
  substeps = 10,
  damping = 1.5,
} = {}) {
  if (!Array.isArray(strands) || !strands.length) throw new Error('hair: at least one strand is required');
  const allPositions = [];
  const spans = [];
  for (const strand of strands) {
    const start = allPositions.length;
    for (const p of strand.positions) allPositions.push([...p]);
    spans.push({ start, count: strand.positions.length, root: strand.positions[0] });
  }
  const accel = gravity.map((g, i) => g + (wind[i] || 0));
  const world = createXPBDWorld(allPositions, new Array(allPositions.length).fill(mass), { gravity: accel });
  for (const span of spans) {
    pinParticle(world, span.start, span.root);
    for (let i = 0; i + 1 < span.count; i++) {
      const a = span.start + i, b = a + 1;
      const pa = allPositions[a], pb = allPositions[b];
      const rest = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      addDistanceConstraint(world, a, b, rest, compliance);
    }
  }
  const steps = Math.max(1, Math.round(seconds / dt));
  const projectColliders = () => {
    for (const collider of sphereColliders) {
      for (let i = 0; i < world.count; i++) {
        const ix = i * 3;
        const dx = world.positions[ix] - collider.center[0];
        const dy = world.positions[ix + 1] - collider.center[1];
        const dz = world.positions[ix + 2] - collider.center[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist < collider.radius && dist > 1e-12) {
          const s = collider.radius / dist;
          world.positions[ix] = collider.center[0] + dx * s;
          world.positions[ix + 1] = collider.center[1] + dy * s;
          world.positions[ix + 2] = collider.center[2] + dz * s;
        } else if (dist <= 1e-12) {
          world.positions[ix + 1] = collider.center[1] + collider.radius;
        }
      }
    }
    // Re-pin roots after projection.
    for (const span of spans) {
      world.positions.set(span.root, span.start * 3);
    }
  };
  for (let step = 0; step < steps; step++) {
    stepXPBD(world, dt, { substeps, damping });
    projectColliders();
  }
  return spans.map((span) => {
    const out = [];
    for (let i = 0; i < span.count; i++) {
      const ix = (span.start + i) * 3;
      out.push([world.positions[ix], world.positions[ix + 1], world.positions[ix + 2]]);
    }
    return out;
  });
}

/** Total strand length from simulated positions. */
export function strandLength(positions) {
  let total = 0;
  for (let i = 0; i + 1 < positions.length; i++) {
    total += Math.hypot(
      positions[i + 1][0] - positions[i][0],
      positions[i + 1][1] - positions[i][1],
      positions[i + 1][2] - positions[i][2],
    );
  }
  return total;
}

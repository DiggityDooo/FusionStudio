'use strict';
// Jiggle / secondary-motion bones (A13 "Jiggle/secondary motion
// bones", "Dynamic bones and soft-body bones"): damped harmonic
// oscillators that chase a driven target with lag and overshoot.
// Parameterized by natural frequency omega (rad/s) and damping ratio
// zeta, so behavior maps to the analytic step response: overshoot
// exp(-pi*zeta/sqrt(1-zeta^2)) for zeta < 1, monotone for zeta >= 1.
// Integration substeps internally for stability at low frame rates.

function substepsFor(omega, dt) {
  return Math.max(1, Math.ceil((omega * dt) / 0.05));
}

/** Scalar spring: { value, velocity }, chase(target, dt). */
export function createSpring({ omega = 12, zeta = 0.25, value = 0 } = {}) {
  if (!(omega > 0)) throw new Error('jiggle: omega must be positive');
  if (!(zeta >= 0)) throw new Error('jiggle: zeta must be >= 0');
  const state = { value, velocity: 0, omega, zeta };
  return {
    state,
    chase(target, dt) {
      if (!(dt > 0)) throw new Error('jiggle: dt must be positive');
      const n = substepsFor(omega, dt);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const accel = -omega * omega * (state.value - target) - 2 * zeta * omega * state.velocity;
        state.velocity += accel * h;
        state.value += state.velocity * h;
      }
      return state.value;
    },
    reset(value = 0) { state.value = value; state.velocity = 0; },
  };
}

/**
 * 3D jiggle point: chases a moving anchor; the offset (point - anchor)
 * is the visible secondary motion. Optional gravity pulls the rest
 * offset downward; `restOffset` is where the point sits at rest
 * relative to the anchor.
 */
export function createJiggle({ omega = 10, zeta = 0.2, restOffset = [0, -1, 0], gravity = 0 } = {}) {
  // Springs live in world space and chase anchor + restOffset, so
  // anchor motion excites lag/overshoot in the offset (point - anchor).
  const springs = [0, 1, 2].map(() => createSpring({ omega, zeta }));
  let initialized = false;
  return {
    springs,
    restOffset: [...restOffset],
    gravity,
    /** Advance; anchor is the driven attachment point. Returns offset. */
    update(anchor, dt) {
      if (!initialized) {
        springs.forEach((s, axis) => s.reset(anchor[axis] + restOffset[axis]));
        initialized = true;
      }
      const point = springs.map((s, axis) =>
        s.chase(anchor[axis] + restOffset[axis] + (axis === 1 ? -gravity : 0), dt));
      this.point = point;
      this.offset = point.map((v, axis) => v - anchor[axis]);
      return this.offset;
    },
    offset: [...restOffset],
    point: null,
  };
}

/**
 * A chain of jiggle points (ponytail/antenna): link 0 chases the
 * anchor, each later link chases the previous point. Returns points
 * after each update.
 */
export function createJiggleChain(count, { omega = 10, zeta = 0.2, restOffset = [0, -0.3, 0], gravity = 0 } = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('jiggle: chain count must be a positive integer');
  const links = Array.from({ length: count }, () => createJiggle({ omega, zeta, restOffset, gravity }));
  return {
    links,
    update(anchor, dt) {
      const points = [];
      let target = anchor;
      for (const link of links) {
        link.update(target, dt);
        points.push([...link.point]);
        target = link.point;
      }
      return points;
    },
  };
}

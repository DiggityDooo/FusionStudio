'use strict';
// Squash & stretch and stretchy limbs (A13 "Squash/stretch and
// stretchy limbs"). The classic rule: scale along the motion axis by
// s, and the two perpendicular axes by 1/sqrt(s), so volume is
// preserved exactly (s * (1/sqrt(s))^2 = 1). Stretchy limbs aim a
// bone at a target: axial scale = distance/restLength, clamped by a
// soft limit so extreme reaches ease off instead of snapping.

import { createSpring } from './jiggle.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Scale triple for a volume-preserving stretch along an axis. */
export function volumePreservingScale(stretch, axis) {
  if (!(stretch > 0)) throw new Error('squash-stretch: stretch must be positive');
  if (![0, 1, 2].includes(axis)) throw new Error('squash-stretch: axis must be 0, 1 or 2');
  const perp = 1 / Math.sqrt(stretch);
  const scale = [perp, perp, perp];
  scale[axis] = stretch;
  return scale;
}

/** Signed volume of a scale triple relative to unit volume. */
export function scaleVolume(scale) {
  return scale[0] * scale[1] * scale[2];
}

/**
 * Stretch factor for reaching `distance` with rest length `rest`:
 * 1 until maxStretch, then a smooth (tanh) ease beyond it, so the
 * limb approaches maxStretch + softRange asymptotically.
 */
export function stretchFactor(distance, rest, { maxStretch = 2, softRange = 0.5 } = {}) {
  if (!(rest > 0)) throw new Error('squash-stretch: rest length must be positive');
  if (!(distance >= 0)) throw new Error('squash-stretch: distance must be >= 0');
  const raw = distance / rest;
  if (raw <= maxStretch) return raw;
  const over = raw - maxStretch;
  return maxStretch + softRange * Math.tanh(over / softRange);
}

/**
 * Full limb solve: axial stretch to (try to) reach the target plus
 * the volume-preserving perpendicular scale. `axis` is the bone's
 * local length axis. Returns { scale, reached, stretch } where
 * reached says whether the target is fully reached.
 */
export function solveStretchyLimb(rest, distance, { axis = 1, maxStretch = 2, softRange = 0.5 } = {}) {
  const stretch = stretchFactor(distance, rest, { maxStretch, softRange });
  return {
    scale: volumePreservingScale(stretch, axis),
    stretch,
    reachedDistance: stretch * rest,
    reached: Math.abs(stretch * rest - distance) < 1e-9,
  };
}

/**
 * Dynamic squash: a spring-driven stretch factor for impact
 * animation. impact(amount) squashes (amount in (0,1) compresses);
 * update(dt) recovers toward 1 with jiggle-style overshoot.
 */
export function createSquashSpring({ omega = 14, zeta = 0.18 } = {}) {
  const spring = createSpring({ omega, zeta, value: 1 });
  return {
    spring,
    impact(amount) {
      if (!(amount > 0 && amount < 2)) throw new Error('squash-stretch: impact amount must be in (0, 2)');
      spring.state.value = amount;
      spring.state.velocity = 0;
    },
    update(dt) {
      return spring.chase(1, dt);
    },
    /** Current volume-preserving scale along an axis. */
    scale(axis) {
      return volumePreservingScale(Math.max(0.05, spring.state.value), axis);
    },
  };
}

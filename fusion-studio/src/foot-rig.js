'use strict';
// Reverse foot / foot roll (A13 "Reverse foot and foot roll setups").
// A single `roll` parameter drives the classic three-phase foot roll:
//   roll in [-1, 0]   : rotate about the heel pivot (toe lifts)
//   roll in [0, 0.5]  : rotate about the ball pivot (heel lifts)
//   roll in [0.5, 1]  : rotate about the toe pivot (rolls over the toe)
// `bank` rotates about the inner/outer ground edge. The active pivot
// is a ground contact point, so it stays fixed in world space while
// the foot rotates around it -- that invariance is the rig's contract.
// Foot space: ankle above origin, +Z forward, Y up, ground at y = 0.

const DEG = Math.PI / 180;

function rotateAboutX(point, pivot, deg) {
  const a = deg * DEG, cos = Math.cos(a), sin = Math.sin(a);
  const dy = point[1] - pivot[1], dz = point[2] - pivot[2];
  return [point[0], pivot[1] + dy * cos - dz * sin, pivot[2] + dy * sin + dz * cos];
}

export function createFootRig({
  ankleHeight = 0.12,
  heelBack = 0.07,     // heel contact at z = -heelBack
  ballForward = 0.13,  // ball contact at z = +ballForward
  toeForward = 0.21,   // toe tip at z = +toeForward
  heelAngle = 35, ballAngle = 45, toeAngle = 35, bankAngle = 25,
  halfWidth = 0.05,
} = {}) {
  const rig = {
    ankleHeight, heelBack, ballForward, toeForward, halfWidth,
    /** Ground contact pivots in foot space. */
    pivots: {
      heel: [0, 0, -heelBack],
      ball: [0, 0, ballForward],
      toe: [0, 0, toeForward],
    },
    /**
     * Resolve roll/bank parameters to a pitch (deg, + = toe down
     * sense per phase), bank (deg), and the active pivots.
     */
    solve({ roll = 0, bank = 0 } = {}) {
      const r = Math.max(-1, Math.min(1, roll));
      // Phases compose cumulatively: the toe phase adds rotation about
      // the toe's CURRENT position (after the ball rotation), so the
      // transform is continuous across the 0.5 boundary.
      const steps = [];
      let phase = 'ball';
      if (r < 0) {
        steps.push({ pivot: rig.pivots.heel, deg: r * heelAngle });
        phase = 'heel';
      } else if (r > 0) {
        const ballDeg = Math.min(r / 0.5, 1) * ballAngle;
        steps.push({ pivot: rig.pivots.ball, deg: ballDeg });
        if (r > 0.5) {
          const toeDeg = ((r - 0.5) / 0.5) * toeAngle;
          const toeNow = rotateAboutX(rig.pivots.toe, rig.pivots.ball, ballDeg);
          steps.push({ pivot: toeNow, deg: toeDeg });
          phase = 'toe';
        }
      }
      const b = Math.max(-1, Math.min(1, bank));
      return {
        pitchDeg: steps.reduce((s, step) => s + step.deg, 0),
        bankDeg: b * bankAngle,
        pitchSteps: steps,
        pitchPivot: steps.length > 0 ? steps[steps.length - 1].pivot : rig.pivots.ball,
        bankPivot: [b >= 0 ? halfWidth : -halfWidth, 0, 0],
        phase,
      };
    },
    /** Transform a foot-space point by roll/bank (bank first, then pitch steps). */
    transformPoint(point, params = {}) {
      const { bankDeg, pitchSteps, bankPivot } = rig.solve(params);
      let [x, y, z] = point;
      // Bank: rotation about Z axis around bankPivot.
      if (bankDeg !== 0) {
        const a = bankDeg * DEG, cos = Math.cos(a), sin = Math.sin(a);
        const dx = x - bankPivot[0], dy = y - bankPivot[1];
        x = bankPivot[0] + dx * cos - dy * sin;
        y = bankPivot[1] + dx * sin + dy * cos;
      }
      // Pitch: each phase step rotates about the X axis at its pivot.
      for (const step of pitchSteps) {
        if (step.deg === 0) continue;
        const rotated = rotateAboutX([x, y, z], step.pivot, step.deg);
        [x, y, z] = rotated;
      }
      return [x, y, z];
    },
    /** Ankle position under roll/bank (ankle starts at [0, ankleHeight, 0]). */
    anklePosition(params = {}) {
      return rig.transformPoint([0, ankleHeight, 0], params);
    },
  };
  return rig;
}

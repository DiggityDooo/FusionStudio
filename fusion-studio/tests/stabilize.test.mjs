import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTrajectory, smoothTrajectory, correctionTransforms, warpImage,
  invertAffine, composeAffine, imageDifference,
} from '../src/stabilize.js';
import { sampleBilinear, applyAffine } from '../src/patch-tracker.js';

function makeImage(width, height, fn) {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fn(x, y);
  return { data, width, height };
}
const texture = (x, y) => Math.sin(x * 0.31 + 1.7) * Math.cos(y * 0.23) + Math.sin((x + y) * 0.11) * 1.4 + Math.cos(x * 0.07 - y * 0.13) * 0.8;
const base = makeImage(96, 96, texture);
const shifted = (dx, dy) => makeImage(96, 96, (x, y) => {
  const v = sampleBilinear(base, x - dx, y - dy);
  return v === null ? 0 : v;
});

const FEATURES = [[25, 25], [70, 25], [25, 70], [70, 70], [48, 48], [35, 60], [62, 38]];
// Known camera path: slow pan + high-frequency jitter.
const PATH = [];
for (let i = 0; i < 9; i++) {
  PATH.push([i * 0.8 + Math.sin(i * 2.3) * 1.1, Math.cos(i * 1.9) * 0.9]);
}
const FRAMES = PATH.map(([dx, dy]) => shifted(dx, dy));

test('affine algebra: inverse and composition round-trip exactly', () => {
  const m = [[1.1, 0.2, 3], [-0.1, 0.9, -2]];
  const inv = invertAffine(m);
  const p = [7, -4];
  const round = applyAffine(inv, applyAffine(m, p));
  assert.ok(Math.hypot(round[0] - p[0], round[1] - p[1]) < 1e-12);
  const composed = composeAffine(m, inv);
  assert.ok(Math.abs(composed[0][0] - 1) < 1e-12 && Math.abs(composed[0][2]) < 1e-12);
});

test('trajectory recovers the known camera path', () => {
  const trajectory = computeTrajectory(FRAMES, FEATURES, { radius: 5, search: 6 });
  assert.equal(trajectory.length, FRAMES.length);
  // Trajectory is relative to frame 0, so compare against the path
  // with PATH[0] subtracted.
  for (let i = 0; i < PATH.length; i++) {
    const [tx, ty] = [trajectory[i][0][2], trajectory[i][1][2]];
    const expectedX = PATH[i][0] - PATH[0][0];
    const expectedY = PATH[i][1] - PATH[0][1];
    // 0.35 px band; measured worst frame error after the tracker
    // caller-frame fix is ~0.14 px over the 9-frame chain.
    assert.ok(Math.abs(tx - expectedX) < 0.35, `frame ${i} tx ${tx.toFixed(2)} vs ${expectedX.toFixed(2)}`);
    assert.ok(Math.abs(ty - expectedY) < 0.35, `frame ${i} ty ${ty.toFixed(2)} vs ${expectedY.toFixed(2)}`);
  }
});

test('stabilized frames match the reference far better than raw frames', () => {
  const trajectory = computeTrajectory(FRAMES, FEATURES, { radius: 5, search: 6 });
  const smoothed = smoothTrajectory(trajectory, 2);
  const corrections = correctionTransforms(trajectory, smoothed);
  let rawErr = 0, stabErr = 0;
  for (let i = 1; i < FRAMES.length; i++) {
    rawErr += imageDifference(FRAMES[i], FRAMES[0]);
    stabErr += imageDifference(warpImage(FRAMES[i], corrections[i]), FRAMES[0]);
  }
  // The smoothed path still pans slowly, so stabilized frames follow
  // a gentle drift rather than locking to frame 0: the right oracle
  // is frame-to-frame jitter between CONSECUTIVE stabilized frames.
  let rawStep = 0, stabStep = 0;
  let prevStab = warpImage(FRAMES[0], corrections[0]);
  for (let i = 1; i < FRAMES.length; i++) {
    rawStep += imageDifference(FRAMES[i], FRAMES[i - 1]);
    const stab = warpImage(FRAMES[i], corrections[i]);
    stabStep += imageDifference(stab, prevStab);
    prevStab = stab;
  }
  assert.ok(stabStep < rawStep * 0.6, `consecutive-frame jitter: raw ${rawStep.toFixed(3)} -> stabilized ${stabStep.toFixed(3)}`);
  assert.ok(stabErr < rawErr, 'stabilized sequence is also closer to frame 0 overall');
});

test('static sequence yields near-identity corrections', () => {
  const stills = [base, base, base, base];
  const trajectory = computeTrajectory(stills, FEATURES, { radius: 5, search: 4 });
  const corrections = correctionTransforms(trajectory, smoothTrajectory(trajectory, 1));
  for (const c of corrections) {
    assert.ok(Math.abs(c[0][2]) < 0.05 && Math.abs(c[1][2]) < 0.05, 'no phantom motion');
  }
  assert.throws(() => computeTrajectory([], FEATURES), /no frames/);
});

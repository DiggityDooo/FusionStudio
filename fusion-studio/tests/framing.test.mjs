import test from 'node:test';
import assert from 'node:assert/strict';
import { dollyFactorForCoverage, framingReport, horizonRollDeg, projectToImage } from '../src/framing.js';
import { composeCamera } from '../src/camera-solve.js';

const IMG = { width: 960, height: 720 };
const K = [[1000, 0, 480], [0, 1000, 360], [0, 0, 1]];
const P_IDENTITY = composeCamera(K, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0]);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('a point constructed on the thirds intersection reports zero thirds distance', () => {
  // P = K[I|0]: u = (1000x + 480z)/z, v = (1000y + 360z)/z.
  // (1.6, 1.2, -10) -> u = 320 = W/3, v = 240 = H/3 exactly.
  const projected = projectToImage(P_IDENTITY, [1.6, 1.2, -10], IMG);
  assert.ok(near(projected.x, 1 / 3, 1e-12) && near(projected.y, 1 / 3, 1e-12), JSON.stringify(projected));
  assert.equal(projected.behind, false);
  const report = framingReport(P_IDENTITY, IMG, [[1.6, 1.2, -10]], { headPoint: [1.6, 1.2, -10] });
  assert.ok(near(report.thirdsDistance, 0, 1e-12), 'center sits on the thirds intersection');
  assert.ok(near(report.headroom, 1 / 3, 1e-12), 'headroom is the v fraction from the top');
  assert.ok(report.warnings.includes('excess headroom'), 'default 0.3 limit flags 1/3 headroom');
  assert.ok(report.warnings.includes('subject very small in frame'), 'single point has zero coverage');
  // Principal-point subject: dead center, maximally far from thirds.
  const centered = framingReport(P_IDENTITY, IMG, [[0, 0, -10]]);
  assert.ok(near(centered.center.x, 0.5) && near(centered.center.y, 0.5));
  assert.ok(near(centered.thirdsDistance, Math.hypot(1 / 6, 1 / 6), 1e-12), 'center-to-thirds distance');
});

test('subject bbox, coverage, and clipping come from the projected corners', () => {
  // Quad at z=-10 spanning x in [-1.6, 1.6], y in [-1.2, 1.2]:
  // u in [320, 640] -> x in [1/3, 2/3]; v in [240, 480] -> y in [1/3, 2/3].
  const corners = [
    [-1.6, -1.2, -10], [1.6, -1.2, -10], [1.6, 1.2, -10], [-1.6, 1.2, -10],
  ];
  const report = framingReport(P_IDENTITY, IMG, corners);
  assert.ok(near(report.coverage, 1 / 9, 1e-9), `coverage ${report.coverage} = (1/3)^2`);
  assert.equal(report.clipped, false);
  assert.ok(near(report.center.x, 0.5) && near(report.center.y, 0.5));
  // Push the quad right so part leaves the frame.
  const shifted = corners.map(([x, y, z]) => [x + 4, y, z]);
  const clippedReport = framingReport(P_IDENTITY, IMG, shifted);
  assert.equal(clippedReport.clipped, true);
  assert.ok(clippedReport.warnings.includes('subject clipped by frame edge'));
  assert.throws(() => framingReport(P_IDENTITY, IMG, [[0, 0, 10]]), /behind the camera/);
  assert.throws(() => framingReport(P_IDENTITY, IMG, []), /required/);
});

test('horizon roll and dolly factor follow their closed forms', () => {
  assert.ok(near(horizonRollDeg([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 0), 'level camera');
  const roll10 = [[Math.cos(10 * Math.PI / 180), Math.sin(10 * Math.PI / 180), 0],
    [-Math.sin(10 * Math.PI / 180), Math.cos(10 * Math.PI / 180), 0], [0, 0, 1]];
  assert.ok(near(horizonRollDeg(roll10), 10, 1e-9), 'rolled camera reads its angle');
  // Quadrupling coverage needs half the distance: factor 2 (in).
  assert.ok(near(dollyFactorForCoverage(0.05, 0.2), 2, 1e-12));
  assert.ok(near(dollyFactorForCoverage(0.2, 0.05), 0.5, 1e-12), 'quarter coverage: dolly out 2x');
  assert.throws(() => dollyFactorForCoverage(0, 0.5), /positive/);
});

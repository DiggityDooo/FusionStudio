import test from 'node:test';
import assert from 'node:assert/strict';
import { solveFabrik, catmullRomPoint, catmullRomLength, splineIk } from '../src/ik-solvers.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function segmentLengths(pos) {
  const out = [];
  for (let i = 0; i + 1 < pos.length; i++) out.push(dist(pos[i], pos[i + 1]));
  return out;
}

test('FABRIK reaches a reachable target, preserving lengths and root', () => {
  const start = [[0, 0, 0], [1, 0.2, 0], [2, 0.1, 0], [3, 0, 0]];
  const target = [1.5, 1.2, 0.5];
  const solved = solveFabrik(start, target);
  assert.ok(dist(solved.at(-1), target) < 1e-3, `end ${solved.at(-1)} vs ${target}`);
  assert.deepEqual(solved[0], [0, 0, 0], 'root pinned');
  const before = segmentLengths(start), after = segmentLengths(solved);
  for (let i = 0; i < before.length; i++) assert.ok(Math.abs(before[i] - after[i]) < 1e-9, 'length preserved');
  assert.deepEqual(start[1], [1, 0.2, 0], 'input not mutated');
});

test('FABRIK stretches straight at unreachable targets', () => {
  const start = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const solved = solveFabrik(start, [10, 0, 0]);
  assert.ok(Math.abs(dist(solved.at(-1), [0, 0, 0]) - 2) < 1e-9, 'fully extended to total length');
  assert.ok(Math.abs(solved.at(-1)[0] - 2) < 1e-9 && Math.abs(solved.at(-1)[1]) < 1e-9, 'aimed at target');
  // Collinear: every joint on the root->target line.
  for (const p of solved) assert.ok(Math.abs(p[1]) < 1e-9 && Math.abs(p[2]) < 1e-9);
  assert.throws(() => solveFabrik([[0, 0, 0]], [1, 1, 1]), RangeError);
});

test('Catmull-Rom interpolates its control points', () => {
  const pts = [[0, 0, 0], [1, 2, 0], [3, 2, 0], [4, 0, 0]];
  for (let i = 0; i < pts.length; i++) {
    const p = catmullRomPoint(pts, i / (pts.length - 1));
    assert.ok(dist(p, pts[i]) < 1e-9, `passes through point ${i}`);
  }
  // Straight control polygon -> straight curve, length = endpoint distance.
  const line = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  assert.ok(Math.abs(catmullRomLength(line) - 3) < 1e-6);
  assert.ok(dist(catmullRomPoint(line, 0.5), [1.5, 0, 0]) < 1e-9);
});

test('spline IK lays joints on a straight spline at exact spacings', () => {
  const line = [[0, 0, 0], [2, 0, 0], [4, 0, 0], [6, 0, 0]];
  const { positions, tangents } = splineIk(line, [1.5, 2, 1]);
  assert.ok(dist(positions[0], [0, 0, 0]) < 1e-9);
  assert.ok(dist(positions[1], [1.5, 0, 0]) < 1e-6, `joint1 ${positions[1]}`);
  assert.ok(dist(positions[2], [3.5, 0, 0]) < 1e-6);
  assert.ok(dist(positions[3], [4.5, 0, 0]) < 1e-6);
  for (const t of tangents) assert.ok(Math.abs(t[0] - 1) < 1e-6 && Math.abs(t[1]) < 1e-6, 'tangents along line');
  assert.throws(() => splineIk(line, [10]), /longer than curve/);
});

test('spline IK follows a circular arc with arc-length spacing', () => {
  // 9 control points on a circle of radius 10 (quarter arc).
  const ctrl = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI / 2;
    ctrl.push([10 * Math.cos(a), 10 * Math.sin(a), 0]);
  }
  const seg = 2.0;
  const { positions } = splineIk(ctrl, [seg, seg, seg, seg]);
  for (const p of positions) {
    const r = Math.hypot(p[0], p[1]);
    assert.ok(Math.abs(r - 10) < 0.05, `joint on circle: r=${r}`);
  }
  // Chords subtend the arc length: chord = 2R sin(arc / 2R).
  const expectedChord = 2 * 10 * Math.sin(seg / 20);
  const chords = segmentLengths(positions);
  for (const c of chords) assert.ok(Math.abs(c - expectedChord) < 0.05, `chord ${c} vs ${expectedChord}`);
});

test('parallel-transport frames are stable and twist-free', () => {
  // Helix-like control polygon (genuinely 3D turning).
  const ctrl = [];
  for (let i = 0; i <= 6; i++) {
    const a = i * 0.5;
    ctrl.push([Math.cos(a) * 3, i * 0.8, Math.sin(a) * 3]);
  }
  const { tangents, normals, binormals } = splineIk(ctrl, [1, 1, 1, 1, 1, 1], { initialNormal: [0, 0, 1] });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let j = 0; j < tangents.length; j++) {
    assert.ok(Math.abs(Math.hypot(...normals[j]) - 1) < 1e-9, 'unit normal');
    assert.ok(Math.abs(dot(normals[j], tangents[j])) < 1e-9, 'normal perpendicular to tangent');
    assert.ok(Math.abs(dot(binormals[j], tangents[j])) < 1e-9, 'binormal perpendicular');
    if (j > 0) {
      const turn = Math.acos(Math.max(-1, Math.min(1, dot(normals[j - 1], normals[j]))));
      assert.ok(turn < 0.6, `no frame flip at ${j}: ${turn} rad`);
    }
  }
  // Initial normal is honored: first frame normal is the projection of the request.
  assert.ok(dot(normals[0], [0, 0, 1]) > 0.5, 'starts near requested normal');
  // On a straight spline the frame is exactly constant.
  const line = splineIk([[0, 0, 0], [2, 0, 0], [4, 0, 0]], [1, 1], { initialNormal: [0, 1, 0] });
  for (const n of line.normals) assert.ok(dist(n, [0, 1, 0]) < 1e-9, 'straight-line frame constant');
});

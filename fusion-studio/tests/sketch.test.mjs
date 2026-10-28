import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCircle, addConstraint, addLine, addPoint, createSketch, sketchResiduals,
  solveSketch,
} from '../src/sketch.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('solver closes a rectangle from a perturbed start', () => {
  const s = createSketch();
  const p0 = addPoint(s, 0.1, -0.1), p1 = addPoint(s, 3.8, 0.2), p2 = addPoint(s, 4.2, 2.7), p3 = addPoint(s, -0.2, 3.1);
  addConstraint(s, { type: 'fix', a: p0, x: 0, y: 0 });
  addConstraint(s, { type: 'horizontal', a: p0, b: p1 });
  addConstraint(s, { type: 'horizontal', a: p3, b: p2 });
  addConstraint(s, { type: 'vertical', a: p0, b: p3 });
  addConstraint(s, { type: 'vertical', a: p1, b: p2 });
  addConstraint(s, { type: 'distance', a: p0, b: p1, value: 4 });
  addConstraint(s, { type: 'distance', a: p0, b: p3, value: 3 });
  const report = solveSketch(s);
  assert.ok(report.converged, JSON.stringify(report));
  assert.ok(near(s.points[p1].x, 4) && near(s.points[p1].y, 0));
  assert.ok(near(s.points[p2].x, 4) && near(s.points[p2].y, 3));
  assert.equal(report.dof, 0, 'fully constrained rectangle');
});

test('coincident and point-on-line constraints solve', () => {
  const s = createSketch();
  const a = addPoint(s, 0, 0), b = addPoint(s, 5, 0), c = addPoint(s, 2.5, 2), d = addPoint(s, 2.4, -3);
  const line = addLine(s, a, b);
  addConstraint(s, { type: 'fix', a, x: 0, y: 0 });
  addConstraint(s, { type: 'fix', a: b, x: 5, y: 0 });
  addConstraint(s, { type: 'pointOnLine', point: c, line });
  addConstraint(s, { type: 'coincident', a: c, b: d });
  const report = solveSketch(s);
  assert.ok(report.converged, JSON.stringify(report));
  assert.ok(near(s.points[c].y, 0, 1e-6) && near(s.points[d].y, 0, 1e-6));
  assert.ok(near(s.points[c].x, s.points[d].x, 1e-6));
});

test('radius, tangent and angle constraints solve', () => {
  const s = createSketch();
  const centre = addPoint(s, 0.3, -0.2), p1 = addPoint(s, -3, 2.2), p2 = addPoint(s, 3, 1.8);
  addConstraint(s, { type: 'fix', a: centre, x: 0, y: 0 });
  const circle = addCircle(s, centre, 1.5);
  const line = addLine(s, p1, p2);
  addConstraint(s, { type: 'radius', circle, value: 2 });
  addConstraint(s, { type: 'tangent', line, circle });
  addConstraint(s, { type: 'distance', a: centre, b: p1, value: 4 });
  const report = solveSketch(s);
  assert.ok(report.converged, JSON.stringify(report));
  assert.ok(near(s.circles[circle].r, 2, 1e-6));
  assert.ok(Math.max(...sketchResiduals(s).map(Math.abs)) < 1e-7);
});

test('parallel, perpendicular and fixed angle constraints solve', () => {
  const s = createSketch();
  const a = addPoint(s, 0, 0), b = addPoint(s, 2, 0.4), c = addPoint(s, 0.2, 1), d = addPoint(s, 1, 3);
  const l1 = addLine(s, a, b), l2 = addLine(s, c, d);
  addConstraint(s, { type: 'fix', a, x: 0, y: 0 });
  addConstraint(s, { type: 'fix', a: b, x: 2, y: 0 });
  addConstraint(s, { type: 'fix', a: c, x: 0, y: 1 });
  addConstraint(s, { type: 'perpendicular', a: l1, b: l2 });
  const report = solveSketch(s);
  assert.ok(report.converged, JSON.stringify(report));
  const d2 = [s.points[d].x - s.points[c].x, s.points[d].y - s.points[c].y];
  assert.ok(near(d2[0], 0, 1e-6), 'second line vertical');
});

test('conflicting constraints report non-convergence honestly', () => {
  const s = createSketch();
  const a = addPoint(s, 0, 0), b = addPoint(s, 1, 0);
  addConstraint(s, { type: 'fix', a, x: 0, y: 0 });
  addConstraint(s, { type: 'distance', a, b, value: 1 });
  addConstraint(s, { type: 'distance', a, b, value: 2 });
  const report = solveSketch(s);
  assert.equal(report.converged, false);
  assert.ok(report.maxResidual > 0.1);
});

test('fixed angle between lines solves to 45 degrees', () => {
  const s = createSketch();
  const a = addPoint(s, 0, 0), b = addPoint(s, 2, 0), c = addPoint(s, 0, 0), d = addPoint(s, 1.4, 1.6);
  const l1 = addLine(s, a, b), l2 = addLine(s, c, d);
  addConstraint(s, { type: 'fix', a, x: 0, y: 0 });
  addConstraint(s, { type: 'fix', a: b, x: 2, y: 0 });
  addConstraint(s, { type: 'coincident', a: c, b: a });
  addConstraint(s, { type: 'angle', a: l1, b: l2, value: 45 });
  addConstraint(s, { type: 'distance', a: c, b: d, value: 2 });
  const report = solveSketch(s);
  assert.ok(report.converged, JSON.stringify(report));
  assert.ok(near(s.points[d].x, Math.SQRT2, 1e-6) && near(s.points[d].y, Math.SQRT2, 1e-6));
});

test('invalid constraints are rejected', () => {
  const s = createSketch();
  assert.throws(() => addConstraint(s, { type: 'glue' }), /Unknown constraint/);
  assert.throws(() => addCircle(s, 0, -1), /radius/);
});

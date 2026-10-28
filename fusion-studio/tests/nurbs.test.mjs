import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arcCurve, bezierCurve, bilinearPatch, birailSurface, closestPointOnCurve,
  closestPointOnSurface, continuityReport, coonsPatch, curvatureComb,
  curveCurvature, curveDerivative, curveLength, curvePoint,
  elevateBezierDegree, extrudeSurface, insertKnot, interpolateCurve,
  loftSurfaces, offsetCurve, projectCurveOnSurface, revolveSurface,
  ruledSurface, splitCurve, surfaceNormal, surfacePoint, tessellateCurve,
  tessellateSurface, tessellateTrimmedSurface,
} from '../src/nurbs.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const ptClose = (p, q, eps = 1e-9) => p.every((v, i) => close(v, q[i], eps));

test('NURBS with unit weights reproduces a cubic Bezier curve', () => {
  const pts = [[0, 0, 0], [1, 2, 0], [3, 2, 0], [4, 0, 0]];
  const curve = bezierCurve(pts);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const b = [0, 1, 2, 3].map((i) => {
      const c = [1, 3, 3, 1][i] * (1 - t) ** (3 - i) * t ** i;
      return c;
    });
    const expected = [0, 1, 2].map((axis) => pts.reduce((s, p, i) => s + b[i] * p[axis], 0));
    assert.ok(ptClose(curvePoint(curve, t), expected), `t=${t}`);
  }
});

test('rational arc lies exactly on the circle and spans the quarter', () => {
  const arc = arcCurve(2, 90);
  for (const t of [0, 0.13, 0.5, 0.87, 1]) {
    const p = curvePoint(arc, t);
    assert.ok(close(Math.hypot(p[0], p[1]), 2), `radius at ${t}: ${p}`);
  }
  assert.ok(ptClose(curvePoint(arc, 0), [2, 0, 0]));
  assert.ok(ptClose(curvePoint(arc, 1), [0, 2, 0]));
  assert.ok(close(curveLength(arc), Math.PI, 1e-3), 'quarter circumference of r=2');
  const full = arcCurve(1, 360);
  assert.ok(ptClose(curvePoint(full, 0.25), [0, 1, 0], 1e-9));
  assert.ok(close(curveLength(full), 2 * Math.PI, 1e-3));
});

test('curve derivative is tangent on the circle and matches Bezier derivative', () => {
  const arc = arcCurve(1, 90);
  const d = curveDerivative(arc, 0.5);
  const p = curvePoint(arc, 0.5);
  assert.ok(close(d[0] * p[0] + d[1] * p[1], 0, 1e-9), 'tangent perpendicular to radius');
  const line = bezierCurve([[0, 0, 0], [2, 0, 0]]);
  assert.ok(ptClose(curveDerivative(line, 0.3), [2, 0, 0], 1e-9));
});

test('knot insertion and split preserve curve shape', () => {
  const curve = bezierCurve([[0, 0, 0], [1, 3, 0], [4, 3, 0], [5, 0, 0]]);
  const refined = insertKnot(curve, 0.4, 1);
  assert.equal(refined.points.length, curve.points.length + 1);
  for (const t of [0, 0.2, 0.4, 0.7, 1]) assert.ok(ptClose(curvePoint(refined, t), curvePoint(curve, t)), `t=${t}`);
  const [left, right] = splitCurve(curve, 0.4);
  assert.ok(ptClose(curvePoint(left, 1), curvePoint(curve, 0.4)));
  assert.ok(ptClose(curvePoint(right, 0), curvePoint(curve, 0.4)));
  assert.ok(ptClose(curvePoint(left, 0.5), curvePoint(curve, 0.2)));
});

test('elevated Bezier keeps the same curve', () => {
  const pts = [[0, 0, 0], [1, 2, 0], [3, 0, 0]];
  const up = elevateBezierDegree(pts);
  const a = bezierCurve(pts), b = bezierCurve(up.points, up.weights);
  for (const t of [0, 0.33, 0.66, 1]) assert.ok(ptClose(curvePoint(a, t), curvePoint(b, t), 1e-9), `t=${t}`);
});

test('interpolation passes through every input point', () => {
  const pts = [[0, 0, 0], [1, 1, 0.5], [2, 0, 1], [3, 1, 0.5], [4, 0, 0]];
  const curve = interpolateCurve(pts, 3);
  // Chord-length params: endpoints and interior knots land on inputs.
  assert.ok(ptClose(curvePoint(curve, 0), pts[0]));
  assert.ok(ptClose(curvePoint(curve, 1), pts[4]));
  const chords = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const total = chords.reduce((s, c) => s + c, 0);
  let acc = 0;
  for (let i = 1; i < 4; i++) {
    acc += chords[i - 1] / total;
    assert.ok(ptClose(curvePoint(curve, acc), pts[i], 1e-7), `point ${i}`);
  }
});

test('bilinar patch, ruled, extruded and revolved surfaces evaluate exactly', () => {
  const patch = bilinearPatch([[0, 0, 0], [2, 0, 0], [0, 2, 0], [2, 2, 2]]);
  assert.ok(ptClose(surfacePoint(patch, 0.5, 0.5), [1, 1, 0.5]));
  const a = bezierCurve([[0, 0, 0], [1, 0, 0]]);
  const b = bezierCurve([[0, 0, 3], [1, 0, 3]]);
  assert.ok(ptClose(surfacePoint(ruledSurface(a, b), 0.5, 0.5), [0.5, 0, 1.5]));
  const ext = extrudeSurface(a, [0, 4, 0]);
  assert.ok(ptClose(surfacePoint(ext, 1, 1), [1, 4, 0]));
  const profile = bezierCurve([[2, 0, 0], [2, 0, 1]]);
  const rev = revolveSurface(profile, 360);
  const p = surfacePoint(rev, 0, 0.25);
  assert.ok(close(Math.hypot(p[0], p[1]), 2), 'revolve radius');
  assert.ok(close(p[2], 0));
});

test('loft passes through its section curves', () => {
  const s1 = bezierCurve([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  const s2 = bezierCurve([[0, 1, 1], [1, 1, 1], [2, 1, 1]]);
  const s3 = bezierCurve([[0, 2, 0], [1, 2, 0], [2, 2, 0]]);
  const loft = loftSurfaces([s1, s2, s3], 2);
  for (const [v, section] of [[0, s1], [0.5, s2], [1, s3]]) {
    for (const u of [0, 0.5, 1]) assert.ok(ptClose(surfacePoint(loft, u, v), curvePoint(section, u), 1e-7), `u=${u} v=${v}`);
  }
});

test('tessellation converts surfaces to indexed meshes and curves to polylines', () => {
  const patch = bilinearPatch([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]);
  const mesh = tessellateSurface(patch, 4, 2);
  assert.equal(mesh.positions.length, 15 * 3);
  assert.equal(mesh.indices.length, 4 * 2 * 6);
  assert.ok(Math.max(...mesh.indices) < 15);
  const line = tessellateCurve(arcCurve(1, 90), 16);
  assert.equal(line.length, 17);
  for (const p of line) assert.ok(close(Math.hypot(p[0], p[1]), 1, 1e-9));
});

test('closest point measurement on a circle', () => {
  const arc = arcCurve(1, 90);
  const hit = closestPointOnCurve(arc, [3, 0, 0]);
  assert.ok(close(hit.distance, 2, 1e-6));
  assert.ok(ptClose(hit.point, [1, 0, 0], 1e-6));
});

test('curvature of a circle is 1/r and comb normals point at the centre', () => {
  const arc = arcCurve(2, 90);
  for (const t of [0, 0.3, 0.6, 1]) assert.ok(close(curveCurvature(arc, t), 0.5, 1e-9), `t=${t}`);
  const comb = curvatureComb(arc, 8, 1);
  for (const s of comb) {
    const centre = [s.point[0] + s.normal[0] / s.curvature, s.point[1] + s.normal[1] / s.curvature, 0];
    assert.ok(ptClose(centre, [0, 0, 0], 1e-6), `centre from u=${s.u}`);
  }
});

test('continuity report: split arc is G2, arc-to-line is G1 only', () => {
  const [left, right] = splitCurve(arcCurve(1, 90), 0.5);
  const smooth = continuityReport(left, right);
  assert.ok(smooth.g2, JSON.stringify(smooth));
  const arc = arcCurve(2, 90);
  const line = bezierCurve([[0, 2, 0], [-2, 2, 0]]);
  const joined = continuityReport(arc, line);
  assert.ok(joined.g1 && !joined.g2, JSON.stringify(joined));
  assert.ok(close(joined.curvatureJump, 0.5, 1e-9));
});

test('offset curve moves a circle to the offset radius', () => {
  const arc = arcCurve(2, 90);
  const outward = offsetCurve(arc, -0.5, 24);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = curvePoint(outward, t);
    assert.ok(close(Math.hypot(p[0], p[1]), 2.5, 3e-3), `t=${t} r=${Math.hypot(p[0], p[1])}`);
  }
});

test('surface normals are radial on a revolved cylinder', () => {
  const rev = revolveSurface(bezierCurve([[2, 0, 0], [2, 0, 1]]), 360);
  const n = surfaceNormal(rev, 0.5, 0.25);
  assert.ok(close(Math.hypot(n[0], n[1]), 1, 1e-6) && close(n[2], 0, 1e-6), JSON.stringify(n));
});

test('Coons patch matches its boundary curves', () => {
  const bottom = bezierCurve([[0, 0, 0], [1, 0, 0]]);
  const top = bezierCurve([[0, 1, 0], [1, 1, 0]]);
  const left = bezierCurve([[0, 0, 0], [0, 1, 0]]);
  const right = bezierCurve([[1, 0, 0], [1, 1, 0]]);
  const patch = coonsPatch(bottom, top, left, right);
  for (const u of [0, 0.5, 1]) assert.ok(ptClose(surfacePoint(patch, u, 0), curvePoint(bottom, u), 1e-6), `u=${u}`);
  assert.ok(ptClose(surfacePoint(patch, 0.5, 0.5), [0.5, 0.5, 0], 1e-6));
});

test('birail sweep pins profile endpoints to the rails', () => {
  const profile = bezierCurve([[0, 0, 0], [0, 1, 0]]);
  const railA = bezierCurve([[0, 0, 0], [3, 0, 0]]);
  const railB = bezierCurve([[0, 0, 2], [3, 0, 2]]);
  const surf = birailSurface(profile, railA, railB);
  assert.ok(ptClose(surfacePoint(surf, 0, 0), [0, 0, 0], 1e-6));
  assert.ok(ptClose(surfacePoint(surf, 1, 1), [3, 0, 2], 1e-6));
  const mesh = tessellateSurface(surf, 6, 6);
  for (let i = 1; i < mesh.positions.length; i += 3) assert.ok(close(mesh.positions[i], 0, 1e-6), 'planar sweep');
});

test('surface projection and trimmed tessellation', () => {
  const patch = bilinearPatch([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]);
  const hit = closestPointOnSurface(patch, [0.3, 0.4, 2]);
  assert.ok(ptClose(hit.point, [0.3, 0.4, 0], 1e-6) && close(hit.distance, 2, 1e-6));
  const above = bezierCurve([[0.2, 0.2, 1], [0.8, 0.8, 1]]);
  for (const p of projectCurveOnSurface(above, patch, 8)) assert.ok(close(p[2], 0, 1e-6));
  const trimmed = tessellateTrimmedSurface(patch, [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], 16, 16);
  const full = tessellateSurface(patch, 16, 16);
  assert.ok(trimmed.indices.length < full.indices.length * 0.6, 'roughly half kept');
  for (let i = 0; i < trimmed.uvs.length; i += 2) assert.ok(trimmed.uvs[i] <= 0.5 + 1e-9, 'kept region only');
});

test('invalid definitions are rejected with clear errors', () => {
  assert.throws(() => bezierCurve([[0, 0]]), /finite/);
  assert.throws(() => arcCurve(0), /Radius/);
  assert.throws(() => insertKnot(bezierCurve([[0, 0, 0], [1, 0, 0]]), 2), /inside/);
  assert.throws(() => loftSurfaces([bezierCurve([[0, 0, 0], [1, 0, 0]])]), /two sections/);
});

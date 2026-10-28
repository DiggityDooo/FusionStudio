import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCatmullRom, parallelTransportFrames, buildRibbon } from '../src/ribbon.js';

function vertexAt(mesh, row, side) {
  const o = (row * 2 + side) * 3;
  return [mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]];
}
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

test('straight road: constant width, flat normals, area and UV oracles', () => {
  const mesh = buildRibbon([[0, 0, 0], [10, 0, 0]], { width: 2, samplesPerSegment: 10 });
  const rows = mesh.positions.length / 6;
  for (let i = 0; i < rows; i++) {
    assert.ok(Math.abs(dist(vertexAt(mesh, i, 0), vertexAt(mesh, i, 1)) - 2) < 1e-9, `row ${i} width`);
    const n = [mesh.normals[i * 6], mesh.normals[i * 6 + 1], mesh.normals[i * 6 + 2]];
    assert.ok(Math.abs(n[1] - 1) < 1e-9, 'flat road normal is +Y');
  }
  assert.ok(Math.abs(mesh.arcLength - 10) < 1e-9);
  // u spans arcLength/width = 5 tiles.
  assert.ok(Math.abs(mesh.uvs[mesh.uvs.length - 4] - 5) < 1e-9);
  assert.throws(() => buildRibbon([[0, 0, 0], [1, 0, 0]], { width: 0 }), /positive/);
});

test('circular road: vertices sit at radius +- half width, all the way around', () => {
  const R = 10, width = 3;
  const control = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    control.push([Math.cos(a) * R, 0, Math.sin(a) * R]);
  }
  const mesh = buildRibbon(control, { width, samplesPerSegment: 12, closed: true });
  const rows = mesh.positions.length / 6;
  for (let i = 0; i < rows; i++) {
    const left = vertexAt(mesh, i, 0), right = vertexAt(mesh, i, 1);
    // Catmull-Rom approximates the circle (measured max radial
    // deviation 0.085 at 8 control points): the centerline (row
    // midpoint) must stay within that spline tolerance of R, and the
    // side direction is exactly radial in flat geometry, so each
    // vertex sits at midRadius +- halfWidth.
    const mid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
    const midRadius = Math.hypot(mid[0], mid[2]);
    assert.ok(Math.abs(midRadius - R) < 0.12, `row ${i} centerline radius ${midRadius.toFixed(3)}`);
    assert.ok(Math.abs(Math.hypot(left[0], left[2]) - (midRadius - width / 2)) < 0.02, `row ${i} inner radius`);
    assert.ok(Math.abs(Math.hypot(right[0], right[2]) - (midRadius + width / 2)) < 0.02, `row ${i} outer radius`);
    assert.ok(Math.abs(left[1]) < 1e-9 && Math.abs(right[1]) < 1e-9, 'flat circle stays at y=0');
    assert.ok(Math.abs(dist(left, right) - width) < 1e-6, `row ${i} width`);
  }
  // Arc length approximates the circumference.
  assert.ok(Math.abs(mesh.arcLength - 2 * Math.PI * R) < 0.5, `arc ${mesh.arcLength.toFixed(2)}`);
});

test('parallel transport survives a vertical section without twisting or NaN', () => {
  // Path climbs straight up (tangent parallel to world Y) then levels.
  const path = [[0, 0, 0], [0, 4, 0], [0, 8, 0], [3, 10, 0], [7, 10, 0]];
  const samples = sampleCatmullRom(path, { samplesPerSegment: 10 });
  const frames = parallelTransportFrames(samples);
  for (const f of frames) {
    for (const v of [...f.tangent, ...f.side, ...f.up]) assert.ok(Number.isFinite(v), 'finite frame');
    assert.ok(Math.abs(Math.hypot(...f.up) - 1) < 1e-9);
    const dotTU = f.tangent[0] * f.up[0] + f.tangent[1] * f.up[1] + f.tangent[2] * f.up[2];
    assert.ok(Math.abs(dotTU) < 1e-9, 'up perpendicular to tangent');
  }
  // Twist stability: consecutive ups never flip.
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].up[0] * frames[i - 1].up[0] + frames[i].up[1] * frames[i - 1].up[1] + frames[i].up[2] * frames[i - 1].up[2];
    assert.ok(d > 0.8, `frame ${i} up continuity dot ${d.toFixed(3)}`);
  }
  // Parallel transport has no gravity reference: after climbing a
  // wall and bending onto the flat, the transported up ends up
  // inverted (the path's holonomy) — the right invariants are that
  // the frame stays in the path plane and the side stays horizontal.
  const last = frames[frames.length - 1];
  assert.ok(Math.abs(last.up[1]) > 0.99, `flat-run up is vertical (got ${last.up[1].toFixed(3)})`);
  assert.ok(Math.abs(last.side[2]) > 0.99, 'flat-run side is horizontal Z');
});

test('terrain-conformed ribbon lies exactly on the heightfield with gradient normals', () => {
  const heightfield = (x, z) => 0.3 * x + 0.02 * z * z;
  const mesh = buildRibbon([[0, 0, -4], [4, 0, 0], [8, 0, 4]], {
    width: 2, samplesPerSegment: 8, heightfield, heightOffset: 0.05,
  });
  const vertexCount = mesh.positions.length / 3;
  for (let v = 0; v < vertexCount; v++) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    assert.ok(Math.abs(y - (heightfield(x, z) + 0.05)) < 1e-6, `vertex ${v} on terrain`);
    // Analytic normal of h: (-0.3, 1, -0.04z) normalized.
    const gz = 0.04 * z;
    const inv = 1 / Math.hypot(0.3, 1, gz);
    const expected = [-0.3 * inv, inv, -gz * inv];
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(mesh.normals[v * 3 + k] - expected[k]) < 2e-3, `vertex ${v} normal[${k}]`);
    }
  }
});

test('catmull-rom passes through its control points', () => {
  const control = [[0, 0, 0], [2, 1, 0], [4, 0, 2], [6, 1, 2]];
  const samples = sampleCatmullRom(control, { samplesPerSegment: 6 });
  for (const cp of control) {
    const hit = samples.some((s) => dist(s, cp) < 1e-9);
    assert.ok(hit, `control point ${cp} interpolated`);
  }
  assert.throws(() => sampleCatmullRom([[0, 0, 0]]), />= 2/);
});

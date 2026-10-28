import test from 'node:test';
import assert from 'node:assert/strict';
import { displaceMesh, displacementRange, vectorDisplaceMesh } from '../src/displace.js';
import { meshVolume } from '../src/mesh-section.js';

function gridPlane(n = 9, extent = 2) {
  const positions = [], indices = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions.push(-extent + (2 * extent * i) / (n - 1), 0, -extent + (2 * extent * j) / (n - 1));
    }
  }
  const normals = new Float32Array(n * n * 3);
  for (let i = 0; i < n * n; i++) normals[i * 3 + 1] = 1;
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = i + n * j, b = a + 1, c = a + n, d = c + 1;
      indices.push(a, c, b, b, c, d); // wound for +Y normals
    }
  }
  return { positions: Float32Array.from(positions), normals, indices: Uint32Array.from(indices) };
}

function sphere(radius = 1, lats = 20, lons = 28) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= lats; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / lats;
    for (let i = 0; i <= lons; i++) {
      const theta = (2 * Math.PI * i) / lons;
      const p = [radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), radius * Math.cos(phi) * Math.sin(theta)];
      positions.push(...p);
      normals.push(p[0] / radius, p[1] / radius, p[2] / radius);
    }
  }
  const row = lons + 1;
  for (let j = 0; j < lats; j++) {
    for (let i = 0; i < lons; i++) {
      const a = i + row * j, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('scalar displacement lands exactly on the height function and retilts normals', () => {
  const plane = gridPlane();
  const out = displaceMesh(plane, ([x, , z]) => 0.1 * x + 0.2 * z);
  for (let i = 0; i < plane.positions.length; i += 3) {
    const x = plane.positions[i], z = plane.positions[i + 2];
    assert.ok(near(out.positions[i + 1], 0.1 * x + 0.2 * z, 1e-6), `vertex height at (${x}, ${z})`);
    assert.equal(out.positions[i], plane.positions[i], 'x untouched');
    assert.equal(out.positions[i + 2], plane.positions[i + 2], 'z untouched');
  }
  // Uniform slope: every recomputed normal is normalize(-0.1, 1, -0.2).
  const expected = (() => { const l = Math.hypot(0.1, 1, 0.2); return [-0.1 / l, 1 / l, -0.2 / l]; })();
  for (let i = 0; i < out.normals.length; i += 3) {
    assert.ok(near(out.normals[i], expected[0], 1e-5) && near(out.normals[i + 1], expected[1], 1e-5)
      && near(out.normals[i + 2], expected[2], 1e-5), 'displaced plane normals are the analytic slope normals');
  }
  // midpoint/scale semantics: offset = (h - midpoint) * scale.
  const shifted = displaceMesh(plane, () => 0.7, { midpoint: 0.5, scale: 2 });
  assert.ok(near(shifted.positions[1], 0.4, 1e-6), 'constant offset (0.7-0.5)*2 = 0.4');
});

test('constant radial displacement grows a sphere exactly along its normals', () => {
  const ball = sphere(1);
  const out = displaceMesh(ball, () => 1, { scale: 0.25 });
  for (let i = 0; i < out.positions.length; i += 3) {
    const r = Math.hypot(out.positions[i], out.positions[i + 1], out.positions[i + 2]);
    assert.ok(near(r, 1.25, 1e-5), `vertex radius ${r}`);
  }
  const volumeRatio = Math.abs(meshVolume(out)) / Math.abs(meshVolume(ball));
  assert.ok(Math.abs(volumeRatio - 1.25 ** 3) / 1.25 ** 3 < 0.02, `volume ratio ${volumeRatio.toFixed(3)} vs 1.953`);
  // Zero displacement is the identity (positions bit-equal).
  const identity = displaceMesh(ball, () => 0.5, { midpoint: 0.5 });
  assert.deepEqual([...identity.positions], [...ball.positions], 'zero net displacement returns the input positions');
});

test('vector displacement, array heights, and range reporting are exact', () => {
  const plane = gridPlane(3, 1);
  const vectors = new Float32Array(plane.positions.length);
  for (let i = 0; i < vectors.length; i += 3) { vectors[i] = 0.1; vectors[i + 1] = 0.2; vectors[i + 2] = -0.05; }
  const out = vectorDisplaceMesh(plane, vectors, { scale: 2 });
  for (let i = 0; i < plane.positions.length; i += 3) {
    assert.ok(near(out.positions[i] - plane.positions[i], 0.2, 1e-6)
      && near(out.positions[i + 1] - plane.positions[i + 1], 0.4, 1e-6)
      && near(out.positions[i + 2] - plane.positions[i + 2], -0.1, 1e-6), 'per-vertex vector offset');
  }
  // Array heights and function heights agree bit-for-bit.
  const heights = new Float32Array(9 * 9);
  const grid = gridPlane();
  for (let i = 0; i < heights.length; i++) heights[i] = Math.sin(grid.positions[i * 3]) * Math.cos(grid.positions[i * 3 + 2]);
  const byArray = displaceMesh(grid, heights);
  const byFn = displaceMesh(grid, ([x, , z]) => Math.sin(x) * Math.cos(z));
  assert.deepEqual([...byArray.positions], [...byFn.positions], 'array and function displacement agree');
  assert.deepEqual(displacementRange(heights, grid), { min: Math.min(...heights), max: Math.max(...heights) });
  assert.throws(() => displaceMesh(grid, new Float32Array(3)), /vertex count/);
  assert.throws(() => vectorDisplaceMesh(grid, new Float32Array(3)), /3x/);
});

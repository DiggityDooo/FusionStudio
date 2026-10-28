import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStairs, generateGear, generateFence } from '../src/procedural-assets.js';

function bounds(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], mesh.positions[i + a]);
      max[a] = Math.max(max[a], mesh.positions[i + a]);
    }
  }
  return { min, max };
}

function signedVolume(mesh) {
  const p = mesh.positions, idx = mesh.indices;
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

function assertWellFormed(mesh) {
  const n = mesh.positions.length / 3;
  assert.equal(mesh.normals.length, mesh.positions.length);
  for (const i of mesh.indices) assert.ok(i < n, 'index in range');
  for (const v of mesh.positions) assert.ok(Number.isFinite(v), 'finite positions');
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
    assert.ok(Math.abs(len - 1) < 1e-5, 'unit normals');
  }
}

test('stairs: exact dimensions, volume, and structure', () => {
  const mesh = generateStairs({ steps: 5, width: 2, tread: 0.3, riser: 0.2 });
  assertWellFormed(mesh);
  const { min, max } = bounds(mesh);
  assert.ok(Math.abs(max[1] - 1.0) < 1e-6, 'total height = steps*riser');
  assert.ok(Math.abs(max[2] - 1.5) < 1e-6, 'total run = steps*tread');
  assert.ok(Math.abs((max[0] - min[0]) - 2) < 1e-6, 'width exact');
  // Solid-stair volume: width * tread * riser * n(n+1)/2 = 2*.3*.2*15.
  assert.ok(Math.abs(signedVolume(mesh) - 1.8) < 1e-5, `volume ${signedVolume(mesh)}`);
  assert.equal(mesh.positions.length / 3, 5 * 24);
  assert.equal(mesh.indices.length, 5 * 36);
  // Top tread of the last step is at full height: some vertex has y=1, z in last tread.
  let found = false;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i + 1] - 1) < 1e-6 && mesh.positions[i + 2] > 1.2) found = true;
  }
  assert.ok(found);
  assert.throws(() => generateStairs({ steps: 0 }), /positive integer/);
  assert.throws(() => generateStairs({ tread: -1 }), /must be positive/);
});

test('gear: tooth count, radii, and extruded volume are exact', () => {
  const teeth = 12, radius = 1, depth = 0.2, thickness = 0.4;
  const mesh = generateGear({ teeth, radius, toothDepth: depth, thickness });
  assertWellFormed(mesh);
  const { min, max } = bounds(mesh);
  let maxRadius = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    maxRadius = Math.max(maxRadius, Math.hypot(mesh.positions[i], mesh.positions[i + 1]));
  }
  assert.ok(Math.abs(maxRadius - (radius + depth)) < 1e-5, 'some vertex attains the tip radius');
  assert.ok(Math.abs((max[2] - min[2]) - thickness) < 1e-6);

  // Count tip vertices: ring points at tip radius.
  const tipVerts = new Set();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1]);
    if (Math.abs(r - (radius + depth)) < 1e-5) tipVerts.add(`${mesh.positions[i].toFixed(4)},${mesh.positions[i + 1].toFixed(4)},${mesh.positions[i + 2].toFixed(3)}`);
  }
  assert.ok(tipVerts.size >= teeth * 2, 'each tooth contributes tip corners on both caps/sides');

  // Volume = outline area * thickness, outline area from the analytic profile.
  const outline = [];
  const T = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    for (const [frac, r] of [[0, radius], [0.3, radius], [0.45, radius + depth], [0.7, radius + depth]]) {
      const a = k * T + frac * T;
      outline.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % outline.length];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  const vol = Math.abs(signedVolume(mesh));
  assert.ok(Math.abs(vol - area * thickness) < 1e-4, `volume ${vol} vs ${area * thickness}`);
  assert.ok(vol > Math.PI * radius * radius * thickness, 'teeth add material beyond the root cylinder');
  assert.ok(vol < Math.PI * (radius + depth) ** 2 * thickness, 'but less than the tip cylinder');
  assert.throws(() => generateGear({ teeth: 2 }), />= 3/);
});

test('fence: post spacing, end post, rails, and merged volume', () => {
  const mesh = generateFence({ length: 4, height: 1, postEvery: 1, postSize: 0.1, railSize: 0.05, railLevels: [0.5] });
  assertWellFormed(mesh);
  assert.equal(mesh.meta.postCount, 5, 'posts at 0,1,2,3,4');
  assert.equal(mesh.meta.railCount, 1);
  const { min, max } = bounds(mesh);
  assert.ok(Math.abs(min[0] - (-0.05)) < 1e-6 && Math.abs(max[0] - 4.05) < 1e-6);
  assert.ok(Math.abs(max[1] - 1) < 1e-6);
  const expected = 5 * (0.1 * 1 * 0.1) + (4 * 0.05 * 0.03); // posts + one rail (rail depth = railSize*0.6)
  assert.ok(Math.abs(signedVolume(mesh) - expected) < 1e-5, `volume ${signedVolume(mesh)} vs ${expected}`);

  const sparse = generateFence({ length: 3.5, postEvery: 2 });
  assert.equal(sparse.meta.postCount, 2, 'floor(3.5/2)+1 posts; no forced end post beyond spacing');
  assert.throws(() => generateFence({ railLevels: [1.5] }), /rail levels/);
});

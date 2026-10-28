import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeVertexIrradiance, computeVertexNormals, rayTriangle, buildBVH } from '../src/light-bake.js';

// Flat plane in XZ at y=0, normal +Y, 4 vertices / 2 triangles.
function groundPlane(size = 4) {
  const s = size;
  return {
    positions: Float32Array.from([-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  };
}

test('lambert oracle: irradiance equals cos(incidence) exactly', () => {
  const plane = groundPlane();
  // Light coming from 60 degrees off vertical: direction FROM light.
  const dirFromLight = [Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3), 0];
  const baked = bakeVertexIrradiance(plane, [{ type: 'directional', direction: dirFromLight, intensity: 1 }]);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(baked[i * 3] - 0.5) < 1e-9, `vertex ${i}: ${baked[i * 3]} vs cos60 = 0.5`);
  }
  // Head-on light: exactly 1. Light from below the plane: exactly 0.
  const head = bakeVertexIrradiance(plane, [{ type: 'directional', direction: [0, -1, 0], intensity: 2 }]);
  assert.ok(Math.abs(head[0] - 2) < 1e-9);
  const below = bakeVertexIrradiance(plane, [{ type: 'directional', direction: [0, 1, 0], intensity: 1 }]);
  assert.ok(baked.every((v) => v >= 0) && below.every((v) => v === 0));
});

test('point light: inverse-square falloff ratios are exact', () => {
  // Receivers at distances 1, 2, 4 from the light along +X, all
  // facing the light (-X normals): separate single-vertex "meshes"
  // via a shared bake on a vertex strip with explicit normals.
  const positions = Float32Array.from([1, 0, 0, 2, 0, 0, 4, 0, 0]);
  const normals = Float32Array.from([-1, 0, 0, -1, 0, 0, -1, 0, 0]);
  // No triangles: nothing can occlude; bake per-vertex only.
  const mesh = { positions, indices: new Uint32Array(0), normals };
  const baked = bakeVertexIrradiance(mesh, [{ type: 'point', position: [0, 0, 0], intensity: 3 }]);
  assert.ok(Math.abs(baked[0] - 3) < 1e-9, `d=1: ${baked[0]}`);
  assert.ok(Math.abs(baked[3] - 3 / 4) < 1e-9, `d=2: ${baked[3]}`);
  assert.ok(Math.abs(baked[6] - 3 / 16) < 1e-9, `d=4: ${baked[6]}`);
});

test('shadows: an occluder plane zeroes the receiver exactly', () => {
  const receiver = groundPlane(2);
  // Occluder: a small plane at y=1 above the receiver center region.
  const occluder = {
    positions: Float32Array.from([-2, 1, -2, 2, 1, -2, 2, 1, 2, -2, 1, 2]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  };
  const combined = {
    positions: Float32Array.from([...receiver.positions, ...occluder.positions]),
    indices: Uint32Array.from([...receiver.indices, ...occluder.indices.map((i) => i + 4)]),
    normals: Float32Array.from([...receiver.normals, ...occluder.normals]),
  };
  const light = { type: 'directional', direction: [0, -1, 0], intensity: 1 };
  const baked = bakeVertexIrradiance(combined, [light]);
  // Receiver vertices (0..3) are fully shadowed by the equal-size
  // occluder directly above: exactly 0. Occluder vertices get 1.
  for (let i = 0; i < 4; i++) assert.equal(baked[i * 3], 0, `receiver vertex ${i} in shadow`);
  for (let i = 4; i < 8; i++) assert.ok(Math.abs(baked[i * 3] - 1) < 1e-9, `occluder vertex ${i} lit`);
  // Without the occluder, the receiver is lit.
  const alone = bakeVertexIrradiance(receiver, [light]);
  assert.ok(Math.abs(alone[0] - 1) < 1e-9);
});

test('BVH-accelerated bake is identical to the brute-force bake', () => {
  const receiver = groundPlane(2);
  const occluder = {
    positions: Float32Array.from([-2, 1, -2, 2, 1, -2, 2, 1, 2, -2, 1, 2]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  };
  const combined = {
    positions: Float32Array.from([...receiver.positions, ...occluder.positions]),
    indices: Uint32Array.from([...receiver.indices, ...occluder.indices.map((i) => i + 4)]),
    normals: Float32Array.from([...receiver.normals, ...occluder.normals]),
  };
  const lights = [
    { type: 'directional', direction: [0.3, -1, 0.2], intensity: 1 },
    { type: 'point', position: [1, 3, 1], intensity: 5 },
  ];
  const brute = bakeVertexIrradiance(combined, lights);
  const accelerated = bakeVertexIrradiance(combined, lights, { bvh: buildBVH(combined) });
  assert.deepEqual(Array.from(accelerated), Array.from(brute), 'every vertex identical');
});

test('ray-triangle intersection and vertex normals on a sphere', () => {
  assert.equal(rayTriangle([0, 0, 2], [0, 0, -1], [-1, -1, 0], [1, -1, 0], [0, 1, 0]), 2);
  assert.equal(rayTriangle([5, 5, 2], [0, 0, -1], [-1, -1, 0], [1, -1, 0], [0, 1, 0]), null);
  // Sphere: vertex normals from computeVertexNormals are radial;
  // a directional light then reproduces max(0, cos) per vertex.
  const positions = [];
  const indices = [];
  const rings = 8, segs = 16;
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s < segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      positions.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
    indices.push(a, b, c, b, d, c);
  }
  const sphere = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
  const baked = bakeVertexIrradiance(sphere, [{ type: 'directional', direction: [0, -1, 0], intensity: 1 }]);
  // Top pole vertex (index 0, normal +Y by symmetry of the fan):
  // lit by ~1; bottom pole dark. Sample a mid vertex and compare
  // against its geometric normal (radial = position on unit sphere).
  const normals = computeVertexNormals(sphere);
  for (const i of [8, 24, 40, 72]) {
    const expected = Math.max(0, normals[i * 3 + 1]); // dot with (0,1,0)
    assert.ok(Math.abs(baked[i * 3] - expected) < 0.15, `vertex ${i}: baked ${baked[i * 3].toFixed(3)} vs cos ${expected.toFixed(3)}`);
  }
  // Pole vertices are duplicated fan points whose area-weighted
  // normals tilt off-axis; check them against the same cosine law.
  const bottomPole = rings * segs;
  for (const i of [0, bottomPole]) {
    const expected = Math.max(0, normals[i * 3 + 1]);
    assert.ok(Math.abs(baked[i * 3] - expected) < 0.15, `pole vertex ${i}: baked ${baked[i * 3].toFixed(3)} vs cos ${expected.toFixed(3)}`);
  }
  assert.ok(baked[0] > 0.3, 'north pole region lit');
  assert.ok(baked[bottomPole * 3] < 0.35, 'south pole region dark');
  assert.throws(() => bakeVertexIrradiance(sphere, [{ type: 'spot' }]), /unsupported/);
});

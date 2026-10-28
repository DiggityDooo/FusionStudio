import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBVH, raycastBVH, raycastBruteForce } from '../src/bvh.js';
import { mulberry32 } from '../src/scatter.js';

// Grid of spheres approximated by UV spheres, as one mesh.
function sphereField() {
  const positions = [];
  const indices = [];
  const addSphere = (center, radius, rings = 6, segs = 10) => {
    const base = positions.length / 3;
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      for (let s = 0; s < segs; s++) {
        const theta = (s / segs) * Math.PI * 2;
        positions.push(
          center[0] + Math.sin(phi) * Math.cos(theta) * radius,
          center[1] + Math.cos(phi) * radius,
          center[2] + Math.sin(phi) * Math.sin(theta) * radius,
        );
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
      const a = base + r * segs + s, b = base + r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
      indices.push(a, b, c, b, d, c);
    }
  };
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) addSphere([x * 3 - 4.5, 0, z * 3 - 4.5], 1);
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), normals: null };
}

test('BVH raycast is identical to brute force on randomized rays', () => {
  const mesh = sphereField();
  const bvh = buildBVH(mesh);
  const rng = mulberry32(41);
  let hits = 0;
  for (let i = 0; i < 400; i++) {
    const origin = [(rng() - 0.5) * 16, 4 + rng() * 6, (rng() - 0.5) * 16];
    const target = [(rng() - 0.5) * 12, (rng() - 0.5) * 2, (rng() - 0.5) * 12];
    const dir = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
    const l = Math.hypot(...dir);
    const unit = dir.map((v) => v / l);
    const fast = raycastBVH(bvh, origin, unit);
    const slow = raycastBruteForce(mesh, origin, unit);
    assert.equal(Boolean(fast), Boolean(slow), `ray ${i}: hit agreement`);
    if (fast) {
      hits++;
      assert.ok(Math.abs(fast.t - slow.t) < 1e-9, `ray ${i}: same distance`);
      assert.equal(fast.triangle, slow.triangle, `ray ${i}: same triangle`);
    }
  }
  assert.ok(hits > 100, `enough rays hit to be meaningful (${hits})`);
});

test('BVH actually accelerates: far fewer triangle tests than brute force', () => {
  const mesh = sphereField();
  const bvh = buildBVH(mesh);
  const triCount = mesh.indices.length / 3;
  const rng = mulberry32(43);
  const fastStats = { nodesVisited: 0, trianglesTested: 0 };
  const slowStats = { nodesVisited: 0, trianglesTested: 0 };
  for (let i = 0; i < 40; i++) {
    const origin = [(rng() - 0.5) * 10, 8, (rng() - 0.5) * 10];
    const dir = [0, -1, 0];
    raycastBVH(bvh, origin, dir, fastStats);
    raycastBruteForce(mesh, origin, dir, slowStats);
  }
  assert.equal(slowStats.trianglesTested, 40 * triCount, 'brute force tests everything');
  assert.ok(fastStats.trianglesTested < slowStats.trianglesTested * 0.15,
    `BVH tested ${fastStats.trianglesTested} vs brute ${slowStats.trianglesTested}`);
  assert.ok(fastStats.nodesVisited > 0);
});

test('known geometry: ray through a sphere center hits at the analytic distance', () => {
  const mesh = sphereField();
  const bvh = buildBVH(mesh);
  // Sphere at (-4.5, 0, -4.5) radius 1 (polygonal approximation):
  // ray from y=5 straight down through its center.
  const hit = raycastBVH(bvh, [-4.5, 5, -4.5], [0, -1, 0]);
  assert.ok(hit, 'hit found');
  // Polygonal surface sits slightly inside the true sphere: the top
  // ring vertices are at phi steps of 30 degrees, so t is in a band.
  assert.ok(hit.t > 3.9 && hit.t < 4.15, `t ${hit.t.toFixed(3)} near analytic 4.0`);
  assert.ok(Math.abs(hit.point[1] - (5 - hit.t)) < 1e-9);
  assert.equal(raycastBVH(bvh, [100, 100, 100], [0, 1, 0]), null, 'miss returns null');
  assert.equal(raycastBVH(buildBVH({ positions: new Float32Array(0), indices: new Uint32Array(0), normals: null }), [0, 0, 0], [1, 0, 0]), null);
});

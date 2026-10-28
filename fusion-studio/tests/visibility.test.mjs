import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frustumFromCamera, classifySphere, classifyAabb, cullScene,
  sphereOccluded, occlusionCullSpheres, selectLod, sortRenderQueue,
} from '../src/visibility.js';

const cam = { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0], fovY: 90, aspect: 1, near: 0.1, far: 100 };

test('frustum classification: inside, outside, intersecting', () => {
  const planes = frustumFromCamera(cam);
  assert.equal(classifySphere(planes, [0, 0, -5], 0), 'inside');
  assert.equal(classifySphere(planes, [0, 0, 5], 0), 'outside', 'behind camera');
  assert.equal(classifySphere(planes, [0, 0, -0.05], 0), 'outside', 'inside near plane');
  assert.equal(classifySphere(planes, [0, 0, -150], 0), 'outside', 'beyond far');
  assert.equal(classifySphere(planes, [6, 0, -5], 0), 'outside', 'right of frustum');
  assert.equal(classifySphere(planes, [5.2, 0, -5], 0.5), 'intersecting', 'straddles right plane');
  assert.equal(classifySphere(planes, [0, -5.2, -5], 0.5), 'intersecting', 'straddles bottom plane');
  assert.equal(classifySphere(planes, [0, 0, -0.3], 0.5), 'intersecting', 'straddles near plane');
});

test('aspect ratio widens the horizontal frustum', () => {
  const wide = frustumFromCamera({ ...cam, aspect: 2 });
  const narrow = frustumFromCamera({ ...cam, aspect: 1 });
  // 50 degrees off-axis horizontally (fovY 90 -> half 45 vertical).
  const point = [Math.tan(50 * Math.PI / 180) * 5, 0, -5];
  assert.equal(classifySphere(narrow, point, 0), 'outside');
  assert.equal(classifySphere(wide, point, 0), 'inside');
});

test('sphere classification agrees with brute-force surface sampling', () => {
  // Independent oracle: a sphere is outside iff the plane's extreme point
  // in the plane-normal direction is outside; verify against dense samples
  // straddling each plane.
  const planes = frustumFromCamera({ ...cam, fovY: 70, aspect: 1.4 });
  let seed = 42;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 300; trial++) {
    const center = [(rnd() - 0.5) * 30, (rnd() - 0.5) * 30, -rnd() * 40 + 5];
    const radius = rnd() * 3;
    const cls = classifySphere(planes, center, radius);
    // Sample 400 sphere surface points; all must satisfy the verdict.
    let anyInsideFrustum = false, allInside = true;
    for (let s = 0; s < 400; s++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1);
      const p = [
        center[0] + radius * Math.sin(ph) * Math.cos(th),
        center[1] + radius * Math.sin(ph) * Math.sin(th),
        center[2] + radius * Math.cos(ph),
      ];
      const inside = planes.every((pl) => pl[0] * p[0] + pl[1] * p[1] + pl[2] * p[2] + pl[3] >= 0);
      if (inside) anyInsideFrustum = true; else allInside = false;
    }
    if (cls === 'outside') assert.ok(!anyInsideFrustum, `trial ${trial}: outside but samples inside`);
    if (cls === 'inside') assert.ok(allInside, `trial ${trial}: inside but samples outside`);
  }
});

test('AABB classification uses p-vertex correctly', () => {
  const planes = frustumFromCamera(cam);
  assert.equal(classifyAabb(planes, [-1, -1, -6], [1, 1, -4]), 'inside');
  assert.equal(classifyAabb(planes, [8, -1, -6], [10, 1, -4]), 'outside');
  assert.equal(classifyAabb(planes, [4, -1, -6], [6, 1, -4]), 'intersecting');
  assert.equal(classifyAabb(planes, [-1, -1, 2], [1, 1, 4]), 'outside', 'behind camera');
});

test('cullScene partitions objects by visibility', () => {
  const objects = [
    { id: 'a', center: [0, 0, -10], radius: 1 },
    { id: 'b', center: [50, 0, -10], radius: 1 },
    { id: 'c', center: [0, 0, 10], radius: 1 },
    { id: 'd', center: [0, 8, -10], radius: 3 },
  ];
  const { visible, culled } = cullScene(objects, cam);
  assert.deepEqual(visible.sort(), ['a', 'd']);
  assert.deepEqual(culled.sort(), ['b', 'c']);
});

test('sphere occlusion: angular-disc containment', () => {
  const eye = [0, 0, 0];
  const behind = { id: 'x', center: [0, 0, -20], radius: 1 };
  const shield = { id: 's', center: [0, 0, -10], radius: 3 };
  assert.ok(sphereOccluded(eye, behind, shield), 'directly behind a bigger, closer sphere');
  // 14.1 deg separation + 2.8 deg disc < shield's 17.5 deg disc: still hidden.
  const slightOffset = { id: 'w', center: [5, 0, -20], radius: 1 };
  assert.ok(sphereOccluded(eye, slightOffset, shield), 'small offset stays inside the disc');
  const offset = { id: 'y', center: [8, 0, -20], radius: 1 };
  assert.ok(!sphereOccluded(eye, offset, shield), 'offset disc pokes out');
  const inFront = { id: 'z', center: [0, 0, -5], radius: 1 };
  assert.ok(!sphereOccluded(eye, inFront, shield), 'closer than occluder wins');
  const smallShield = { id: 's2', center: [0, 0, -10], radius: 0.5 };
  assert.ok(!sphereOccluded(eye, behind, smallShield), 'small occluder cannot hide bigger disc');
  assert.deepEqual(occlusionCullSpheres(eye, [behind, offset, inFront], [shield]), ['x']);
});

test('LOD bands with hysteresis do not oscillate at edges', () => {
  const bands = [10, 30];
  assert.equal(selectLod(5, bands), 0);
  assert.equal(selectLod(15, bands), 1);
  assert.equal(selectLod(45, bands), 2);
  // Hovering just past an edge keeps the current LOD...
  assert.equal(selectLod(10.5, bands, 0), 0, 'not yet past +10% edge');
  assert.equal(selectLod(11.5, bands, 0), 1, 'clearly past edge steps down');
  assert.equal(selectLod(10.5, bands, 1), 1, 'stays');
  assert.equal(selectLod(9.5, bands, 1), 1, 'not yet inside -10% edge');
  assert.equal(selectLod(8.9, bands, 1), 0, 'clearly inside steps up');
  // ...and a teleport across multiple bands settles immediately.
  assert.equal(selectLod(100, bands, 0), 2);
  assert.equal(selectLod(1, bands, 2), 0);
});

test('render queue: opaque by material then front-to-back, transparent back-to-front', () => {
  const items = [
    { id: 't1', depth: 5, material: 'glass', transparent: true },
    { id: 'o1', depth: 10, material: 'wood', transparent: false },
    { id: 'o2', depth: 3, material: 'wood', transparent: false },
    { id: 'o3', depth: 1, material: 'metal', transparent: false },
    { id: 't2', depth: 20, material: 'glass', transparent: true },
  ];
  const sorted = sortRenderQueue(items);
  assert.deepEqual(sorted.map((i) => i.id), ['o3', 'o2', 'o1', 't2', 't1']);
  assert.equal(items[0].id, 't1', 'input not mutated');
});

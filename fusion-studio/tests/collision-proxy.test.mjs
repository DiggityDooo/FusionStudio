import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitSphere, fitAABB, fitOBB, fitCapsule, worstContainment, proxyVolume, distancePointToSegment,
} from '../src/collision-proxy.js';
import { mulberry32 } from '../src/scatter.js';

const flatOf = (pts) => pts.flatMap((p) => p);

function cubeCorners(half = 1) {
  const pts = [];
  for (const x of [-half, half]) for (const y of [-half, half]) for (const z of [-half, half]) pts.push([x, y, z]);
  return pts;
}

test('proxies contain every input point (the defining guarantee)', () => {
  const rng = mulberry32(19);
  const pts = [];
  for (let i = 0; i < 400; i++) pts.push([(rng() - 0.5) * 4, (rng() - 0.5) * 2, (rng() - 0.5) * 3]);
  const flat = flatOf(pts);
  for (const fit of [fitSphere, fitAABB, fitOBB, fitCapsule]) {
    const proxy = fit(flat);
    assert.ok(worstContainment(proxy, flat) <= 1e-9, `${proxy.type} contains all points`);
  }
  // AABB is exact: min/max match the data extents.
  const box = fitAABB(flat);
  assert.ok(Math.abs(box.min[0] - Math.min(...pts.map((p) => p[0]))) < 1e-12);
  assert.ok(Math.abs(box.max[2] - Math.max(...pts.map((p) => p[2]))) < 1e-12);
  assert.throws(() => fitSphere([]), /no points/);
});

test('sphere fit recovers known geometry: cube corners and sphere surface', () => {
  const cube = fitSphere(flatOf(cubeCorners(1)));
  assert.ok(Math.abs(cube.radius - Math.sqrt(3)) < 0.01, `cube sphere radius ${cube.radius} vs sqrt(3)`);
  assert.ok(Math.hypot(...cube.center) < 0.01, 'cube sphere centered');
  // Points on a known sphere of radius 2.5 centered at (1, 2, 3).
  const rng = mulberry32(23);
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const v = [rng() - 0.5, rng() - 0.5, rng() - 0.5];
    const l = Math.hypot(...v) || 1;
    pts.push([1 + (v[0] / l) * 2.5, 2 + (v[1] / l) * 2.5, 3 + (v[2] / l) * 2.5]);
  }
  const sphere = fitSphere(flatOf(pts));
  assert.ok(Math.abs(sphere.radius - 2.5) < 0.06, `recovered radius ${sphere.radius.toFixed(3)}`);
  assert.ok(Math.hypot(sphere.center[0] - 1, sphere.center[1] - 2, sphere.center[2] - 3) < 0.1, 'recovered center');
});

test('OBB beats AABB on a rotated elongated shape (volume oracle)', () => {
  // Thin box 4 x 0.4 x 0.4 rotated 40 degrees about Y: points are its
  // corners plus interior samples on its surface.
  const angle = (40 * Math.PI) / 180;
  const rot = ([x, y, z]) => [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];
  const rng = mulberry32(29);
  const pts = [];
  for (let i = 0; i < 200; i++) {
    pts.push(rot([(rng() - 0.5) * 4, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4]));
  }
  const flat = flatOf(pts);
  const aabb = fitAABB(flat);
  const obb = fitOBB(flat);
  assert.ok(worstContainment(obb, flat) <= 1e-9);
  const trueVolume = 4 * 0.4 * 0.4;
  assert.ok(proxyVolume(obb) < proxyVolume(aabb) * 0.6,
    `OBB ${proxyVolume(obb).toFixed(2)} much tighter than AABB ${proxyVolume(aabb).toFixed(2)}`);
  assert.ok(proxyVolume(obb) > trueVolume * 0.99, 'OBB still bounds the shape volume');
  // Principal axis aligns with the long direction.
  const longAxis = rot([1, 0, 0]);
  const alignment = Math.abs(obb.axes[0][0] * longAxis[0] + obb.axes[0][1] * longAxis[1] + obb.axes[0][2] * longAxis[2]);
  assert.ok(alignment > 0.99, `principal axis alignment ${alignment.toFixed(4)}`);
});

test('capsule fit: segment distance oracle and tight radius on a rod', () => {
  assert.ok(Math.abs(distancePointToSegment([0, 1, 0], [-1, 0, 0], [1, 0, 0]) - 1) < 1e-12);
  assert.ok(Math.abs(distancePointToSegment([3, 0, 0], [-1, 0, 0], [1, 0, 0]) - 2) < 1e-12, 'endpoint clamping');
  // Points on a cylinder of radius 0.3 around the X axis, x in [-2, 2].
  const rng = mulberry32(31);
  const pts = [];
  for (let i = 0; i < 250; i++) {
    const a = rng() * Math.PI * 2;
    pts.push([-2 + rng() * 4, Math.cos(a) * 0.3, Math.sin(a) * 0.3]);
  }
  const capsule = fitCapsule(flatOf(pts));
  assert.ok(worstContainment(capsule, flatOf(pts)) <= 1e-9);
  // PCA axis from 250 samples tilts slightly (radius 0.327 measured):
  // tightness on sampled data is statistical; containment above is exact.
  assert.ok(Math.abs(capsule.radius - 0.3) < 0.04, `capsule radius ${capsule.radius.toFixed(3)} vs 0.3`);
  const sphereVol = proxyVolume(fitSphere(flatOf(pts)));
  assert.ok(proxyVolume(capsule) < sphereVol * 0.7, 'capsule is the tighter proxy for a rod');
});

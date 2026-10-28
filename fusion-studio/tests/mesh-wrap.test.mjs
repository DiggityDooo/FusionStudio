import test from 'node:test';
import assert from 'node:assert/strict';
import { closestPointOnTriangle, closestPointOnMesh, wrapMesh } from '../src/mesh-wrap.js';

test('closest point on triangle covers face, edge, and vertex regions', () => {
  const a = [0, 0, 0], b = [2, 0, 0], c = [0, 2, 0];
  const face = closestPointOnTriangle([0.5, 0.5, 3], a, b, c);
  assert.ok(Math.abs(face.point[2]) < 1e-12 && Math.abs(face.point[0] - 0.5) < 1e-12);
  assert.ok(face.barycentric.every((w) => w > 0 && w < 1), 'interior barycentric');
  assert.ok(Math.abs(face.barycentric.reduce((s, w) => s + w, 0) - 1) < 1e-12);
  const edge = closestPointOnTriangle([1, -1, 0.5], a, b, c);
  assert.ok(Math.abs(edge.point[0] - 1) < 1e-12 && Math.abs(edge.point[1]) < 1e-12, 'clamped to AB edge');
  const vertex = closestPointOnTriangle([-1, -1, 0], a, b, c);
  assert.deepEqual(vertex.point, [0, 0, 0]);
  assert.deepEqual(vertex.barycentric, [1, 0, 0]);
  // Beyond the hypotenuse BC.
  const hyp = closestPointOnTriangle([2, 2, 1], a, b, c);
  assert.ok(Math.abs(hyp.point[0] + hyp.point[1] - 2) < 1e-9 && hyp.point[2] === 0, 'on BC line');
  assert.ok(Math.abs(hyp.barycentric[0]) < 1e-9, 'zero weight on A');
});

function uvSphere(radius, wSegs, hSegs, center = [0, 0, 0]) {
  const positions = [], indices = [];
  for (let j = 0; j <= hSegs; j++) {
    for (let i = 0; i <= wSegs; i++) {
      const u = i / wSegs * Math.PI * 2, v = j / hSegs * Math.PI;
      positions.push(
        center[0] + radius * Math.sin(v) * Math.cos(u),
        center[1] + radius * Math.cos(v),
        center[2] + radius * Math.sin(v) * Math.sin(u));
    }
  }
  for (let j = 0; j < hSegs; j++) for (let i = 0; i < wSegs; i++) {
    const a = j * (wSegs + 1) + i, b = a + 1, c = a + wSegs + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function gridPlane(size, cells, z) {
  const positions = [], indices = [];
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) {
    positions.push(-size / 2 + (i / cells) * size, -size / 2 + (j / cells) * size, z);
  }
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

test('closest point on mesh finds the analytic sphere distance', () => {
  const sphere = uvSphere(3, 24, 16);
  const hit = closestPointOnMesh([10, 0, 0], sphere);
  // Triangulated sphere: closest point is within a facet of the ideal (3,0,0).
  assert.ok(Math.abs(hit.distance - 7) < 0.05, `distance ${hit.distance}`);
  assert.ok(Math.abs(Math.hypot(...hit.point) - 3) < 0.05);
});

test('wrap conforms a template to the target surface, keeping topology', () => {
  const target = uvSphere(3, 32, 24);
  const template = uvSphere(5, 24, 16); // larger sphere around it
  const { mesh, maxDistance, meanDistance } = wrapMesh(template, target, { iterations: 6 });
  assert.ok(maxDistance < 1e-6, `max distance ${maxDistance}`);
  assert.ok(meanDistance < 1e-6);
  assert.equal(mesh.indices, template.indices, 'topology untouched');
  assert.equal(mesh.positions.length, template.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    // Facets of the 32x24 target sag up to ~0.021 inside the ideal sphere;
    // exact conformity to the mesh itself is the maxDistance check above.
    assert.ok(Math.abs(r - 3) < 0.03, `vertex on sphere: r=${r}`);
  }
});

test('wrap of a plane onto a plane is the identity; onto a sphere it drapes', () => {
  const flat = gridPlane(4, 4, 2);
  const flatTarget = gridPlane(6, 2, 2);
  const identity = wrapMesh(flat, flatTarget, { iterations: 3 });
  assert.ok(identity.maxDistance < 1e-9, 'already on surface: nothing moves');
  // A plane 2 units above a sphere sags onto it under wrap.
  const sphere = uvSphere(3, 32, 24, [0, 0, -1]); // top of sphere reaches z=2
  const draped = wrapMesh(gridPlane(3, 6, 4.5), sphere, { iterations: 10, smoothing: 0.2 });
  assert.ok(draped.maxDistance < 1e-6, `draped max distance ${draped.maxDistance}`);
  let minZ = Infinity;
  for (let i = 2; i < draped.mesh.positions.length; i += 3) minZ = Math.min(minZ, draped.mesh.positions[i]);
  assert.ok(minZ < 2.2, `template sagged to the sphere top: minZ ${minZ}`);
});

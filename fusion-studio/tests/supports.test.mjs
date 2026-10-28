import test from 'node:test';
import assert from 'node:assert/strict';
import { addFeature, buildFeatureTree, createFeatureTree } from '../src/feature-tree.js';
import {
  overhangFaces, overhangArea, generateSupports, rotateMesh,
  evaluateOrientation, optimizeOrientation, ORIENTATION_CANDIDATES,
} from '../src/supports.js';

function built(feature) {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'm', ...feature });
  return buildFeatureTree(tree).get('m');
}

function translateZ(mesh, dz) {
  const positions = Float32Array.from(mesh.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] += dz;
  return { positions, indices: mesh.indices };
}

// Axis-aligned box mesh (12 triangles, outward) for composite fixtures.
function boxMesh(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom (-z)
    [4, 5, 6], [4, 6, 7], // top (+z)
    [0, 1, 5], [0, 5, 4], // front (-y)
    [2, 3, 7], [2, 7, 6], // back (+y)
    [0, 4, 7], [0, 7, 3], // left (-x)
    [1, 2, 6], [1, 6, 5], // right (+x)
  ];
  const positions = [], indices = [];
  for (const f of faces) for (const vi of f) { indices.push(positions.length / 3); positions.push(...v[vi]); }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function mergeMeshes(a, b) {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions); positions.set(b.positions, a.positions.length);
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  const offset = a.positions.length / 3;
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + offset;
  return { positions, indices };
}

test('overhang rule: flat undersides flagged, walls and tops not', () => {
  const cube = boxMesh(0, 0, 5, 10, 10, 10); // sits on the plate (z 0..10)
  const faces = overhangFaces(cube, { maxAngleDeg: 45 });
  assert.equal(faces.length, 2, 'only the two bottom triangles');
  assert.ok(faces.every((f) => Math.abs(f.inclination) < 1e-6), 'flat = 0 deg inclination');
  // But it sits on the plate: no supports are generated for it.
  assert.equal(generateSupports(cube).columns.length, 0);
  assert.equal(generateSupports(cube).volume, 0);
  // A vertical cylinder (Z axis, capped) needs no supports either.
  assert.equal(generateSupports(zCylinder(5, 10, 48)).columns.length, 0);
});

// Closed Z-axis cylinder: side quads, cap fans, outward winding.
function zCylinder(r, h, seg = 48) {
  const positions = [], indices = [];
  const ring = (z) => {
    const start = positions.length / 3;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      positions.push(r * Math.cos(a), r * Math.sin(a), z);
    }
    return start;
  };
  const bot = ring(0), top = ring(h);
  const botC = positions.length / 3; positions.push(0, 0, 0);
  const topC = positions.length / 3; positions.push(0, 0, h);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    indices.push(bot + i, bot + j, top + j, bot + i, top + j, top + i); // side
    indices.push(botC, bot + j, bot + i); // bottom fan (-z)
    indices.push(topC, top + i, top + j); // top fan (+z)
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

test('floating slab gets grid supports under its footprint', () => {
  const slab = boxMesh(0, 0, 4.5, 12, 12, 1); // bottom at z=4
  const { columns, volume, contactArea } = generateSupports(slab, { xySpacing: 4, topGap: 0.2 });
  assert.ok(columns.length >= 9, `columns ${columns.length}`);
  for (const c of columns) {
    assert.ok(Math.abs(c.x) <= 6 && Math.abs(c.y) <= 6, 'under the footprint');
    assert.ok(Math.abs(c.zTop - 3.8) < 1e-6, `column top ${c.zTop}`);
  }
  assert.ok(volume > 0 && contactArea > 0);
  // Sphere: supports only under the low, shallow band.
  const sphere = translateZ(built({ type: 'sphere', params: { radius: 5, widthSegs: 48, heightSegs: 24 } }), 5);
  const s = generateSupports(sphere, { xySpacing: 2.5 });
  assert.ok(s.columns.length > 0, 'sphere needs some support');
  assert.ok(s.columns.every((c) => c.zTop < 2), 'only the lower band is supported');
});

test('the 45-degree boundary is respected (strict inequality)', () => {
  const cube = boxMesh(0, 0, 8, 6, 6, 6);
  const tilted = rotateMesh(cube, { axis: [1, 0, 0], angleDeg: 45 });
  assert.equal(overhangFaces(tilted, { maxAngleDeg: 45 }).length, 0, 'exactly 45 deg prints');
  assert.ok(overhangFaces(tilted, { maxAngleDeg: 50 }).length > 0, 'shallower threshold catches them');
});

test('rotateMesh is a true rotation (vertex map, area preserved)', () => {
  const triMesh = { positions: new Float32Array([0, 5, 0, 1, 5, 0, 0, 6, 0]), indices: new Uint32Array([0, 1, 2]) };
  const rotated = rotateMesh(triMesh, { axis: [1, 0, 0], angleDeg: 90 });
  // (0,5,0) -> (0,0,5) under +90 deg about X.
  assert.ok(Math.abs(rotated.positions[0]) < 1e-9 && Math.abs(rotated.positions[1]) < 1e-9 && Math.abs(rotated.positions[2] - 5) < 1e-6);
  const box = boxMesh(0, 0, 0, 4, 6, 8);
  const spun = rotateMesh(box, { axis: [0, 0, 1], angleDeg: 33 });
  // Total surface area is rotation-invariant: 2*(24+32+48) = 208.
  const areaOf = (mesh) => {
    let total = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = mesh.positions, a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    return total;
  };
  assert.ok(Math.abs(areaOf(spun) - 208) < 1e-4, `area ${areaOf(spun)}`);
});

test('orientation optimizer flips a T part to eliminate supports', () => {
  const post = boxMesh(0, 0, 4, 2, 2, 8);
  const cap = boxMesh(0, 0, 8.5, 10, 10, 1);
  const tee = mergeMeshes(post, cap);
  const asIs = evaluateOrientation(tee, ORIENTATION_CANDIDATES[0], { xySpacing: 3 });
  assert.ok(asIs.supportVolume > 0, 'cap underside needs support as-is');
  const { best, results } = optimizeOrientation(tee, { xySpacing: 3 });
  assert.equal(results.length, ORIENTATION_CANDIDATES.length);
  // Several orientations legitimately reach ~zero support here: flipping
  // the T puts the cap on the plate, and a 45 deg tilt puts the cap
  // underside exactly at the printable angle. Assert the property (and
  // the flip specifically), not a unique winner.
  const flipped = evaluateOrientation(tee, ORIENTATION_CANDIDATES.find((c) => c.name === 'x180'), { xySpacing: 3 });
  assert.ok(flipped.supportVolume < asIs.supportVolume * 0.05, `flip nearly eliminates support: ${flipped.supportVolume} vs ${asIs.supportVolume}`);
  assert.ok(best.supportVolume < asIs.supportVolume * 0.05, `best (${best.name}) nearly eliminates support: ${best.supportVolume} vs ${asIs.supportVolume}`);
  // Area ties are possible: the merged mesh keeps internal faces (the
  // flipped post's buried face still counts geometrically).
  assert.ok(best.overhangArea <= asIs.overhangArea + 1e-9, 'no worse in shallow area');
});

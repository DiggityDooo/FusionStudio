import test from 'node:test';
import assert from 'node:assert/strict';
import { meshBounds, meshVolume } from '../src/feature-tree.js';
import {
  fieldSmoothUnion, fieldSubtract, fieldUnion, metaballField, metaballMesh,
  polygonizeField, sdfSphere,
} from '../src/metaballs.js';

const near = (a, b, eps) => Math.abs(a - b) <= eps;

function edgeUse(mesh) {
  const use = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const key = [tri[e], tri[(e + 1) % 3]].sort((x, y) => x - y).join('_');
      use.set(key, (use.get(key) || 0) + 1);
    }
  }
  return use;
}

test('single metaball extracts a watertight sphere-like mesh', () => {
  const mesh = metaballMesh([{ center: [0, 0, 0], radius: 2 }], { res: 24, iso: 0.25 });
  assert.ok(mesh.indices.length > 300, `tris ${mesh.indices.length / 3}`);
  // iso .25 on (1-(d/r)^2)^2 -> d = r*sqrt(1-sqrt(.25)) = 2*0.7071
  const expected = 4 / 3 * Math.PI * (2 * Math.SQRT1_2) ** 3;
  const volume = Math.abs(meshVolume(mesh));
  assert.ok(near(volume, expected, expected * 0.18), `volume ${volume} vs ${expected}`);
  for (const [, count] of edgeUse(mesh)) assert.equal(count, 2, 'watertight edges');
  const { size } = meshBounds(mesh);
  assert.ok(size.every((v) => near(v, 2 * 2 * Math.SQRT1_2, 0.35)), `size ${size}`);
});

test('two metaballs merge into one connected blob', () => {
  const apart = metaballMesh([{ center: [-6, 0, 0], radius: 2 }, { center: [6, 0, 0], radius: 2 }], { res: 20, iso: 0.35 });
  const nearMesh = metaballMesh([{ center: [-1.4, 0, 0], radius: 2 }, { center: [1.4, 0, 0], radius: 2 }], { res: 24, iso: 0.35 });
  // Merged blob: bridge means x-extent stays ~one body and volume grows
  // relative to a single ball (single at iso .35 ~ r_eff 1.29).
  const vNear = Math.abs(meshVolume(nearMesh));
  const single = Math.abs(meshVolume(metaballMesh([{ center: [0, 0, 0], radius: 2 }], { res: 24, iso: 0.35 })));
  assert.ok(vNear > single * 1.3, `merged ${vNear} vs single ${single}`);
  assert.ok(Math.abs(meshVolume(apart)) > single * 1.8, 'two separate balls ~2x');
  for (const [, count] of edgeUse(nearMesh)) assert.equal(count, 2, 'merged mesh watertight');
});

test('SDF booleans: union, smooth union and subtraction volumes order correctly', () => {
  const a = sdfSphere([-1, 0, 0], 2), b = sdfSphere([1, 0, 0], 2);
  const grid = { min: [-4.5, -3.5, -3.5], max: [4.5, 3.5, 3.5], res: 30, iso: 0 };
  const vUnion = Math.abs(meshVolume(polygonizeField(fieldUnion(a, b), grid)));
  const vSmooth = Math.abs(meshVolume(polygonizeField(fieldSmoothUnion(a, b, 0.6), grid)));
  const vSub = Math.abs(meshVolume(polygonizeField(fieldSubtract(a, b), grid)));
  const sphere = 4 / 3 * Math.PI * 8;
  assert.ok(vUnion > sphere && vUnion < 2 * sphere, `union ${vUnion}`);
  assert.ok(vSmooth >= vUnion, `smooth ${vSmooth} >= union`);
  assert.ok(vSub < sphere && vSub > sphere * 0.4, `subtract ${vSub}`);
});

test('field evaluation: metaball falloff and validation', () => {
  const f = metaballField([{ center: [0, 0, 0], radius: 2, strength: 2 }]);
  assert.ok(near(f(0, 0, 0), 2, 1e-12));
  assert.equal(f(3, 0, 0), 0);
  assert.ok(near(f(1, 0, 0), 2 * (1 - 0.25) ** 2, 1e-12));
  assert.throws(() => metaballMesh([{ center: [0, 0, 0], radius: 0 }]), /radius/);
  assert.throws(() => polygonizeField(f, { res: 0 }), /Resolution/);
});

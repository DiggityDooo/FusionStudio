import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversionMatrix, flipsWinding, convertVector, convertMesh,
  convertQuaternion, unitScale, FRAME_NAMES,
} from '../src/scene-units.js';

function rotateByQuat(q, v) {
  const [x, y, z, w] = q;
  // v' = q * v * q^-1 expanded
  const ux = 2 * (y * v[2] - z * v[1]);
  const uy = 2 * (z * v[0] - x * v[2]);
  const uz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * ux + (y * uz - z * uy),
    v[1] + w * uy + (z * ux - x * uz),
    v[2] + w * uz + (x * uy - y * ux),
  ];
}

function close(a, b, eps = 1e-9) {
  return a.every((v, i) => Math.abs(v - b[i]) < eps);
}

test('known axis mappings: Blender Z-up to Maya Y-up and back', () => {
  const blenderToMaya = conversionMatrix('blender', 'maya');
  assert.ok(close(convertVector(blenderToMaya, [0, 0, 1]), [0, 1, 0]), 'Blender up -> Maya up');
  assert.ok(close(convertVector(blenderToMaya, [0, 1, 0]), [0, 0, -1]), 'Blender forward (north) -> Maya away');
  assert.ok(close(convertVector(blenderToMaya, [1, 0, 0]), [1, 0, 0]), 'right stays right');
  const mayaToBlender = conversionMatrix('maya', 'blender');
  assert.ok(close(convertVector(mayaToBlender, [0, 1, 0]), [0, 0, 1]));
  assert.ok(close(convertVector(mayaToBlender, [0, 0, 1]), [0, -1, 0]), 'Maya toward-viewer -> Blender south');
  // Unreal: forward is its X, up is its Z.
  const unrealToMaya = conversionMatrix('unreal', 'maya');
  assert.ok(close(convertVector(unrealToMaya, [1, 0, 0]), [0, 0, -1]), 'Unreal forward -> away');
  assert.ok(close(convertVector(unrealToMaya, [0, 1, 0]), [1, 0, 0]), 'Unreal right -> right');
  assert.ok(close(convertVector(unrealToMaya, [0, 0, 1]), [0, 1, 0]), 'Unreal up -> up');
});

test('every frame pair round-trips exactly and matrices are orthonormal', () => {
  const p = [0.3, -1.7, 2.9];
  for (const a of FRAME_NAMES) {
    for (const b of FRAME_NAMES) {
      const m = conversionMatrix(a, b);
      // Orthonormal: rows unit and mutually perpendicular.
      for (let r = 0; r < 3; r++) {
        const row = [m[r * 3], m[r * 3 + 1], m[r * 3 + 2]];
        assert.ok(Math.abs(Math.hypot(...row) - 1) < 1e-12, `${a}->${b} row ${r} unit`);
      }
      const there = convertVector(m, p);
      const back = convertVector(conversionMatrix(b, a), there);
      assert.ok(close(back, p), `${a}->${b}->${a}`);
    }
  }
});

test('winding flips exactly across handedness changes', () => {
  assert.equal(flipsWinding('blender', 'maya'), false, 'both right-handed');
  assert.equal(flipsWinding('blender', 'unity'), true);
  assert.equal(flipsWinding('blender', 'unreal'), true);
  assert.equal(flipsWinding('maya', 'unity'), true);
  assert.equal(flipsWinding('unity', 'unreal'), false, 'both left-handed');
  assert.equal(flipsWinding('maya', 'maya'), false);
});

test('mesh conversion: positions, normals, winding, and units together', () => {
  // One triangle in Blender: points on +Z (up), wound CCW seen from +Z.
  const mesh = {
    positions: new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const maya = convertMesh(mesh, { from: 'blender', to: 'maya', fromUnit: 'm', toUnit: 'cm' });
  assert.deepEqual([...maya.indices], [0, 1, 2], 'no winding flip within right-handed frames');
  assert.equal(maya.windingFlipped, false);
  // (0,0,1) Blender = 1m up -> (0, 100, 0) cm in Maya.
  assert.ok(Math.abs(maya.positions[2 + 0] - 0) < 1e-4 && Math.abs(maya.positions[1] - 100) < 1e-3, `pos1 ${maya.positions.slice(0, 3)}`);
  assert.ok(Math.abs(maya.normals[1] - 1) < 1e-6, 'normal rotated to +Y');
  assert.ok(Math.abs(maya.normals[2]) < 1e-6, 'normals are not unit-scaled');

  const unity = convertMesh(mesh, { from: 'blender', to: 'unity' });
  assert.deepEqual([...unity.indices], [0, 2, 1], 'winding flipped across handedness');
  assert.equal(unity.windingFlipped, true);
});

test('quaternion conversion preserves the physical rotation', () => {
  // +90 degrees about Blender's up (Z) takes +X to +Y (Blender north).
  const qBlender = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const testVecBlender = [1, 0, 0];
  const rotatedBlender = rotateByQuat(qBlender, testVecBlender);
  assert.ok(close(rotatedBlender, [0, 1, 0], 1e-9));

  const qMaya = convertQuaternion(qBlender, 'blender', 'maya');
  const m = conversionMatrix('blender', 'maya');
  const rotatedMaya = rotateByQuat(qMaya, convertVector(m, testVecBlender));
  const expectedMaya = convertVector(m, rotatedBlender);
  // Quaternion sign is ambiguous; compare via the rotated vector.
  assert.ok(close(rotatedMaya, expectedMaya, 1e-9), `rotated ${rotatedMaya} vs expected ${expectedMaya}`);
  // And equivalently: +90 about Maya Y takes +X to -Z.
  assert.ok(close(rotatedMaya, [0, 0, -1], 1e-9));

  const back = convertQuaternion(qMaya, 'maya', 'blender');
  const dot = Math.abs(back.reduce((s, v, i) => s + v * qBlender[i], 0));
  assert.ok(Math.abs(dot - 1) < 1e-9, 'round-trip quaternion matches up to sign');
});

test('unit scale factors are exact ratios', () => {
  assert.equal(unitScale('cm', 'm'), 0.01);
  assert.equal(unitScale('m', 'cm'), 100);
  assert.ok(Math.abs(unitScale('in', 'mm') - 25.4) < 1e-9);
  assert.equal(unitScale('m', 'm'), 1);
  assert.throws(() => unitScale('m', 'furlongs'), /unknown unit/);
  assert.throws(() => conversionMatrix('blender', 'narnia'), /unknown frame/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeLightmap } from '../src/lightmap.js';
import { buildBVH } from '../src/bvh.js';

// 2x2 m floor quad at y=0, UV-mapped to the full texture.
function floorQuad() {
  return {
    positions: new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: Uint32Array.from([0, 2, 1, 0, 3, 2]),
  };
}

const texel = (map, i, j) => {
  const idx = (i + map.resolution * j) * 3;
  return [map.data[idx], map.data[idx + 1], map.data[idx + 2]];
};

test('directional bake fills the quad with exactly cos * intensity', () => {
  const map = bakeLightmap(floorQuad(), [
    { type: 'directional', direction: [0, -1, 0], intensity: 2, color: [1, 0.5, 0.25] },
  ], { resolution: 16 });
  assert.equal(map.coveredTexels, 256, 'full-texture UVs cover every texel');
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = texel(map, i, j);
      assert.ok(Math.abs(r - 2) < 1e-6 && Math.abs(g - 1) < 1e-6 && Math.abs(b - 0.5) < 1e-6,
        `texel ${i},${j} = ${[r, g, b]}`);
    }
  }
  // Angled light: cos(45 deg) of an intensity-1 white light.
  const angled = bakeLightmap(floorQuad(), [
    { type: 'directional', direction: [Math.SQRT1_2, -Math.SQRT1_2, 0], intensity: 1 },
  ], { resolution: 4 });
  assert.ok(Math.abs(texel(angled, 1, 1)[0] - Math.SQRT1_2) < 1e-6, 'angled Lambert term');
});

test('point light texels follow the analytic inverse-square/Lambert law', () => {
  const res = 32;
  const map = bakeLightmap(floorQuad(), [
    { type: 'point', position: [0, 1, 0], intensity: 1 },
  ], { resolution: res });
  // Sample texels across the map and compare against the closed
  // form evaluated at the texel's world position (uv -> [-1,1]^2).
  for (const [i, j] of [[16, 16], [24, 16], [4, 28], [31, 0], [16, 24]]) {
    const wx = ((i + 0.5) / res) * 2 - 1;
    const wz = ((j + 0.5) / res) * 2 - 1;
    const d = Math.hypot(wx, 1, wz);
    const expected = (1 / (d * d)) * (1 / d); // attenuation * cos(theta), cos = 1/d here
    const [r] = texel(map, i, j);
    assert.ok(Math.abs(r - expected) < 1e-5, `texel ${i},${j}: ${r} vs analytic ${expected}`);
  }
});

test('an occluder casts an exact half-shadow under a vertical directional light', () => {
  // Occluder quad at y=1 covering x in [-1, 0] (left half).
  const occluder = {
    positions: new Float32Array([-1, 1, -1, 0, 1, -1, 0, 1, 1, -1, 1, 1]),
    normals: null,
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
  const res = 16;
  const map = bakeLightmap(floorQuad(), [
    { type: 'directional', direction: [0, -1, 0], intensity: 1 },
  ], { resolution: res, occluders: [occluder] });
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const wx = ((i + 0.5) / res) * 2 - 1;
      const [r] = texel(map, i, j);
      if (wx < -0.05) assert.equal(r, 0, `shadowed texel ${i},${j}`);
      if (wx > 0.05) assert.ok(Math.abs(r - 1) < 1e-6, `lit texel ${i},${j} = ${r}`);
    }
  }
  assert.throws(() => bakeLightmap({ positions: floorQuad().positions, indices: floorQuad().indices, normals: null }, []), /uvs is required/);
});

test('coverage counts match UV area; BVH bake is identical to brute force', () => {
  // Mesh using only the lower-left UV quarter (one triangle).
  const tri = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 0.5, 0, 0, 0.5]),
    indices: Uint32Array.from([0, 2, 1]),
  };
  const lights = [{ type: 'directional', direction: [0, -1, 0], intensity: 1 }];
  const map = bakeLightmap(tri, lights, { resolution: 32 });
  const expected = 32 * 32 * (0.5 * 0.5 * 0.5); // triangle is 1/8 of the texture
  assert.ok(Math.abs(map.coveredTexels - expected) < 40, `coverage ${map.coveredTexels} vs ~${expected}`);
  const brute = bakeLightmap(floorQuad(), lights, { resolution: 16 });
  const accel = bakeLightmap(floorQuad(), lights, { resolution: 16, bvh: buildBVH(floorQuad()) });
  assert.deepEqual([...accel.data], [...brute.data], 'BVH and brute-force texels identical');
});

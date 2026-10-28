import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBuilding, triangulatePolygon } from '../src/building.js';
import { meshVolume } from '../src/mesh-section.js';
import { signedArea } from '../src/toolpath.js';

const RECT = [[0, 0], [10, 0], [10, 8], [0, 8]]; // in XZ

function topmostY(mesh) {
  let max = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) max = Math.max(max, mesh.positions[i]);
  return max;
}

test('flat-roof building: volume is footprint area x height, walls face outward', () => {
  const { mesh, height, footprintArea } = generateBuilding({ footprint: RECT, floors: 3, floorHeight: 3 });
  assert.equal(height, 9);
  assert.equal(footprintArea, 80);
  const volume = meshVolume(mesh);
  assert.ok(Math.abs(volume - 720) < 1e-6, `volume ${volume} vs 720 (positive = outward winding)`);
  assert.equal(topmostY(mesh), 9);
  // Wall normals point horizontally outward: for each vertex at the
  // building's x extremes, normal x must share its sign.
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1];
    const nx = mesh.normals[i * 3], ny = mesh.normals[i * 3 + 1];
    if (y > 0 && y < 9 && (x === 0 || x === 10)) {
      assert.ok(Math.sign(nx) === Math.sign(x - 5), `wall at x=${x} faces outward (nx=${nx})`);
    }
    void ny;
  }
  // Cap vertices exist at the top with +Y normals (wall-top vertices
  // at the same height have horizontal normals, so select on both).
  let capVertices = 0;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    if (mesh.positions[i * 3 + 1] === 9 && Math.abs(mesh.normals[i * 3 + 1] - 1) < 1e-9) capVertices++;
  }
  assert.ok(capVertices >= 3, 'roof cap faces up');
});

test('L-shaped footprint: ear-clipped caps keep the exact volume', () => {
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  const { mesh, footprintArea } = generateBuilding({ footprint: L, floors: 2, floorHeight: 2.5 });
  assert.equal(footprintArea, 64);
  assert.ok(Math.abs(meshVolume(mesh) - 64 * 5) < 1e-6, `L volume ${meshVolume(mesh)} vs 320`);
  // Ear clipping of the L alone: total triangle area equals the polygon area.
  const tris = triangulatePolygon(L);
  let area = 0;
  for (const [i, j, k] of tris) area += Math.abs(signedArea([L[i], L[j], L[k]]));
  assert.ok(Math.abs(area - 64) < 1e-9);
});

test('gable roof: volume is box + triangular prism, ridge at the right height', () => {
  const { mesh, height } = generateBuilding({ footprint: RECT, floors: 2, floorHeight: 3, roof: 'gable', roofHeight: 2.5 });
  assert.equal(height, 8.5);
  // Box 10x8x6 = 480; prism: 0.5 * 8 (span) * 2.5 * 10 (length) = 100.
  const volume = meshVolume(mesh);
  assert.ok(Math.abs(volume - 580) < 1e-6, `gable volume ${volume} vs 580`);
  assert.equal(topmostY(mesh), 8.5);
  // Slope normals point up/outward; gable-end normals are horizontal.
  let slopeCount = 0;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const y = mesh.positions[i * 3 + 1];
    if (y > 6) {
      const nx = mesh.normals[i * 3], ny = mesh.normals[i * 3 + 1];
      assert.ok(ny > 0.3 || Math.abs(nx) > 0.9, `roof normal (${nx.toFixed(2)}, ${ny.toFixed(2)}) is slope-up or gable-end`);
      if (ny > 0.3) slopeCount++;
    }
  }
  assert.ok(slopeCount > 0);
  assert.throws(() => generateBuilding({ footprint: [[0, 0], [10, 0], [5, 8]], roof: 'gable' }), /rectangular/);
  assert.throws(() => generateBuilding({ footprint: [[0, 0], [1, 0]] }), />= 3/);
});

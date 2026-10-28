import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHeightfield, getTerrainHeights, applyTerrainErosion,
  createSkyAtmosphere, setTimeOfDay, generateRock,
} from '../src/environments.js';
import { sunPosition } from '../src/solar.js';

const sum = (arr) => arr.reduce((s, v) => s + v, 0);

test('terrain heights round-trip through the mesh geometry', () => {
  const t = createHeightfield({ res: 16, size: 8, seed: 2, height: 2 });
  const heights = getTerrainHeights(t);
  assert.equal(heights.length, 16 * 16);
  const pos = t.geometry.attributes.position;
  for (let i = 0; i < heights.length; i++) assert.equal(heights[i], pos.getY(i));
  assert.throws(() => getTerrainHeights(generateRock({})), /Not a terrain/);
});

test('hydraulic erosion on a real terrain mesh balances its sediment audit', () => {
  const t = createHeightfield({ res: 32, size: 12, seed: 3, height: 2.5, erosion: 0 });
  const before = getTerrainHeights(t);
  const audit = applyTerrainErosion(t, { method: 'hydraulic', droplets: 1200, seed: 5 });
  const after = getTerrainHeights(t);
  let maxDelta = 0;
  for (let i = 0; i < before.length; i++) maxDelta = Math.max(maxDelta, Math.abs(after[i] - before[i]));
  assert.ok(maxDelta > 1e-3, `terrain actually eroded (max delta ${maxDelta})`);
  // The mesh-level height change must equal the kernel audit's net flow.
  const net = sum(after) - sum(before);
  assert.ok(Math.abs(net - (audit.deposited - audit.eroded)) < 0.05,
    `mesh net ${net} vs audit ${audit.deposited - audit.eroded}`);
  assert.ok(Math.abs((audit.eroded - audit.deposited) - audit.exported) < 0.05, 'audit identity on mesh');
  // Normals were recomputed and are finite.
  const normals = t.geometry.attributes.normal;
  for (let i = 0; i < normals.array.length; i++) assert.ok(Number.isFinite(normals.array[i]));
  assert.throws(() => applyTerrainErosion(t, { method: 'acid' }), /Unknown erosion method/);
});

test('thermal erosion on a mesh enforces the talus bound in world heights', () => {
  const t = createHeightfield({ res: 24, size: 10, seed: 1, height: 3, erosion: 0 });
  const talus = 0.05;
  applyTerrainErosion(t, { method: 'thermal', talus, iterations: 300 });
  const h = getTerrainHeights(t);
  const res = 24;
  let maxSlope = 0;
  for (let y = 0; y < res; y++) for (let x = 0; x < res - 1; x++) {
    maxSlope = Math.max(maxSlope, Math.abs(h[y * res + x + 1] - h[y * res + x]));
  }
  assert.ok(maxSlope <= talus + 1e-3, `mesh max slope ${maxSlope} <= ${talus}`);
});

test('sky uses the real solar kernel; time-of-day preserves location', () => {
  const noon = createSkyAtmosphere({ timeOfDay: 12, latitude: 40, dayOfYear: 172 });
  const expected = sunPosition({ latitude: 40, dayOfYear: 172, solarTime: 12 });
  assert.ok(Math.abs(noon.sunElevation - expected.elevation) < 1e-9, 'wired to solar kernel');
  assert.ok(Math.abs(noon.sunElevation - 73.44) < 1.5, `known solstice noon: ${noon.sunElevation}`);
  assert.ok(Math.abs(Math.hypot(...noon.sunDirection) - 1) < 1e-9, 'unit sun direction');
  assert.ok(noon.daylight > 0.95, 'full daylight at solstice noon');
  const midnight = createSkyAtmosphere({ timeOfDay: 0, latitude: 40, dayOfYear: 172 });
  assert.ok(midnight.sunElevation < 0 && midnight.daylight === 0, 'night is night');
  const morning = setTimeOfDay(noon, 6);
  assert.equal(morning.timeOfDay, 6);
  assert.equal(morning.latitude, 40, 'location preserved across time change');
  assert.ok(morning.sunElevation > 0 && morning.sunElevation < noon.sunElevation, 'morning sun lower');
  assert.throws(() => createSkyAtmosphere({ latitude: 123 }), /latitude/);
});

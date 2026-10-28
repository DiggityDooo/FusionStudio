import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVoronoi, polygonArea, polygonCentroid, lloydRelaxation,
  shardPrism, fracturePlate, scatterSites,
} from '../src/voronoi.js';

const unit = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

test('two sites split the square along the bisector', () => {
  const cells = computeVoronoi([[0.25, 0.5], [0.75, 0.5]], unit);
  assert.equal(cells.length, 2);
  assert.ok(Math.abs(cells[0].area - 0.5) < 1e-12, `area ${cells[0].area}`);
  assert.ok(Math.abs(cells[1].area - 0.5) < 1e-12);
  // Every vertex of cell 0 lies at x <= 0.5 (the bisector plane).
  for (const [x] of cells[0].polygon) assert.ok(x <= 0.5 + 1e-9);
  for (const [x] of cells[1].polygon) assert.ok(x >= 0.5 - 1e-9);
  assert.ok(Math.abs(cells[0].centroid[0] - 0.25) < 1e-9);
});

test('random cells tile the bounds exactly and contain their sites', () => {
  const sites = scatterSites(24, unit, 7);
  const cells = computeVoronoi(sites, unit);
  const total = cells.reduce((s, c) => s + c.area, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `tiled area ${total}`);
  const pointInConvex = (poly, p) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(cross) < 1e-12) continue;
      const s = Math.sign(cross);
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  };
  for (const cell of cells) {
    assert.ok(cell.area > 0, 'every scattered site owns area');
    assert.ok(pointInConvex(cell.polygon, cell.site), 'site inside its cell');
    // Centroid is the cell's own area centroid.
    const c = polygonCentroid(cell.polygon);
    assert.ok(Math.abs(c[0] - cell.centroid[0]) < 1e-12);
  }
});

test('Lloyd relaxation moves sites to centroids and evens cell areas', () => {
  const clustered = [[0.1, 0.1], [0.12, 0.1], [0.1, 0.12], [0.9, 0.9]];
  const once = lloydRelaxation(clustered, unit, 1);
  const cellsBefore = computeVoronoi(clustered, unit);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(once[i][0] - cellsBefore[i].centroid[0]) < 1e-12, 'site moved to centroid');
    assert.ok(Math.abs(once[i][1] - cellsBefore[i].centroid[1]) < 1e-12);
  }
  const variance = (cells) => {
    const mean = cells.reduce((s, c) => s + c.area, 0) / cells.length;
    return cells.reduce((s, c) => s + (c.area - mean) ** 2, 0) / cells.length;
  };
  const relaxed = lloydRelaxation(clustered, unit, 25);
  const vBefore = variance(cellsBefore);
  const vAfter = variance(computeVoronoi(relaxed, unit));
  assert.ok(vAfter < vBefore * 0.5, `variance ${vBefore} -> ${vAfter}`);
});

test('shard prisms have exact volume and tile the plate', () => {
  const sites = scatterSites(12, { minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 }, 3);
  const shards = fracturePlate({ width: 2, height: 1, sites, depth: 0.25 });
  assert.equal(shards.length, 12);
  let volume = 0;
  for (const shard of shards) {
    volume += shard.volume;
    const { positions, indices } = shard.mesh;
    assert.ok(Math.abs(shard.volume - shard.area * 0.25) < 1e-12);
    for (const index of indices) assert.ok(index < positions.length / 3, 'indices in range');
    // Signed mesh volume via divergence theorem matches area * depth.
    let v = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
      v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    assert.ok(Math.abs(Math.abs(v) - shard.volume) < 1e-6, `mesh volume ${v} vs ${shard.volume}`);
  }
  assert.ok(Math.abs(volume - 2 * 1 * 0.25) < 1e-9, 'shards tile the plate volume');
});

test('duplicate sites degrade gracefully', () => {
  const cells = computeVoronoi([[0.5, 0.5], [0.5, 0.5], [0.2, 0.2]], unit);
  assert.equal(cells[1].area, 0);
  assert.ok(cells[0].area > 0 && cells[2].area > 0);
  const total = cells.reduce((s, c) => s + c.area, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'remaining cells still tile');
});

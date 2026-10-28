import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFeature, buildFeatureTree, createFeatureTree,
} from '../src/feature-tree.js';
import {
  estimatePrint, exportGCode, generateInfill, gyroidInfill, infillLength,
  meshManifoldReport, overhangAnalysis, polygonArea, sliceMesh,
  sliceMeshAtZ, wallThickness, weldVertices,
} from '../src/slicer.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function built(feature) {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'm', ...feature });
  return buildFeatureTree(tree).get('m');
}

test('slicing a box gives one square loop with exact area', () => {
  const box = built({ type: 'box', params: { size: [10, 10, 10] } }); // centred at origin, z in [-5, 5]
  const layer = sliceMeshAtZ(box, 0);
  assert.equal(layer.loops.length, 1);
  assert.ok(near(Math.abs(layer.area), 100, 1e-9), `area ${layer.area}`);
  assert.ok(near(layer.perimeter, 40, 1e-9));
  assert.equal(sliceMesh(box, { layerHeight: 2 }).layers.length, 5);
});

test('slicing a cylinder gives a polygonal circle of the right area', () => {
  const cyl = built({ type: 'cylinder', params: { radius: 5, height: 10, segments: 96 } });
  const layer = sliceMeshAtZ(cyl, 5);
  assert.equal(layer.loops.length, 1);
  assert.ok(Math.abs(Math.abs(layer.area) - Math.PI * 25) < 0.1, `area ${layer.area}`);
});

test('sphere layer radius follows sqrt(R^2 - z^2)', () => {
  const sphere = built({ type: 'sphere', params: { radius: 10, widthSegs: 64, heightSegs: 32 } });
  const mid = sliceMeshAtZ(sphere, 0);
  const high = sliceMeshAtZ(sphere, 6);
  assert.ok(Math.abs(Math.abs(mid.area) - Math.PI * 100) < 2, `mid ${mid.area}`);
  assert.ok(Math.abs(Math.abs(high.area) - Math.PI * 64) < 2, `high ${high.area}`);
});

test('overhang analysis: box is self-supporting, sphere is not', () => {
  const box = built({ type: 'box', params: { size: [10, 10, 10] } });
  assert.ok(near(overhangAnalysis(box).overhangArea, 0, 1e-9));
  const sphere = built({ type: 'sphere', params: { radius: 10, widthSegs: 48, heightSegs: 24 } });
  const report = overhangAnalysis(sphere, { maxOverhangDeg: 45 });
  assert.ok(report.overhangFraction > 0.05 && report.overhangFraction < 0.5, `fraction ${report.overhangFraction}`);
});

test('print estimate and G-code are consistent with the layers', () => {
  const box = built({ type: 'box', params: { size: [10, 10, 10] } });
  const sliced = sliceMesh(box, { layerHeight: 1 });
  assert.equal(sliced.layers.length, 10);
  const est = estimatePrint(sliced, { infillDensity: 1 });
  assert.ok(est.extrudedMm3 > 800 && est.extrudedMm3 <= 1000, `extruded ${est.extrudedMm3}`);
  assert.ok(est.filamentLengthMm > 300 && est.weightG > 0.9);
  const gcode = exportGCode(sliced);
  assert.equal((gcode.match(/;LAYER /g) || []).length, 10);
  assert.ok(gcode.includes('M104 S200') && gcode.trimEnd().endsWith('M84'));
  const eMoves = [...gcode.matchAll(/ E([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(eMoves.length > 10 && eMoves.every((v, i) => i === 0 || v >= eMoves[i - 1]), 'extrusion monotonic');
});

test('infill patterns fill the cross-section at the requested density', () => {
  const box = built({ type: 'box', params: { size: [10, 10, 10] } });
  const layer = sliceMeshAtZ(box, 0);
  const lines = generateInfill(layer, { pattern: 'lines', spacing: 2, angleDeg: 0 });
  // 5 scan lines across a 10 mm square, each ~10 mm long.
  assert.ok(Math.abs(infillLength(lines) - 50) < 3, `lines length ${infillLength(lines)}`);
  for (const seg of lines) {
    for (const p of [seg.from, seg.to]) assert.ok(Math.abs(p[0]) <= 5.01 && Math.abs(p[1]) <= 5.01, 'inside the square');
  }
  const grid = generateInfill(layer, { pattern: 'grid', spacing: 2, angleDeg: 0 });
  assert.ok(Math.abs(infillLength(grid) - 100) < 6, `grid length ${infillLength(grid)}`);
  const diag = generateInfill(layer, { pattern: 'lines', spacing: 2, angleDeg: 45 });
  assert.ok(infillLength(diag) > 40 && infillLength(diag) < 80, 'diagonal density comparable');
  assert.deepEqual(generateInfill({ loops: [] }, {}), []);
});

test('gyroid infill stays inside the contour and shifts with height', () => {
  const box = built({ type: 'box', params: { size: [20, 20, 20] } });
  const low = sliceMeshAtZ(box, 0);
  const high = sliceMeshAtZ(box, 2.5);
  const gLow = gyroidInfill(low, { period: 8, cell: 0.8 });
  const gHigh = gyroidInfill(high, { period: 8, cell: 0.8 });
  assert.ok(gLow.length > 40, `segments ${gLow.length}`);
  for (const seg of gLow) {
    const mx = (seg.from[0] + seg.to[0]) / 2, my = (seg.from[1] + seg.to[1]) / 2;
    assert.ok(Math.abs(mx) < 10 && Math.abs(my) < 10, 'segment inside the square');
  }
  const key = (segs) => segs.map((s) => `${s.from[0].toFixed(2)},${s.from[1].toFixed(2)}`).join('|');
  assert.notEqual(key(gLow), key(gHigh), 'pattern phase shifts with z');
  assert.ok(infillLength(gLow) > 100, `gyroid length ${infillLength(gLow)}`);
});

test('manifold report and vertex welding repair an exploded mesh', () => {
  const box = built({ type: 'box', params: { size: [10, 10, 10] } });
  // Feature-tree boxes carry per-face vertices: geometrically closed but not
  // index-welded, so the report correctly flags boundary edges until welded.
  assert.ok(!meshManifoldReport(box).watertight);
  assert.ok(meshManifoldReport(weldVertices(box, 0).mesh).watertight, 'welded box watertight');
  // Explode: duplicate every triangle's vertices (no shared indices).
  const positions = [], indices = [];
  for (let i = 0; i < box.indices.length; i++) {
    const o = box.indices[i] * 3;
    positions.push(box.positions[o], box.positions[o + 1], box.positions[o + 2]);
    indices.push(positions.length / 3 - 1);
  }
  const exploded = { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  const broken = meshManifoldReport(exploded);
  assert.ok(!broken.watertight && broken.boundaryEdges > 30, JSON.stringify(broken));
  const { mesh: repaired, mergedVertices } = weldVertices(exploded, 0);
  assert.ok(mergedVertices > 0);
  assert.ok(meshManifoldReport(repaired).watertight, 'welded mesh watertight');
  // A missing triangle opens exactly three boundary edges (on a welded mesh).
  const welded = weldVertices(box, 0).mesh;
  const holed = { positions: welded.positions, indices: welded.indices.slice(3) };
  assert.equal(meshManifoldReport(holed).boundaryEdges, 3);
});

test('wall thickness measures a plate and a hollow shell', () => {
  const plate = built({ type: 'box', params: { size: [20, 20, 2] } });
  const plateReport = wallThickness(plate);
  assert.ok(near(plateReport.min, 2, 0.1) && plateReport.samples > 0, JSON.stringify(plateReport));
  // Hollow shell: outer box + inner box with flipped winding, wall = 1.
  const tree = createFeatureTree();
  addFeature(tree, { id: 'outer', type: 'box', params: { size: [10, 10, 10] } });
  addFeature(tree, { id: 'inner', type: 'box', params: { size: [8, 8, 8] } });
  const builtMap = buildFeatureTree(tree);
  const inner = builtMap.get('inner');
  const flipped = { positions: inner.positions, indices: inner.indices.slice() };
  for (let i = 0; i < flipped.indices.length; i += 3) { const t = flipped.indices[i + 1]; flipped.indices[i + 1] = flipped.indices[i + 2]; flipped.indices[i + 2] = t; }
  const shellPositions = [...builtMap.get('outer').positions, ...flipped.positions];
  const shellIndices = [...builtMap.get('outer').indices, ...[...flipped.indices].map((v) => v + 24)];
  const shell = { positions: new Float32Array(shellPositions), indices: new Uint32Array(shellIndices) };
  const report = wallThickness(shell);
  assert.ok(near(report.min, 1, 0.35), `shell min ${report.min}`);
});

test('polygon area sign marks holes', () => {
  const outer = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const inner = [[1, 1], [1, 3], [3, 3], [3, 1]];
  assert.ok(polygonArea(outer) > 0 && polygonArea(inner) < 0);
});

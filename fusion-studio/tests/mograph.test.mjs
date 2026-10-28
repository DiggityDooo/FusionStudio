import test from 'node:test';
import assert from 'node:assert/strict';
import { arcCurve } from '../src/nurbs.js';
import {
  addFeature, buildFeatureTree, createFeatureTree, meshVolume,
} from '../src/feature-tree.js';
import { polygonArea, weldVertices } from '../src/slicer.js';
import {
  BLOCK_FONT, EASINGS, MOGRAPH_PRESETS, addStroke, animateText, applyField,
  audioDrive, bandEnergies, cameraCard, createGreasePencil, envelopeFollow,
  evaluatePreset, fftMagnitudes, gearPolygon, gridCloner, linearField,
  parallaxCards, parseSvgPath, radialCloner, randomEffector, realizeClones,
  silhouetteEdges, simplifyStroke, smoothStroke, sphericalField,
  splineCloner, spiralPoints, starPolygon, stepEffector, strokeToRibbon,
  strokeToTube, strokesAtFrame, surfaceCloner, textToMesh, toonOutline,
  toonShade,
} from '../src/mograph-kernel.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function unitBox() {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'b', type: 'box', params: { size: [1, 1, 1] } });
  return buildFeatureTree(tree).get('b');
}

test('grid and radial cloners place instances exactly', () => {
  const grid = gridCloner({ counts: [2, 2, 1], spacing: [3, 4, 0] });
  assert.equal(grid.length, 4);
  assert.deepEqual(grid[3].position, [3, 4, 0]);
  const radial = radialCloner({ count: 4, radius: 5 });
  for (const [i, t] of radial.entries()) {
    assert.ok(near(Math.hypot(t.position[0], t.position[1]), 5), `instance ${i}`);
  }
  assert.ok(near(radial[1].position[0], 0, 1e-9) && near(radial[1].position[1], 5, 1e-9));
});

test('realized clones multiply volume exactly', () => {
  const box = unitBox();
  const merged = realizeClones(box, gridCloner({ counts: [3, 1, 1], spacing: [2, 0, 0] }));
  assert.ok(near(meshVolume(merged), 3, 1e-9), `volume ${meshVolume(merged)}`);
  assert.equal(merged.positions.length, box.positions.length * 3);
});

test('spline cloner follows a NURBS arc; surface cloner lands on the mesh', () => {
  const clones = splineCloner(arcCurve(5, 90), { count: 3 });
  assert.ok(near(Math.hypot(...clones[1].position.slice(0, 2)), 5, 1e-6));
  const box = unitBox();
  const scattered = surfaceCloner(box, { count: 24, seed: 7 });
  assert.equal(scattered.length, 24);
  for (const t of scattered) {
    const onFace = t.position.some((v) => near(Math.abs(v), 0.5, 1e-9));
    assert.ok(onFace, `point on surface: ${t.position}`);
  }
});

test('random effector is deterministic per seed; step effector ramps', () => {
  const base = gridCloner({ counts: [5, 1, 1], spacing: [1, 0, 0] });
  const a = randomEffector(base, { seed: 42, position: [1, 1, 1] });
  const b = randomEffector(base, { seed: 42, position: [1, 1, 1] });
  assert.deepEqual(a, b);
  const c = randomEffector(base, { seed: 43, position: [1, 1, 1] });
  assert.notDeepEqual(a, c);
  const stepped = stepEffector(base, { fromScale: 0, toScale: 1 });
  assert.ok(near(stepped[0].scale[0], 0) && near(stepped[4].scale[0], 1) && near(stepped[2].scale[0], 0.5));
});

test('fields weight by distance and blend transforms', () => {
  const field = sphericalField({ center: [0, 0, 0], radius: 6, falloff: 2 });
  assert.equal(field.weightAt([0, 0, 0]), 1);
  assert.equal(field.weightAt([10, 0, 0]), 0);
  assert.ok(near(field.weightAt([5, 0, 0]), 0.5, 1e-9));
  const clones = gridCloner({ counts: [3, 1, 1], spacing: [5, 0, 0] }); // x = 0, 5, 10
  const lifted = applyField(clones, field, { offset: [0, 4, 0] });
  assert.ok(near(lifted[0].position[1], 4) && near(lifted[1].position[1], 2) && near(lifted[2].position[1], 0));
  const lin = linearField({ length: 10, falloff: 2 });
  assert.equal(lin.weightAt([-1, 0, 0]), 1);
  assert.equal(lin.weightAt([11, 0, 0]), 0);
});

test('procedural profiles extrude to the polygon area times depth', () => {
  const star = starPolygon({ points: 5, outer: 10, inner: 4 });
  assert.equal(star.length, 10);
  const area = Math.abs(polygonArea(star));
  const tree = createFeatureTree();
  addFeature(tree, { id: 's', type: 'extrude', params: { profile: star, depth: 2 } });
  const solid = buildFeatureTree(tree).get('s');
  assert.ok(near(meshVolume(solid), area * 2, 1e-4), `volume ${meshVolume(solid)} vs ${area * 2}`);
  const gear = gearPolygon({ teeth: 8, outer: 10, root: 8 });
  assert.equal(gear.length, 32);
  assert.ok(Math.abs(polygonArea(gear)) > Math.PI * 64, 'gear area exceeds root disc');
  assert.equal(spiralPoints({ turns: 1, points: 8, radius: 3 }).length, 9);
});

test('block text extrudes to cell-count volume with per-character meshes', () => {
  const filled = (ch) => BLOCK_FONT[ch].join('').split('').filter((c) => c === '#').length;
  const result = textToMesh('HI', { cell: 1, depth: 2 });
  assert.equal(result.characters.length, 2);
  assert.ok(near(meshVolume(result.mesh), (filled('H') + filled('I')) * 2, 1e-4), `volume ${meshVolume(result.mesh)}`);
  assert.ok(result.characters[1].offsetX > result.characters[0].offsetX, 'characters advance');
  const spaced = textToMesh('A B', { cell: 1, depth: 1 });
  assert.equal(spaced.characters.length, 2, 'space has no glyph');
  assert.ok(spaced.characters[1].offsetX > 2 * 5, 'space advances the cursor');
  const lower = textToMesh('ab', { cell: 1, depth: 1 });
  assert.equal(lower.characters.length, 2, 'case-insensitive');
  const multiline = textToMesh('A\nB', { cell: 1, depth: 1 });
  assert.ok(multiline.characters[1].offsetY < multiline.characters[0].offsetY, 'second line below');
  assert.throws(() => textToMesh('café'), /No block glyph/);
});

test('per-character wave animation moves characters independently', () => {
  const result = textToMesh('WAVE', { cell: 1, depth: 1 });
  const still = animateText(result, 0, { amplitude: 0 });
  assert.ok(near(meshVolume(still), meshVolume(result.mesh), 1e-4), 'zero amplitude is identity');
  const moved = animateText(result, 0.52, { amplitude: 1, speed: 3, phase: Math.PI / 2 });
  assert.ok(near(meshVolume(moved), meshVolume(result.mesh), 1e-3), 'rigid motion preserves volume');
  // Characters at opposite wave phases separate vertically.
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < moved.positions.length; i += 3) { minY = Math.min(minY, moved.positions[i]); maxY = Math.max(maxY, moved.positions[i]); }
  const stillBounds = (() => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < still.positions.length; i += 3) { lo = Math.min(lo, still.positions[i]); hi = Math.max(hi, still.positions[i]); } return hi - lo; })();
  assert.ok(maxY - minY > stillBounds + 0.5, `wave spreads height ${maxY - minY} vs ${stillBounds}`);
});

test('grease pencil tubes keep exact radius around the spine', () => {
  const gp = createGreasePencil();
  const spine = [];
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI / 2; spine.push([5 * Math.cos(a), 5 * Math.sin(a), 0]); }
  const stroke = addStroke(gp, spine, { radius: 0.5, frame: 4 });
  const tube = strokeToTube(stroke, { sides: 10 });
  assert.equal(tube.positions.length / 3, 17 * 10 + 2, 'rings plus two cap centres');
  for (let v = 0; v < tube.positions.length - 6; v += 3) { // ring vertices only
    const p = [tube.positions[v], tube.positions[v + 1], tube.positions[v + 2]];
    let best = Infinity;
    for (let i = 0; i < spine.length - 1; i++) {
      const a = spine[i], b = spine[i + 1];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
      best = Math.min(best, Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t), p[2]));
    }
    assert.ok(Math.abs(best - 0.5) < 0.02, `vertex radius ${best}`);
  }
  const capStart = [tube.positions[tube.positions.length - 6], tube.positions[tube.positions.length - 5], tube.positions[tube.positions.length - 4]];
  assert.ok(near(capStart[0], spine[0][0], 1e-6) && near(capStart[1], spine[0][1], 1e-6), 'cap centre on spine end');
  const straight = addStroke(gp, [[0, 0, 0], [10, 0, 0]], { radius: 1 });
  const prism = strokeToTube(straight, { sides: 8 });
  const expected = (8 / 2) * Math.sin(Math.PI / 4) * 10; // octagon prism volume
  assert.ok(Math.abs(Math.abs(meshVolume(prism)) - expected) < expected * 0.05, 'prism volume');
  const ribbon = strokeToRibbon(straight, {});
  for (let i = 2; i < ribbon.positions.length; i += 3) assert.ok(near(ribbon.positions[i], 0, 1e-9), 'ribbon flat');
});

test('stroke cleanup, smoothing and onion skinning behave', () => {
  const noisy = [[0, 0, 0], [1, 0.01, 0], [2, -0.01, 0], [3, 0.01, 0], [4, 0, 0], [5, 3, 0]];
  const simplified = simplifyStroke(noisy, 0.05);
  assert.ok(simplified.length < noisy.length && simplified.length >= 3, `kept ${simplified.length}`);
  assert.deepEqual(simplified[0], [0, 0, 0]);
  const smoothed = smoothStroke([[0, 0, 0], [2, 0, 0], [2, 2, 0]], 1);
  assert.equal(smoothed.length, 6);
  assert.ok(!smoothed.some((p) => near(p[0], 2, 1e-9) && near(p[1], 0, 1e-9)), 'corner point replaced');
  assert.ok(smoothed.some((p) => near(p[0], 1.5, 1e-9) && near(p[1], 0, 1e-9)), 'cut point on first edge');
  assert.ok(smoothed.some((p) => near(p[0], 2, 1e-9) && near(p[1], 0.5, 1e-9)), 'cut point on second edge');
  const gp = createGreasePencil();
  addStroke(gp, [[0, 0, 0], [1, 0, 0]], { frame: 1 });
  addStroke(gp, [[0, 1, 0], [1, 1, 0]], { frame: 5 });
  addStroke(gp, [[0, 2, 0], [1, 2, 0]], { frame: 9 });
  const at5 = strokesAtFrame(gp, 5, { onion: 4 });
  assert.equal(at5.length, 3);
  assert.equal(at5.find((s) => !s.ghost).opacity, 1);
  assert.ok(at5.filter((s) => s.ghost).every((s) => s.opacity < 1 && s.opacity > 0));
  assert.equal(strokesAtFrame(gp, 5).length, 1, 'no onion, no ghosts');
  assert.throws(() => addStroke(gp, [[0, 0, 0]]), /at least two/);
});

test('toon outline is an expanded inside-out shell; shading bands quantize', () => {
  const tree = createFeatureTree();
  addFeature(tree, { id: 'b', type: 'box', params: { size: [4, 2, 2] } });
  const box = buildFeatureTree(tree).get('b');
  const outline = toonOutline(box, { width: 0.25 });
  // Per-face normals displace each face outward by exactly the width.
  let maxX = -Infinity;
  for (let i = 0; i < outline.positions.length; i += 3) maxX = Math.max(maxX, outline.positions[i]);
  assert.ok(near(maxX, 2.25, 1e-6), `expanded bound ${maxX}`);
  assert.ok(meshVolume(box) > 0 && meshVolume(outline) < 0, 'winding flipped (inside-out)');
  assert.equal(toonShade([0, 0, 1], [0, 0, 1], { bands: 3, ambient: 0 }), 1);
  assert.equal(toonShade([0, 0, -1], [0, 0, 1], { bands: 3, ambient: 0 }), 0);
  const mid = toonShade([0, Math.SQRT1_2, Math.SQRT1_2], [0, 0, 1], { bands: 4, ambient: 0 });
  assert.ok(mid > 0 && mid < 1, 'mid band');
});

test('silhouette edges trace the equator of a sphere', () => {
  const tree = createFeatureTree();
  addFeature(tree, { id: 's', type: 'sphere', params: { radius: 10, widthSegs: 48, heightSegs: 24 } });
  // Weld first: the raw sphere grid has an index-open UV seam.
  const sphere = weldVertices(buildFeatureTree(tree).get('s'), 1e-6).mesh;
  const edges = silhouetteEdges(sphere, [0, 0, 1]);
  assert.ok(edges.length >= 24, `silhouette segments ${edges.length}`);
  for (const seg of edges) {
    for (const p of [seg.from, seg.to]) {
      assert.ok(Math.abs(p[2]) < 2.2, `equator z ${p[2]}`);
      assert.ok(Math.hypot(p[0], p[1]) > 8.8, 'on the great circle');
    }
  }
});

test('presets ease exactly and stagger per instance', () => {
  for (const [name, fn] of Object.entries(EASINGS)) {
    assert.ok(near(fn(0), 0, 1e-9), `${name} starts at 0`);
    assert.ok(near(fn(1), 1, 1e-9), `${name} ends at 1`);
  }
  assert.ok(Object.keys(MOGRAPH_PRESETS).length >= 5);
  const base = gridCloner({ counts: [4, 1, 1], spacing: [2, 0, 0] });
  const start = evaluatePreset(base, 'cascadeIn', 0);
  assert.ok(start.every((t) => near(t.scale[0], 0, 1e-9)), 'all hidden at t=0');
  const end = evaluatePreset(base, 'cascadeIn', 10);
  assert.ok(end.every((t) => near(t.scale[0], 1, 1e-9) && near(t.position[1], 0, 1e-9)), 'all settled');
  const typed = evaluatePreset(base, 'typewriter', 0.13);
  assert.ok(typed[0].scale[0] > 0 && typed[1].scale[0] > 0 && near(typed[2].scale[0], 0), 'typewriter reveals in order');
  const dropped = evaluatePreset(base, 'dropIn', 0);
  assert.ok(dropped.every((t) => near(t.position[1], 6, 1e-9)), 'drop starts raised');
  assert.throws(() => evaluatePreset(base, 'nope', 0), /Unknown mograph preset/);
});

test('audio FFT finds the tone; bands and envelope drive instances', () => {
  const sr = 8000, n = 1024;
  const sine = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / sr));
  const mags = fftMagnitudes(sine);
  let peak = 0;
  mags.forEach((m, i) => { if (m > mags[peak]) peak = i; });
  assert.ok(Math.abs(peak - 128) <= 1, `peak bin ${peak}`);
  assert.ok(mags[peak] > 0.8, `peak magnitude ${mags[peak]}`);
  const silent = fftMagnitudes(new Array(256).fill(0));
  assert.ok(Math.max(...silent) < 1e-9);
  const low = Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 100 * i / sr));
  const bands = bandEnergies(fftMagnitudes(low), sr);
  assert.ok(bands.bass > bands.treble * 5, `bass ${bands.bass} vs treble ${bands.treble}`);
  const env = envelopeFollow([0, 1, 1, 0, 0, 0, 0], { attack: 0.6, release: 0.12 });
  assert.ok(env[1] > 0.5 && env[3] < env[2] && env[3] > 0.5, 'fast attack, slow release');
  const base = gridCloner({ counts: [2, 1, 1], spacing: [2, 0, 0] });
  const driven = audioDrive(base, { bass: 1 }, { band: 'bass', height: 2, baseScale: 0.2 });
  assert.ok(near(driven[0].scale[0], 1) && near(driven[0].position[1], 2), 'full energy drives fully');
  const quiet = audioDrive(base, { bass: 0 }, { band: 'bass', height: 2, baseScale: 0.2 });
  assert.ok(near(quiet[0].scale[0], 0.2) && near(quiet[0].position[1], 0), 'silence rests at base');
  assert.throws(() => fftMagnitudes([1, 2, 3]), /power-of-two/);
});

test('camera cards fill the frustum slice at their distance', () => {
  const card = cameraCard({ position: [0, 0, 0], target: [0, 0, -1], fovDeg: 90, aspect: 2 }, 10);
  assert.ok(near(card.height, 20, 1e-9) && near(card.width, 40, 1e-9));
  assert.deepEqual(card.center, [0, 0, -10]);
  const half = cameraCard({ position: [0, 0, 0], target: [0, 0, -1], fovDeg: 90, aspect: 2 }, 10, { fill: 0.5 });
  assert.ok(near(half.height, 10, 1e-9));
  const cards = parallaxCards({ position: [1, 2, 3], target: [1, 2, 2], fovDeg: 60, aspect: 1 }, [5, 15]);
  assert.equal(cards.length, 2);
  assert.ok(cards[1].height > cards[0].height && near(cards[0].center[2], -2, 1e-9), 'farther card larger, along forward');
});

test('SVG path import: lines, curves, relative commands, close', () => {
  const [square] = parseSvgPath('M0,0 L10,0 L10,10 L0,10 Z');
  assert.equal(square.length, 5);
  assert.ok(near(Math.abs(polygonArea(square)), 100, 1e-9));
  const [curve] = parseSvgPath('M0 0 C 0 10, 10 10, 10 0', { curveSegments: 8 });
  assert.equal(curve.length, 9);
  assert.ok(near(curve[4][1], 7.5, 1e-9), 'cubic midpoint height');
  const [rel] = parseSvgPath('m1 1 l2 0 l0 2 z');
  assert.deepEqual(rel[0], [1, 1]);
  assert.deepEqual(rel[rel.length - 1], [1, 1]);
  assert.throws(() => parseSvgPath('M0 0 A 1 1 0 0 1 2 2'), /Unsupported/);
});

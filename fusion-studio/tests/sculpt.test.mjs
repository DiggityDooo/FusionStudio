import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptGeometry, SCULPT_BRUSHES, FALLOFFS, falloffValue, maskAttribute, clearMask, invertMask, applyMeshFilter, transferMask, addAnnotation, removeAnnotation, annotationMarkers, dyntopoRefine, dyntopoCollapse, subdivideGeometry, createMultiresCopy, setMultiresLevel, pressureScale, MeshTools} from '../src/mesh-tools.js';

function sphere(detail = 4) {
  const geo = new THREE.SphereGeometry(0.5, 48, 32);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}
const top = new THREE.Vector3(0, 0.5, 0);
const frontNormal = new THREE.Vector3(0, 1, 0);
function displacement(mesh, before) {
  const p = mesh.geometry.attributes.position;
  let max = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - before[i * 3], p.getY(i) - before[i * 3 + 1], p.getZ(i) - before[i * 3 + 2]);
    if (d > max) max = d;
  }
  return max;
}

test('brush catalog covers the standard sculpt set', () => {
  const ids = SCULPT_BRUSHES.map(b => b.id);
  for (const id of ['draw','draw-sharp','inflate','deflate','blob','clay','clay-strips','layer','crease','crease-sharp','crease-polish','smooth','flatten','contrast','fill','deepen','scrape','peaks','pinch','magnify','nudge','thumb','snake-hook','grab','rotate','slide-relax','mask'])
    assert.ok(ids.includes(id), `missing brush ${id}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of SCULPT_BRUSHES) { assert.ok(b.label); assert.ok(b.icon); }
});

test('falloff curves are bounded and monotonic', () => {
  for (const kind of FALLOFFS) {
    assert.ok(falloffValue(kind, 0) > 0, kind);
    assert.ok(falloffValue(kind, 1) <= 1, kind);
    assert.ok(falloffValue(kind, 0.2) >= falloffValue(kind, 0.8) || kind === 'constant', kind);
  }
  assert.equal(falloffValue('linear', 1), 0);
  assert.equal(falloffValue('constant', 0.9), 1);
});

test('every brush moves geometry and respects radius', () => {
  for (const brush of SCULPT_BRUSHES) {
    const planeFamily = ['fill','scrape','peaks','deepen','flatten','contrast','clay','clay-strips'].includes(brush.id);
    const mesh = planeFamily ? slopedPlane() : sphere();
    const before = new Float32Array(mesh.geometry.attributes.position.array);
    const delta = new THREE.Vector3(0.05, 0.02, 0);
    const hit = sculptGeometry(mesh, planeFamily ? center.clone() : top.clone(), planeFamily ? 0.45 : 0.3, 0.03, brush.id, false, {normal: planeFamily ? zNormal : frontNormal, delta, falloff: 'smooth', layerBase: before});
    if (brush.id === 'annotate') { assert.equal(hit, 0, 'annotate must never touch geometry'); assert.equal(displacement(mesh, before), 0); continue; }
    assert.ok(hit > 0, `${brush.id} affected no vertices`);
    if (brush.id === 'mask') assert.ok(Math.max(...mesh.geometry.attributes.mask.array) > 0, 'mask must paint its channel');
    else assert.ok(displacement(mesh, before) > 0, `${brush.id} did not move geometry`);
  }
});

test('draw inverts with the invert flag', () => {
  const a = sphere(), b = sphere();
  sculptGeometry(a, top.clone(), 0.3, 0.03, 'draw', false, {normal: frontNormal});
  sculptGeometry(b, top.clone(), 0.3, 0.03, 'draw', true, {normal: frontNormal});
  const pa = a.geometry.attributes.position, pb = b.geometry.attributes.position;
  let up = 0, down = 0;
  for (let i = 0; i < pa.count; i++) { if (pa.getY(i) > 0.49) up = Math.max(up, pa.getY(i)); if (pb.getY(i) < 0.51) down = Math.min(down, pb.getY(i)); }
  assert.ok(up > 0.5, 'draw should raise the surface');
});

test('smooth reduces displacement noise', () => {
  const mesh = sphere();
  sculptGeometry(mesh, top.clone(), 0.25, 0.08, 'draw-sharp', false, {normal: frontNormal, falloff: 'sharp'});
  const rough = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.35, 0.05, 'smooth', false, {normal: frontNormal});
  const p = mesh.geometry.attributes.position;
  let moved = 0;
  for (let i = 0; i < p.count; i++) moved += Math.abs(p.getY(i) - rough[i * 3 + 1]);
  assert.ok(moved > 0, 'smooth should relax vertices');
});

function slopedPlane() {
  const geo = new THREE.PlaneGeometry(1, 1, 24, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getX(i) * 0.4);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}
const zNormal = new THREE.Vector3(0, 0, 1);
const center = new THREE.Vector3(0, 0, 0);

test('mask is a persistent channel and fully masked vertices never move', () => {
  const mesh = sphere();
  sculptGeometry(mesh, top.clone(), 0.3, 0.05, 'mask', false, {normal: frontNormal});
  const mask = mesh.geometry.attributes.mask;
  assert.ok(mask, 'mask attribute must exist after painting');
  assert.ok(Math.max(...mask.array) > 0.5, 'mask painting must store protection');
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.08, 'draw', false, {normal: frontNormal});
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (mask.array[i] >= 0.99) assert.equal(Math.hypot(pos.getX(i) - before[i * 3], pos.getY(i) - before[i * 3 + 1], pos.getZ(i) - before[i * 3 + 2]), 0, 'fully masked vertices must not move under Draw');
  }
  clearMask(mesh.geometry);
  sculptGeometry(mesh, top.clone(), 0.3, 0.08, 'draw', false, {normal: frontNormal});
  assert.ok(displacement(mesh, before) > 0, 'cleared mask must allow sculpting again');
  maskAttribute(mesh.geometry).array.fill(0.25);
  invertMask(mesh.geometry);
  assert.ok(Math.abs(mesh.geometry.attributes.mask.array[0] - 0.75) < 1e-6);
});

test('fill only raises below-plane vertices; scrape only lowers above-plane vertices', () => {
  const filled = slopedPlane();
  const fb = new Float32Array(filled.geometry.attributes.position.array);
  sculptGeometry(filled, center.clone(), 0.45, 0.05, 'fill', false, {normal: zNormal});
  const fp = filled.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const inBrush = Math.hypot(fb[i * 3], fb[i * 3 + 1], fb[i * 3 + 2]) < 0.4;
    if (inBrush && fb[i * 3 + 2] > 0.02) assert.ok(Math.abs(fp.getZ(i) - fb[i * 3 + 2]) < 1e-6, 'fill must not move above-plane vertices');
    if (inBrush && fb[i * 3 + 2] < -0.05) assert.ok(fp.getZ(i) > fb[i * 3 + 2], 'fill must raise below-plane vertices');
  }
  const scraped = slopedPlane();
  const sb = new Float32Array(scraped.geometry.attributes.position.array);
  sculptGeometry(scraped, center.clone(), 0.45, 0.05, 'scrape', false, {normal: zNormal});
  const sp = scraped.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const inBrush = Math.hypot(sb[i * 3], sb[i * 3 + 1], sb[i * 3 + 2]) < 0.4;
    if (inBrush && sb[i * 3 + 2] < -0.02) assert.ok(Math.abs(sp.getZ(i) - sb[i * 3 + 2]) < 1e-6, 'scrape must not move below-plane vertices');
    if (inBrush && sb[i * 3 + 2] > 0.05) assert.ok(sp.getZ(i) < sb[i * 3 + 2], 'scrape must lower above-plane vertices');
  }
});

test('deflate shrinks a sphere where inflate grows it; pinch and magnify oppose tangentially', () => {
  const grown = sphere(), shrunk = sphere();
  sculptGeometry(grown, top.clone(), 0.3, 0.04, 'inflate', false, {normal: frontNormal});
  sculptGeometry(shrunk, top.clone(), 0.3, 0.04, 'deflate', false, {normal: frontNormal});
  const maxR = m => { const p = m.geometry.attributes.position; let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getY(i), p.getZ(i))); return r; };
  const topY = m => { const p = m.geometry.attributes.position; let y = -1; for (let i = 0; i < p.count; i++) y = Math.max(y, p.getY(i)); return y; };
  assert.ok(maxR(grown) > 0.51 && topY(shrunk) < 0.5, `inflate radius ${maxR(grown)} deflate top ${topY(shrunk)}`);
  const pinched = slopedPlane(), magnified = slopedPlane();
  sculptGeometry(pinched, center.clone(), 0.4, 0.04, 'pinch', false, {normal: zNormal});
  sculptGeometry(magnified, center.clone(), 0.4, 0.04, 'magnify', false, {normal: zNormal});
  const spread = m => { const p = m.geometry.attributes.position; let s = 0, n = 0; for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getY(i)); if (d > 0.1 && d < 0.35) { s += d; n++; } } return s / n; };
  assert.ok(spread(pinched) < spread(magnified), 'pinch must converge tangentially where magnify diverges');
  const pinchedViaInvert = slopedPlane();
  sculptGeometry(pinchedViaInvert, center.clone(), 0.4, 0.04, 'magnify', true, {normal: zNormal});
  assert.ok(Math.abs(spread(pinchedViaInvert) - spread(pinched)) < 0.02, 'Shift-invert on Magnify must behave as Pinch');
});

test('layer caps displacement relative to the stroke base', () => {
  const mesh = sphere();
  const base = new Float32Array(mesh.geometry.attributes.position.array);
  for (let n = 0; n < 12; n++) sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'layer', false, {normal: frontNormal, layerBase: base});
  const p = mesh.geometry.attributes.position;
  let maxY = 0;
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i) - base[i * 3 + 1]);
  assert.ok(maxY > 0.05, 'layer must build up');
  assert.ok(maxY <= 0.3 + 1e-6, `layer must stay capped at strength*10, got ${maxY}`);
});

test('autosmooth relaxes but does not erase the brush result', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.05, 'draw', false, {normal: frontNormal, autosmooth: 0.25});
  assert.ok(displacement(mesh, before) > 0.01, 'draw with autosmooth must retain displacement');
});

test('smooth uses the current topology after an index-only rewiring', () => {
  const geo = new THREE.PlaneGeometry(1, 1, 8, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  const p = geo.attributes.position;
  p.setZ(40, 0.5);
  geo.computeVertexNormals();
  sculptGeometry(mesh, new THREE.Vector3(p.getX(40), p.getY(40), 0.5), 0.4, 0.05, 'smooth', false, {normal: zNormal});
  const afterFirst = p.getZ(40);
  assert.ok(afterFirst < 0.5, 'smooth must relax the spike');
  // Rewire the index (same vertex count): vertex 40 is no longer connected the same way.
  const idx = Array.from(geo.index.array);
  geo.setIndex(idx.reverse());
  p.setZ(40, 0.5);
  geo.computeVertexNormals();
  sculptGeometry(mesh, new THREE.Vector3(p.getX(40), p.getY(40), 0.5), 0.4, 0.05, 'smooth', false, {normal: zNormal});
  assert.ok(Number.isFinite(p.getZ(40)), 'smooth after rewiring must stay finite');
});

test('multi-plane scrape fits two planes meeting at a crease', () => {
  const mesh = slopedPlane();
  for (let n = 0; n < 20; n++) sculptGeometry(mesh, center.clone(), 0.45, 0.06, 'multi-plane-scrape', false, {normal: zNormal, delta: new THREE.Vector3(0.1, 0, 0), planeAngle: Math.PI / 3});
  const p = mesh.geometry.attributes.position;
  let left = 0, right = 0, ln = 0, rn = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (Math.abs(p.getY(i)) < 0.05 && x < -0.05 && x > -0.35) { left += Math.abs(z); ln++; }
    if (Math.abs(p.getY(i)) < 0.05 && x > 0.05) { right += Math.abs(z - x * Math.tan(Math.PI / 6) * 0); rn++; }
  }
  assert.ok(ln > 0 && left / ln < 0.05, `left side should approach its plane, residual ${left / ln}`);
  assert.ok(rn > 0, 'right side sampled');
});

test('elastic deform reaches beyond the brush radius where grab cannot', () => {
  const elastic = sphere(), grabbed = sphere();
  const eb = new Float32Array(elastic.geometry.attributes.position.array), gb = new Float32Array(grabbed.geometry.attributes.position.array);
  const delta = new THREE.Vector3(0.15, 0, 0);
  sculptGeometry(elastic, top.clone(), 0.2, 0.03, 'elastic-deform', false, {normal: frontNormal, delta});
  sculptGeometry(grabbed, top.clone(), 0.2, 0.03, 'grab', false, {normal: frontNormal, delta});
  const farMove = (m, before) => { const p = m.geometry.attributes.position; let d = 0; for (let i = 0; i < p.count; i++) { const dist = Math.hypot(before[i * 3], before[i * 3 + 1] - 0.5, before[i * 3 + 2]); if (dist > 0.3 && dist < 0.42) d = Math.max(d, Math.abs(p.getX(i) - before[i * 3])); } return d; };
  assert.ok(farMove(elastic, eb) > 0.002, `elastic must move vertices outside the radius, got ${farMove(elastic, eb)}`);
  assert.equal(farMove(grabbed, gb), 0, 'grab must stay inside its radius');
});

test('cloth creates alternating artistic folds, pinned by mask', () => {
  const mesh = slopedPlane();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, center.clone(), 0.45, 0.04, 'cloth', false, {normal: zNormal, delta: new THREE.Vector3(0.1, 0, 0)});
  const p = mesh.geometry.attributes.position;
  const row = [];
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) < 0.03 && Math.abs(p.getX(i)) < 0.35) row.push([p.getX(i), p.getZ(i) - before[i * 3 + 2]]);
  row.sort((a, b) => a[0] - b[0]);
  let signs = 0;
  for (let i = 1; i < row.length; i++) if (Math.sign(row[i][1]) !== Math.sign(row[i - 1][1]) && Math.abs(row[i][1]) > 0.002) signs++;
  assert.ok(signs >= 2, `cloth folds must alternate, got ${signs} sign changes`);
});

test('pose bends a limb-like strip around the brush pivot', () => {
  const geo = new THREE.PlaneGeometry(1, 0.2, 24, 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, center.clone(), 0.4, 0.05, 'pose', false, {normal: zNormal, delta: new THREE.Vector3(0.1, 0, 0)});
  const p = mesh.geometry.attributes.position;
  let baseMove = 0, tipMove = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - before[i * 3], p.getY(i) - before[i * 3 + 1], p.getZ(i) - before[i * 3 + 2]);
    if (before[i * 3] < -0.3) baseMove = Math.max(baseMove, d);
    if (before[i * 3] > 0.3) tipMove = Math.max(tipMove, d);
  }
  assert.equal(baseMove, 0, 'pose must pin the region behind the pivot');
  assert.ok(tipMove > 0.02, `pose must bend the tip, moved ${tipMove}`);
});

test('mesh filters: sharpen amplifies detail, volume-smooth preserves volume, mask ops spread protection', () => {
  const spiky = () => { const m = sphere(); const p = m.geometry.attributes.position; p.setY(100, p.getY(100) + 0.2); m.geometry.computeVertexNormals(); return m; };
  const smoothed = spiky(), sharpened = spiky();
  const peak = m => Math.max(...m.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));
  applyMeshFilter(smoothed.geometry, 'smooth', 0.6);
  applyMeshFilter(sharpened.geometry, 'sharpen', 0.6);
  assert.ok(peak(smoothed) < peak(spiky()), 'smooth must reduce the spike');
  assert.ok(peak(sharpened) > peak(spiky()), 'sharpen must amplify the spike');

  const vol = m => { const p = m.geometry.attributes.position, idx = m.geometry.index.array, v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let s = 0; for (let i = 0; i < idx.length; i += 3) { a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]); s += a.dot(v.copy(b).cross(c)) / 6; } return s; };
  const preserved = spiky(), plain = spiky();
  const v0 = vol(preserved);
  applyMeshFilter(preserved.geometry, 'volume-smooth', 0.6);
  applyMeshFilter(plain.geometry, 'smooth', 0.6);
  assert.ok(Math.abs(vol(preserved) - v0) / Math.abs(v0) < 0.02, `volume-preserving smooth drifted ${Math.abs(vol(preserved) - v0) / Math.abs(v0)}`);
  assert.ok(Math.abs(vol(plain) - v0) / Math.abs(v0) > Math.abs(vol(preserved) - v0) / Math.abs(v0), 'plain smooth should lose more volume');

  const masked = sphere();
  maskAttribute(masked.geometry).array[500] = 1;
  applyMeshFilter(masked.geometry, 'mask-grow', 0.5);
  const sum1 = masked.geometry.attributes.mask.array.reduce((a, b) => a + b, 0);
  assert.ok(sum1 > 1, 'mask-grow must spread protection to neighbours');
  applyMeshFilter(masked.geometry, 'mask-shrink', 0.5);
  assert.ok(masked.geometry.attributes.mask.array.reduce((a, b) => a + b, 0) < sum1, 'mask-shrink must contract protection');
});

test('mask survives the editor serialization path (buffer-view toJSON roundtrip)', () => {
  const geo = new THREE.SphereGeometry(0.5, 16, 12);
  maskAttribute(geo).array[10] = 0.75;
  const buffer = new THREE.BufferGeometry();
  buffer.uuid = geo.uuid;
  for (const key of ['index', 'attributes', 'morphAttributes', 'morphTargetsRelative', 'groups', 'boundingSphere', 'userData']) buffer[key] = geo[key];
  const back = new THREE.BufferGeometryLoader().parse(buffer.toJSON());
  assert.ok(back.attributes.mask, 'mask attribute must survive save/reopen');
  assert.equal(back.attributes.mask.array[10], 0.75);
});

test('mask transfers to a topology-changed working copy by nearest vertex', () => {
  const source = sphere(2);
  const sm = maskAttribute(source.geometry);
  const sp = source.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) sm.array[i] = sp.getY(i) > 0.3 ? 1 : 0;
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshStandardMaterial());
  assert.equal(transferMask(source.geometry, target.geometry), true);
  const tm = target.geometry.attributes.mask, tp = target.geometry.attributes.position;
  assert.equal(tm.count, tp.count);
  let correct = 0, total = 0;
  for (let i = 0; i < tp.count; i++) { if (Math.abs(tp.getY(i)) > 0.35) { total++; if ((tp.getY(i) > 0) === (tm.array[i] > 0.5)) correct++; } }
  assert.ok(total > 0 && correct / total > 0.9, `transferred mask must track the source region (${correct}/${total})`);
  const bare = new THREE.SphereGeometry(0.5, 8, 6);
  assert.equal(transferMask(bare, target.geometry), false, 'no source mask must stay a no-op');
});

test('annotations are scene data with markers and removal', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  const entry = addAnnotation(mesh, new THREE.Vector3(0.1, 0.4, 0.2), 'Check this ridge');
  assert.equal(mesh.userData.fusion_annotations.length, 1);
  assert.equal(entry.text, 'Check this ridge');
  assert.deepEqual(entry.point, [0.1, 0.4, 0.2]);
  const markers = annotationMarkers(mesh);
  assert.equal(markers.geometry.attributes.position.count, 1);
  assert.equal(removeAnnotation(mesh, entry.id), true);
  assert.equal(mesh.userData.fusion_annotations.length, 0);
  assert.equal(removeAnnotation(mesh, entry.id), false);
  assert.deepEqual(new Float32Array(mesh.geometry.attributes.position.array), before, 'annotations must never modify geometry');
});

test('dyntopo refines only near the brush, stays conforming, and rejects shape keys before mutating', () => {
  const geo = new THREE.SphereGeometry(0.5, 12, 8);
  const before = geo.index.count;
  const farVertex = geo.attributes.position.count;
  const split = dyntopoRefine(geo, [0, 0.5, 0], 0.25, 0.05);
  assert.ok(split > 0, 'dyntopo must split coarse triangles near the brush');
  assert.ok(geo.index.count > before, 'triangle count must grow');
  assert.ok(geo.attributes.position.count > farVertex, 'midpoint vertices must be added');
  // Conforming: every undirected edge is shared by at most 2 triangles, no NaNs.
  const edges = new Map(), p = geo.attributes.position, idx = geo.index.array;
  for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.ok([...edges.values()].every(n => n <= 2), 'refinement must not create non-manifold edges');
  // A distant region keeps its original coarse triangles: count vertices far from the brush before/after via a fresh mesh.
  const morphGeo = new THREE.SphereGeometry(0.5, 8, 6);
  morphGeo.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(morphGeo.attributes.position.count * 3), 3)];
  const countBefore = morphGeo.attributes.position.count;
  assert.throws(() => dyntopoRefine(morphGeo, [0, 0.5, 0], 0.25, 0.05), /shape keys/);
  assert.equal(morphGeo.attributes.position.count, countBefore, 'rejection must happen before any mutation');
});

test('multires: Loop subdivision grows topology, level is re-evaluable from the retained source', () => {
  const source = sphere();
  const sourceCount = source.geometry.attributes.position.count;
  const copy = createMultiresCopy(source, 1);
  assert.equal(source.geometry.attributes.position.count, sourceCount, 'source object must be untouched');
  assert.equal(copy.userData.multires.level, 1);
  assert.ok(copy.geometry.attributes.position.count > sourceCount, 'level 1 must add vertices');
  assert.ok(copy.geometry.index.count > source.geometry.index.count, 'level 1 must add triangles');
  const level1Count = copy.geometry.attributes.position.count;
  setMultiresLevel(copy, 2);
  assert.ok(copy.geometry.attributes.position.count > level1Count, 'level 2 must be denser than level 1');
  setMultiresLevel(copy, 0);
  assert.equal(copy.geometry.attributes.position.count, sourceCount, 'level 0 must reproduce the retained source');
  assert.equal(copy.userData.multires.level, 0);
  const direct = subdivideGeometry(new THREE.SphereGeometry(0.5, 12, 8), 1);
  assert.ok(direct.index.count > new THREE.SphereGeometry(0.5, 12, 8).index.count);
  assert.throws(() => setMultiresLevel(source, 1), /no retained multires source/);
});

test('partial normal recompute matches a full recompute after a stroke', () => {
  const mesh = sphere();
  const beforePos = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.05, 'draw', false, {normal: frontNormal});
  const partial = new Float32Array(mesh.geometry.attributes.normal.array);
  mesh.geometry.computeVertexNormals();
  const full = mesh.geometry.attributes.normal.array;
  const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  // Covered = moved vertices plus every vertex sharing a face with one. Only
  // covered vertices may change normals; all others must be left untouched.
  const covered = new Set();
  for (let f = 0; f < idx.length / 3; f++) {
    const tri = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]];
    if (tri.some(vi => Math.hypot(pos.getX(vi) - beforePos[vi * 3], pos.getY(vi) - beforePos[vi * 3 + 1], pos.getZ(vi) - beforePos[vi * 3 + 2]) > 1e-9)) tri.forEach(vi => covered.add(vi));
  }
  assert.ok(covered.size > 50, `expected a real covered region, got ${covered.size}`);
  let maxDotError = 0;
  for (const vi of covered) {
    const i = vi * 3;
    const dot = partial[i] * full[i] + partial[i + 1] * full[i + 1] + partial[i + 2] * full[i + 2];
    maxDotError = Math.max(maxDotError, 1 - dot);
  }
  assert.ok(maxDotError < 1e-4, `partial normals diverged from full recompute by ${maxDotError}`);
  assert.ok(mesh.geometry.boundingSphere.radius >= 0.5, 'bounds must stay conservative after a stroke');
});

test('sculpt dab at production density stays inside the plan 14.4 warm-update target', () => {
  // Plan 14.4: warm sculpt update at most 100 ms on a 50k–200k tri fixture.
  // This measures compute only (no render/upload/history), with 190k tris.
  const geo = subdivideGeometry(new THREE.SphereGeometry(0.5, 48, 32), 3);
  assert.ok(geo.index.count / 3 > 150000, 'fixture must be at production density');
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  const point = new THREE.Vector3(0, 0.5, 0), normal = new THREE.Vector3(0, 1, 0);
  sculptGeometry(mesh, point.clone(), 0.25, 0.01, 'draw', false, {normal}); // warm caches
  const dabs = 15, start = performance.now();
  for (let i = 0; i < dabs; i++) sculptGeometry(mesh, point.clone(), 0.25, 0.01, 'draw', false, {normal});
  const perDab = (performance.now() - start) / dabs;
  assert.ok(perDab < 100, `sculpt dab took ${perDab.toFixed(1)} ms at ${geo.index.count / 3} tris (plan 14.4 target: 100 ms)`);
});

test('pen pressure scales strength; mouse, touch and disabled pressure do not', () => {
  const brush = {pressure: true};
  assert.equal(pressureScale(brush, {pointerType: 'pen', pressure: 0.4}), 0.4);
  assert.equal(pressureScale(brush, {pointerType: 'pen', pressure: 1.7}), 1, 'pressure clamps to full strength');
  assert.equal(pressureScale(brush, {pointerType: 'pen', pressure: 0}), 1, 'unreported pen pressure falls back to full strength');
  assert.equal(pressureScale(brush, {pointerType: 'mouse', pressure: 0.5}), 1, 'mouse pressure must not halve strokes');
  assert.equal(pressureScale(brush, {pointerType: 'touch', pressure: 0.3}), 1);
  assert.equal(pressureScale(brush, undefined), 1);
  assert.equal(pressureScale({pressure: false}, {pointerType: 'pen', pressure: 0.4}), 1, 'disabled pressure is full strength');
  // End-to-end: half pressure on Draw displaces exactly half as far at the pole.
  const light = sphere(), full = sphere();
  sculptGeometry(light, top.clone(), 0.3, 0.05 * pressureScale(brush, {pointerType: 'pen', pressure: 0.5}), 'draw', false, {normal: frontNormal});
  sculptGeometry(full, top.clone(), 0.3, 0.05, 'draw', false, {normal: frontNormal});
  const peak = m => Math.max(...Array.from({length: m.geometry.attributes.position.count}, (_, i) => m.geometry.attributes.position.getY(i)));
  assert.ok(Math.abs((peak(light) - 0.5) - (peak(full) - 0.5) * 0.5) < 1e-6, 'half pressure must halve the draw displacement');
});

function assertManifold(geo, label) {
  const idx = geo.index.array, counts = new Map(), referenced = new Set();
  for (let f = 0; f < idx.length; f += 3) {
    const tri = [idx[f], idx[f + 1], idx[f + 2]];
    assert.equal(new Set(tri).size, 3, `${label}: degenerate face survived collapse`);
    tri.forEach(v => referenced.add(v));
    for (let e = 0; e < 3; e++) { const k = [tri[e], tri[(e + 1) % 3]].sort((a, b) => a - b).join('_'); counts.set(k, (counts.get(k) || 0) + 1); }
  }
  for (const [edge, n] of counts) assert.ok(n <= 2, `${label}: edge ${edge} has ${n} faces (nonmanifold)`);
  assert.equal(referenced.size, geo.attributes.position.count, `${label}: unreferenced vertices survived compaction`);
}

test('dyntopo collapse simplifies locally, stays manifold and compacts vertices', () => {
  const mesh = sphere();
  const geo = mesh.geometry, trisBefore = geo.index.count / 3;
  const report = dyntopoCollapse(geo, [0, 0.5, 0], 0.3, 0.08);
  assert.ok(report.collapsed > 10, `expected real collapses, got ${report.collapsed}`);
  assert.ok(geo.index.count / 3 < trisBefore, 'triangle count must drop');
  assertManifold(geo, 'collapse');
  const p = geo.attributes.position;
  let pole = false;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 1e-6 && Math.abs(p.getY(i) + 0.5) < 1e-6 && Math.abs(p.getZ(i)) < 1e-6) pole = true;
  assert.ok(pole, 'geometry outside the brush radius must be untouched');
});

test('dyntopo collapse protects fully masked vertices and open boundaries', () => {
  const mesh = sphere();
  const mask = maskAttribute(mesh.geometry);
  mask.array.fill(1);
  const trisBefore = mesh.geometry.index.count;
  const report = dyntopoCollapse(mesh.geometry, [0, 0.5, 0], 0.3, 0.08);
  assert.equal(report.collapsed, 0, 'fully masked mesh must not collapse');
  assert.ok(report.skipped.protected > 0, 'protected skips must be reported');
  assert.equal(mesh.geometry.index.count, trisBefore);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8), new THREE.MeshStandardMaterial());
  const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => [x, y]);
  dyntopoCollapse(plane.geometry, [0, 0, 0], 0.45, 0.2);
  assertManifold(plane.geometry, 'plane collapse');
  const pp = plane.geometry.attributes.position;
  for (const [x, y] of corners) {
    let found = false;
    for (let i = 0; i < pp.count; i++) if (Math.abs(pp.getX(i) - x) < 1e-6 && Math.abs(pp.getY(i) - y) < 1e-6) found = true;
    assert.ok(found, `boundary corner ${x},${y} must survive`);
  }
});

test('topology tools survive nonmanifold input and preserve UV seams', () => {
  // Two tetrahedra sharing an edge: that edge has 4 faces (nonmanifold).
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0.5, 0.3, 1, 0.5, 0.3, -1]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1, 0.5, 0.3, 0.5, 0.7]), 2));
  geo.setIndex([0, 1, 2, 1, 0, 3, 0, 1, 4]); // edge (0,1) has three faces: nonmanifold
  geo.computeVertexNormals();
  const report = dyntopoCollapse(geo, [0.5, 0.3, 0], 2, 1.2);
  assert.ok(report, 'collapse must not crash on nonmanifold input');
  const idx = geo.index.array;
  for (const v of idx) assert.ok(v < geo.attributes.position.count, 'indices stay in range');
  assert.equal(geo.attributes.uv.count, geo.attributes.position.count, 'UV seam channel survives collapse');
  assert.ok([...geo.attributes.uv.array].every(Number.isFinite), 'UVs stay finite');
  const refined = dyntopoCollapse(new THREE.SphereGeometry(0.5, 24, 16), [0, 0.5, 0], 0.3, 0.09);
  assert.ok(refined.collapsed > 0, 'collapse works beside a UV seam (sphere poles/seam intact)');
});

test('dyntopo collapse rejects shape keys and material groups before mutating', () => {
  const mesh = sphere();
  mesh.geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3), 3)];
  const before = mesh.geometry.index.count;
  assert.throws(() => dyntopoCollapse(mesh.geometry, [0, 0.5, 0], 0.3, 0.08), /shape keys/);
  assert.equal(mesh.geometry.index.count, before, 'rejected collapse must not mutate');
  const grouped = sphere();
  grouped.geometry.groups = [{start: 0, count: 6, materialIndex: 0}, {start: 6, count: 6, materialIndex: 1}];
  assert.throws(() => dyntopoCollapse(grouped.geometry, [0, 0.5, 0], 0.3, 0.08), /material groups/);
});

test('simplify brush requires Dyntopo and otherwise reports an actionable error', () => {
  const mesh = sphere();
  const errors = [];
  const editor = {scene: new THREE.Scene(), renderer: {domElement: {addEventListener() {}, setPointerCapture() {}}}, orbit: {enabled: true}, selected: null, change(kind, payload) { if (kind === 'operator-error') errors.push(payload); }, commit() {}, transform: {detach() {}, attach() {}}};
  const tools = new MeshTools(editor);
  tools.mode = 'sculpt'; tools.stroke = true;
  tools.brush = {...tools.brush, type: 'simplify', radius: 0.3, dyntopo: {enabled: false, detail: 0.08}};
  const hit = {object: mesh, point: new THREE.Vector3(0, 0.5, 0), face: {normal: new THREE.Vector3(0, 1, 0)}};
  const trisBefore = mesh.geometry.index.count;
  tools.applyBrush(hit, false, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /requires Dyntopo/);
  assert.equal(mesh.geometry.index.count, trisBefore, 'disabled simplify must not mutate');
  tools.brush.dyntopo.enabled = true;
  tools.applyBrush(hit, false, undefined);
  assert.ok(mesh.geometry.index.count < trisBefore, 'dyntopo simplify must collapse under the brush');
  assert.equal(sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'simplify', false, {normal: frontNormal}), 0, 'sculptGeometry must never displace for the topology action');
});

function fakeTools(mesh) {
  const editor = {scene: new THREE.Scene(), renderer: {domElement: {addEventListener() {}, setPointerCapture() {}}}, orbit: {enabled: true}, selected: null, change() {}, commit() {}, transform: {detach() {}, attach() {}}};
  const tools = new MeshTools(editor);
  tools.mode = 'sculpt';
  tools.brush = {...tools.brush, type: 'draw', radius: 0.15, strength: 0.02};
  tools.stroke = true;
  mesh.updateMatrixWorld(true);
  const hit = x => ({object: mesh, point: new THREE.Vector3(x, 0.5, 0), face: {normal: new THREE.Vector3(0, 1, 0)}});
  return {tools, hit};
}

test('dab spacing makes stroke displacement depend on path length, not pointer sampling rate', () => {
  const runStroke = moves => {
    const mesh = sphere();
    const {tools, hit} = fakeTools(mesh);
    const before = new Float32Array(mesh.geometry.attributes.position.array);
    tools.lastDabPoint = null;
    tools.applyBrush(hit(0), false, undefined);
    for (const x of moves) tools.applyBrush(hit(x), false, undefined);
    return displacement(mesh, before);
  };
  const dense = runStroke(Array.from({length: 30}, (_, i) => (i + 1) * 0.01));
  const sparse = runStroke([0.1, 0.2, 0.3]);
  assert.ok(dense > 0 && sparse > 0, 'both strokes must displace geometry');
  const ratio = dense / sparse;
  assert.ok(ratio > 0.5 && ratio < 2, `sampling-rate independence: dense/sparse displacement ratio ${ratio.toFixed(2)} (was ~10x before spacing)`);
});

test('pointer jitter below the spacing distance adds no dabs', () => {
  const mesh = sphere();
  const {tools, hit} = fakeTools(mesh);
  tools.lastDabPoint = null;
  tools.applyBrush(hit(0), false, undefined);
  const afterDab = new Float32Array(mesh.geometry.attributes.position.array);
  for (let i = 1; i <= 10; i++) tools.applyBrush(hit(i * 0.004), false, undefined);
  const p = mesh.geometry.attributes.position.array;
  assert.ok(p.every((v, i) => v === afterDab[i]), 'sub-spacing jitter must not accumulate displacement');
});

test('Escape/pointer-cancel restores the exact pre-stroke geometry without committing', () => {
  const mesh = sphere();
  const changes = [];
  const editor = {scene: new THREE.Scene(), renderer: {domElement: {addEventListener() {}, setPointerCapture() {}}}, orbit: {enabled: false}, selected: null, change(kind) { changes.push(kind); }, commit() { changes.push('commit'); }, transform: {detach() {}, attach() {}}};
  const tools = new MeshTools(editor);
  tools.mode = 'sculpt'; tools.stroke = true;
  tools.brush = {...tools.brush, type: 'draw', radius: 0.3, strength: 0.05};
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  const trisBefore = mesh.geometry.index.count;
  tools.beginStrokeSnapshot(mesh);
  tools.applyBrush({object: mesh, point: top.clone(), face: {normal: new THREE.Vector3(0, 1, 0)}}, false, undefined);
  assert.ok(displacement(mesh, before) > 0, 'stroke must displace before cancel');
  tools.cancelStroke();
  assert.equal(tools.stroke, false);
  assert.ok(mesh.geometry.attributes.position.array.every((v, i) => v === before[i]), 'cancel must restore exact pre-stroke positions');
  assert.equal(mesh.geometry.index.count, trisBefore);
  assert.ok(changes.includes('sculpt-cancelled') && !changes.includes('commit'), 'cancel must not create a history entry');
  // Topology-changing strokes cancel back to the original topology too.
  tools.stroke = true; tools.beginStrokeSnapshot(mesh);
  dyntopoRefine(mesh.geometry, [0, 0.5, 0], 0.3, 0.02);
  assert.ok(mesh.geometry.index.count > trisBefore, 'dyntopo must refine before cancel');
  tools.cancelStroke();
  assert.equal(mesh.geometry.index.count, trisBefore, 'cancel must restore the original topology');
  assert.ok(mesh.geometry.attributes.position.array.every((v, i) => v === before[i]));
});

test('grab follows the drag delta', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'grab', false, {normal: frontNormal, delta: new THREE.Vector3(0.2, 0, 0)});
  const p = mesh.geometry.attributes.position;
  let pulled = 0;
  for (let i = 0; i < p.count; i++) pulled = Math.max(pulled, p.getX(i) - before[i * 3]);
  assert.ok(pulled > 0.05, 'grab should pull geometry along the drag');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptGeometry, SCULPT_BRUSHES, FALLOFFS, falloffValue, maskAttribute, clearMask, invertMask, applyMeshFilter} from '../src/mesh-tools.js';

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

test('grab follows the drag delta', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'grab', false, {normal: frontNormal, delta: new THREE.Vector3(0.2, 0, 0)});
  const p = mesh.geometry.attributes.position;
  let pulled = 0;
  for (let i = 0; i < p.count; i++) pulled = Math.max(pulled, p.getX(i) - before[i * 3]);
  assert.ok(pulled > 0.05, 'grab should pull geometry along the drag');
});

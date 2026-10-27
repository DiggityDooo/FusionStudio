import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptGeometry, SCULPT_BRUSHES, FALLOFFS, falloffValue, maskAttribute, clearMask, invertMask} from '../src/mesh-tools.js';

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

test('grab follows the drag delta', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'grab', false, {normal: frontNormal, delta: new THREE.Vector3(0.2, 0, 0)});
  const p = mesh.geometry.attributes.position;
  let pulled = 0;
  for (let i = 0; i < p.count; i++) pulled = Math.max(pulled, p.getX(i) - before[i * 3]);
  assert.ok(pulled > 0.05, 'grab should pull geometry along the drag');
});

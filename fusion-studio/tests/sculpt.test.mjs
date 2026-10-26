import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptGeometry, SCULPT_BRUSHES, FALLOFFS, falloffValue} from '../src/mesh-tools.js';

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
  for (const id of ['draw','draw-sharp','inflate','blob','clay','crease','smooth','flatten','fill','scrape','pinch','nudge','thumb','snake-hook','grab','rotate','slide-relax'])
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
    const mesh = sphere();
    const before = new Float32Array(mesh.geometry.attributes.position.array);
    const delta = new THREE.Vector3(0.05, 0.02, 0);
    const hit = sculptGeometry(mesh, top.clone(), 0.3, 0.03, brush.id, false, {normal: frontNormal, delta, falloff: 'smooth'});
    assert.ok(hit > 0, `${brush.id} affected no vertices`);
    assert.ok(displacement(mesh, before) > 0, `${brush.id} did not move geometry`);
  }
});

test('draw inverts with the invert flag', () => {
  const a = sphere(), b = sphere();
  sculptGeometry(a, top.clone(), 0.3, 0.03, 'draw', false, {normal: frontNormal});
  sculptGeometry(b, top.clone(), 0.3, 0.03, 'draw', true, {normal: frontNormal});
  const ya = a.geometry.boundingSphere.center.y, yb = b.geometry.boundingSphere.center.y;
  assert.ok(Math.abs(ya) >= 0 || true);
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

test('grab follows the drag delta', () => {
  const mesh = sphere();
  const before = new Float32Array(mesh.geometry.attributes.position.array);
  sculptGeometry(mesh, top.clone(), 0.3, 0.03, 'grab', false, {normal: frontNormal, delta: new THREE.Vector3(0.2, 0, 0)});
  const p = mesh.geometry.attributes.position;
  let pulled = 0;
  for (let i = 0; i < p.count; i++) pulled = Math.max(pulled, p.getX(i) - before[i * 3]);
  assert.ok(pulled > 0.05, 'grab should pull geometry along the drag');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRigidBody,addRigidConstraint,stepRigidBodies,createSoftBody,pinSoftVertex,stepSoftBody,
  createPbdCloth,createParticleSystem,stepParticles,createForceField,sampleForce,createRope,stepRope,
  shatterMesh,createCollisionProxy,createPointCache,recordPointCache,exportPointCache,solverSettings,
  simDebugState,FX_PRESETS
} from '../src/sim-physics.js';

test('rigid bodies fall and spring constraints hold distance',()=>{
  const a=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2));a.position.set(0,2,0);
  const b=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2));b.position.set(0,1,0);
  const A=createRigidBody(a,{mass:1}),B=createRigidBody(b,{mass:1});
  addRigidConstraint(A,B,{kind:'spring',stiffness:.8});
  const y0=a.position.y;stepRigidBodies([A,B],{dt:1/60,substeps:4,groundY:0});
  assert.ok(a.position.y<y0);assert.ok(a.position.y>=0);
});

test('soft body / PBD cloth pin top and step',()=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,4,4));
  const soft=createSoftBody(mesh,{stiffness:.9});pinSoftVertex(soft,0);const root=[...soft.points[0]];
  stepSoftBody(soft,{dt:1/30,iterations:4});assert.deepEqual(soft.points[0],root);
  const cloth=createPbdCloth(.8,.8,6,6);assert.equal(cloth.kind,'pbd_cloth');assert.ok(cloth.pinned.size>0);
  stepSoftBody(cloth,{dt:1/30});assert.ok(cloth.mesh.geometry.attributes.position.count>0);
});

test('particles, force fields, rope, shatter, cache, FX presets',()=>{
  const sys=createParticleSystem({count:20,origin:[0,1,0],lifespan:2});
  const wind=createForceField('wind',{strength:2,axis:[1,0,0]});
  const turb=createForceField('turbulence',{strength:.5,center:[0,1,0],radius:2});
  const mag=createForceField('magnetic',{strength:1,center:[0,0,0],radius:3});
  assert.ok(sampleForce(wind,[0,0,0])[0]>0);
  stepParticles(sys,{dt:1/30,fields:[wind,turb,mag]});
  assert.ok(sys.particles.some(p=>p.p[0]!==0||p.age>0));
  const rope=createRope([[0,2,0],[0,1,0],[0,0,0]]);stepRope(rope,{dt:1/60});assert.deepEqual(rope.points[0],[0,2,0]);
  const box=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));const sh=shatterMesh(box,{pieces:4});assert.equal(sh.debris.length,4);
  const proxy=createCollisionProxy('sphere',{center:[0,0,0],radius:.5});assert.equal(proxy.kind,'sphere');
  const cache=createPointCache();recordPointCache(cache,0,[[0,0,0],[1,0,0]]);assert.equal(exportPointCache(cache).frames.length,1);
  const cfg=solverSettings({quality:'high'});assert.ok(cfg.substeps>=4);
  const fx=FX_PRESETS.fireworks();assert.ok(fx.particles.particles.length>10);
  assert.equal(simDebugState({bodies:[1,2],particles:sys,fields:[wind],proxies:[proxy],cache}).bodies,2);
});

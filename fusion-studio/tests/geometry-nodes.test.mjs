import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createGeoNodeTree,addGeoNode,linkGeoNodes,exposeParam,setTreeSeed,setTreeFrame,evaluateGeoTree,
  createAttributeStore,setAttribute,getAttribute,scatterOnMesh,instanceOnPoints,realizeInstances,
  curveToMesh,meshToCurve,noise3,fractalNoise,voronoi3,evaluateWrangle,volumeCube,sdfSphere,
  generateLSystem,generateCityBlock,generateRoadSpline,runRepeatZone,runSimulationZone,cacheGeoNode,
  createDefaultScatterTree
} from '../src/geometry-nodes.js';

test('node tree authoring, attributes, noise fields',()=>{
  const tree=createGeoNodeTree();const a=addGeoNode(tree,'mesh_in'),b=addGeoNode(tree,'noise',{params:{name:'n'}});
  linkGeoNodes(tree,a.id,'mesh',b.id,'geometry');exposeParam(tree,b.id,'name','Noise');setTreeSeed(tree,3);setTreeFrame(tree,2);
  assert.ok(noise3(0,0,0,1)!==undefined);assert.ok(Math.abs(fractalNoise(.2,.3,.4,{seed:1}))<=1);assert.ok(voronoi3(.1,.2,.3,{seed:2})>=0);
  const store=createAttributeStore();setAttribute(store,'point','pscale',[1,2,3]);assert.deepEqual(getAttribute(store,'point','pscale'),[1,2,3]);
});

test('scatter, instances, curves, volumes, generators, zones',()=>{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,8,8));
  const pts=scatterOnMesh(mesh,{count:20,seed:5});assert.ok(pts.count>=10);
  const inst=instanceOnPoints(pts,{prototype:'cube',scale:.5});assert.equal(inst.instances.length,pts.count);
  assert.ok(realizeInstances(inst).children.length>0);
  const curve=meshToCurve(mesh,{maxPoints:12});assert.ok(curve.points.length>=2);
  assert.ok(curveToMesh(curve.points,{radius:.02}).isMesh);
  assert.equal(volumeCube({res:4}).voxels.length,64);assert.ok(sdfSphere([0,0,0],[0,0,0],.5)<0);
  assert.ok(generateLSystem({iterations:2}).points.length>2);
  assert.ok(generateCityBlock({blocks:2}).children.length===4);
  assert.ok(generateRoadSpline().isMesh);
  assert.equal(runRepeatZone((s,i)=>(s||0)+1,5),5);
  assert.equal(runSimulationZone(s=>({y:(s.y||0)+1}),{frames:4}).frames.length,4);
  assert.ok(evaluateWrangle('P[1]+1',{attrs:{P:[0,2,0]}})==3);
});

test('default scatter tree evaluates',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));
  const {tree,result}=createDefaultScatterTree(mesh);
  assert.ok(tree.nodes.length>=4);assert.ok(result.points.count>0);assert.ok(result.output?.isObject3D);
  cacheGeoNode(tree,{kind:'points'});assert.equal(tree.cache.kind||tree.cache.payload.kind,'points');
  const ev=evaluateGeoTree(tree,{mesh});assert.equal(ev.seed,tree.seed);
});

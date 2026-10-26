import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {sectionContours,torsoMeasurements,measureCharacter,validateMeasurementSnapshot} from '../src/body-measurements.js';

function cylinder(rx=.2,rz=.12,{radial=128,rows=96,open=false}={}){
  const positions=[],triangles=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<radial;i++){const a=i/radial*2*Math.PI;positions.push(rx*Math.cos(a),j/rows*1.8,rz*Math.sin(a));}
  for(let j=0;j<rows;j++)for(let i=open?1:0;i<radial;i++){const a=j*radial+i,b=j*radial+(i+1)%radial,c=a+radial,d=b+radial;triangles.push(a,b,c,b,d,c);}
  return {positions,triangles};
}
const circumference=(rx,rz,n=65536)=>{let total=0;for(let i=0;i<n;i++){const a=i/n*2*Math.PI,b=(i+1)/n*2*Math.PI;total+=Math.hypot(rx*(Math.cos(b)-Math.cos(a)),rz*(Math.sin(b)-Math.sin(a)));}return total;};
function skinned(){const data=cylinder(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.triangles);const count=g.attributes.position.count;g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.morphTargetsRelative=true;g.morphAttributes.position=[new THREE.Float32BufferAttribute(data.positions.map((v,i)=>i%3===0?v*.2:0),3)];const mesh=new THREE.SkinnedMesh(g,new THREE.MeshStandardMaterial()),bone=new THREE.Bone(),root=new THREE.Group();root.add(mesh,bone);mesh.bind(new THREE.Skeleton([bone]));mesh.morphTargetInfluences[0]=0;return {root,mesh,bone};}

test('detailed ellipse sections measure the surface perimeter instead of a bounding-box estimate',()=>{
  const mesh=cylinder(),before=JSON.stringify(mesh),report=torsoMeasurements(mesh);assert.ok(report.sourceTriangles>=24000);assert.ok(report.valid);assert.equal(JSON.stringify(mesh),before);
  for(const section of Object.values(report.sections)){assert.ok(Math.abs(section.circumference/circumference(.2,.12)-1)<.0002);assert.ok(Math.abs(section.width-.4)<1e-10);assert.ok(Math.abs(section.depth-.24)<1e-10);assert.equal(section.otherClosedContours,0);}
  assert.deepEqual(torsoMeasurements(mesh).sections,report.sections);
  const flat={positions:[],triangles:[]};for(const index of mesh.triangles){flat.triangles.push(flat.triangles.length);flat.positions.push(...mesh.positions.slice(index*3,index*3+3));}assert.deepEqual(torsoMeasurements(flat).sections,report.sections,'material/UV splits do not open a section');
});

test('open, ambiguous, coincident and malformed sections report actionable failures',()=>{
  const open=torsoMeasurements(cylinder(.2,.12,{open:true}));assert.equal(open.valid,false);assert.match(open.warnings.join(' '),/open or branched/);
  const a=cylinder(),b=cylinder(.1,.06),nested={positions:[...a.positions,...b.positions],triangles:[...a.triangles,...b.triangles.map(i=>i+a.positions.length/3)]};const ambiguous=torsoMeasurements(nested);assert.equal(ambiguous.valid,false);assert.match(ambiguous.warnings[0],/found 2/);
  const coincident=torsoMeasurements(a,{levels:{hips:.5,waist:.625,chest:.75}});assert.ok(coincident.valid);assert.equal(coincident.sections.chest.planeOffset,.0001);
  assert.throws(()=>torsoMeasurements({...a,triangles:[0,1,9999999]}),/triangle index/);assert.throws(()=>sectionContours(a,NaN),/Invalid measurement plane/);assert.throws(()=>torsoMeasurements(a,{levels:{hips:.8,waist:.7,chest:.6}}),/ordered/);
});

test('source measurements exclude bone pose and root yaw/translation, retain morphs, and validate placement scale',()=>{
  const {root,mesh,bone}=skinned(),first=measureCharacter(root),before=mesh.geometry.attributes.position.array.slice();bone.rotation.z=.7;root.position.set(3,2,-4);root.rotation.y=.9;root.scale.setScalar(1.1);const posed=measureCharacter(root);for(const name of Object.keys(first.sections))for(const key of ['width','depth','circumference','height'])assert.ok(Math.abs(posed.sections[name][key]-first.sections[name][key])<1e-10);assert.equal(posed.worldScale,1.1);assert.deepEqual(mesh.geometry.attributes.position.array,before);
  mesh.morphTargetInfluences[0]=.5;const shaped=measureCharacter(root);assert.ok(shaped.sections.chest.circumference>first.sections.chest.circumference*1.05);assert.ok(Math.abs(shaped.sections.chest.width/first.sections.chest.width-1.1)<1e-7);
  root.scale.set(1,2,1);assert.throws(()=>measureCharacter(root),/uniform/);root.scale.set(1,1,1);root.rotation.x=.2;assert.throws(()=>measureCharacter(root),/upright/);root.rotation.x=0;root.scale.x=-1;assert.throws(()=>measureCharacter(root),/positive uniform/);
});

test('inspection evaluates on an isolated copy, and saved reports reject malformed contours',()=>{
  const {root}=skinned();root.userData.dson_deformation={version:1,channels:[],morphs:[],formulas:[]};root.updateWorldMatrix(true,true);const before=JSON.stringify(root.toJSON()),report=measureCharacter(root,{includeContours:true});assert.equal(JSON.stringify(root.toJSON()),before);assert.equal(root.userData.fusion_deformation,undefined);
  const snapshot={version:1,levels:{hips:.54,waist:.64,chest:.74},report};assert.equal(validateMeasurementSnapshot(snapshot),snapshot);const malformed=structuredClone(snapshot);malformed.report.sections.waist.outline[0][0]=Infinity;assert.throws(()=>validateMeasurementSnapshot(malformed),/outline/);malformed.report.sections.waist.outline=[];assert.throws(()=>validateMeasurementSnapshot(malformed),/outline/);malformed.report.sourceTriangles=200001;assert.throws(()=>validateMeasurementSnapshot(malformed),/source/);
});

test('record section timings and accuracy at increasing detailed mesh sizes',()=>{
  const timings=[];for(const [radial,rows] of [[128,24],[128,96],[256,256]]){const mesh=cylinder(.2,.12,{radial,rows}),start=performance.now(),report=torsoMeasurements(mesh),milliseconds=performance.now()-start;assert.ok(report.valid);const error=Math.abs(report.sections.chest.circumference/circumference(.2,.12)-1);assert.ok(error<.0002);timings.push({triangles:mesh.triangles.length/3,vertices:mesh.positions.length/3,milliseconds,relativePerimeterError:error});}
  fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/body-measurements-performance.json',JSON.stringify({passed:true,timings,scope:'Analytic elliptical surfaces; section tracing only, excluding source extraction, worker startup and GPU. Desktop preview has a 10-second timeout, 200,000-triangle and 500,000-vertex limits.'},null,2));console.log('Measurement timings',JSON.stringify(timings));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Timeline} from '../src/timeline.js';
import {Editor} from '../src/editor.js';
import {applyAnimClip,planAnimClip,mergeAnimationKeys,reduceKeys,retimeKeys,stretchRange,mapLoopFrame,addNlaTrack,addNlaClip,addAnimEvent,motionPath,setFollowPath} from '../src/animation.js';
import {checkCompatibility,inspectObject} from '../src/compatibility.js';
import {captureCameraRest} from '../src/cameras.js';

const rest=(extra={})=>({position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1],...extra});
const key=(frame,id,extra={},meta={})=>({frame,tracks:{[id]:rest(extra)},...meta});
function fixture(){
 const e=Object.create(Editor.prototype);Object.assign(e,{root:new THREE.Group(),scene:new THREE.Scene(),history:[],historyAt:-1,change(){},select(){},wire(){},meshTools:{setMode(){}}});e.scene.add(e.root);e.timeline=new Timeline(e);
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(.5,128,96),new THREE.MeshStandardMaterial());e.root.add(mesh);e.selected=mesh;return {e,t:e.timeline,mesh};
}
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

test('clip application retains unrelated objects, outside keys and per-object interpolation',()=>{
 const {e,mesh}=fixture(),prop=new THREE.Object3D();e.root.add(prop);
 e.root.userData.fusion_timeline=[key(1,mesh.uuid,{}, {interp:'stepped'}),{frame:31,interp:'bezier',tracks:{[prop.uuid]:rest({position:[7,0,0]})}}];
 const clip={keys:[key(1,mesh.uuid,{position:[3,0,0]}),key(11,mesh.uuid,{position:[4,0,0]})]},source=JSON.stringify(clip);
 applyAnimClip(e.root,clip,{at:31});assert.equal(JSON.stringify(clip),source);
 assert.deepEqual(e.timeline.keys().map(k=>k.frame),[1,31,41]);const shared=e.timeline.keys()[1];
 assert.equal(shared.tracks[prop.uuid].interp,'bezier');assert.equal(shared.tracks[mesh.uuid].interp,'linear');
 e.timeline.evaluate(6,{strict:true});assert.equal(mesh.position.x,0);
 const merged=mergeAnimationKeys([key(1,'a',{}, {interp:'stepped'})],[key(1,'b')]);
 assert.equal(merged[0].tracks.a.interp,'stepped');assert.equal(merged[0].tracks.b.interp,'linear');
});

test('overlapping clip keys require explicit replacement, including intermediate target keys',()=>{
 const root=new THREE.Group(),keys=[key(1,'hero'),{frame:5,tracks:{hero:rest({position:[9,0,0]}),prop:rest({position:[3,0,0]})}},key(11,'hero'),key(20,'hero')];root.userData.fusion_timeline=structuredClone(keys);
 const clip={keys:[key(1,'hero'),key(11,'hero')]},plan=planAnimClip(root,clip);
 assert.deepEqual(plan.conflicts,[{frame:5,objectId:'hero'}]);assert.throws(()=>applyAnimClip(root,clip),/overlap/);assert.deepEqual(root.userData.fusion_timeline,keys);
 applyAnimClip(root,clip,{conflict:'replace'});assert.equal(root.userData.fusion_timeline.find(k=>k.frame===5).tracks.hero,undefined);assert.equal(root.userData.fusion_timeline.find(k=>k.frame===5).tracks.prop.position[0],3);assert.ok(root.userData.fusion_timeline.find(k=>k.frame===20).tracks.hero);
 const before=JSON.stringify(root.userData);assert.throws(()=>applyAnimClip(root,{keys:[key(2,'hero',{quaternion:[0,0,0,0]})]}),/quaternion/);assert.equal(JSON.stringify(root.userData),before);
});

test('reduction retains morph, control, custom-shape and IK extrema; reduces truly linear channels',()=>{
 const cases=[v=>({morph:[v]}),v=>({channels:{smile:v}}),v=>({creator:{shapes:{cheek:v}}}),v=>({ik:[{id:'hand',target:[v,0,0],pole:[0,1,0],enabled:true}]})];
 for(const extra of cases){const keys=[key(1,'hero',extra(0)),key(5,'hero',extra(1)),key(9,'hero',extra(0))];assert.equal(reduceKeys(keys).length,3);}
 const linear=[key(1,'hero',{morph:[0],channels:{a:0}}),key(5,'hero',{morph:[.5],channels:{a:.5}}),key(9,'hero',{morph:[1],channels:{a:1}})];assert.equal(reduceKeys(linear).length,2);
 linear[1].tracks.hero.futureChannel={value:0};assert.equal(reduceKeys(linear).length,3);
 const nonlinear=[key(1,'a',{}, {interp:'stepped'}),key(5,'a'),key(9,'a')];assert.equal(reduceKeys(nonlinear).length,3);
});

test('reduction bounds error against all original samples instead of accumulating local error',()=>{
 const keys=Array.from({length:80},(_,i)=>key(i+1,'a',{position:[i*.01,Math.sin(i*.1)*.04,0],morph:[Math.sin(i*.13)]})),reduced=reduceKeys(keys,{tolerance:.005});
 assert.ok(reduced.length<keys.length);const {e,t,mesh}=fixture();mesh.morphTargetInfluences=[0];
 e.root.userData.fusion_timeline=reduced.map(k=>({...k,tracks:{[mesh.uuid]:k.tracks.a}}));
 for(const original of keys){t.evaluate(original.frame,{strict:true});close(mesh.position.y,original.tracks.a.position[1],.0050001);close(mesh.morphTargetInfluences[0],original.tracks.a.morph[0],.0050001);}
});

test('STEP exports hold exactly; spline/Bezier motion retains frame values and reports sampling',()=>{
 for(const mode of ['linear','constant','stepped','spline','bezier']){
  const {e,t,mesh}=fixture();e.root.userData.fusion_timeline=[key(1,mesh.uuid,{}, {interp:mode,handles:{out:[1/3,0],in:[2/3,1]}}),key(11,mesh.uuid,{position:[10,0,0]})];
  const report=t.exportReport(),clip=t.exportClips()[0],track=clip.tracks.find(c=>c.name===mesh.uuid+'.position'),sample=track.createInterpolant();
  for(let f=1;f<=11;f++){const u=(f-1)/10,expected=['stepped','constant'].includes(mode)?(f===11?10:0):mode==='linear'?u*10:(u*u*(3-2*u))*10;t.evaluate(f,{strict:true});close(mesh.position.x,expected);close(sample.evaluate((f-1)/24)[0],expected,2e-5);}
  if(['stepped','constant'].includes(mode)){assert.equal(track.getInterpolation(),THREE.InterpolateDiscrete);close(sample.evaluate(9.99/24)[0],0);}
  if(['spline','bezier'].includes(mode)){assert.equal(report.mode,'sampled');assert.ok(checkCompatibility('glb',inspectObject(e.root)).issues.some(i=>i.title.includes('sampled')));}
 }
});

test('mixed hold/linear tracks retain the hold until the Float32 boundary',()=>{
 const {e,t,mesh}=fixture();e.root.userData.fusion_timeline=[key(1,mesh.uuid,{}, {interp:'stepped'}),key(11,mesh.uuid,{position:[10,0,0]}),key(21,mesh.uuid,{position:[20,0,0]})];
 const track=t.exportClips()[0].tracks.find(c=>c.name.endsWith('.position')),sample=track.createInterpolant();close(sample.evaluate(9.999/24)[0],0);close(sample.evaluate(10/24)[0],10);close(sample.evaluate(15/24)[0],15);
});

test('NLA and procedural camera export evaluate motion and restore live playback without events',()=>{
 const {e,t,mesh}=fixture();e.root.userData.fusion_timeline=[key(1,mesh.uuid),key(11,mesh.uuid,{position:[10,0,0]})];
 addNlaClip(addNlaTrack(e.root),{start:1,end:21,sourceStart:1,sourceEnd:11});t.end=21;
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,1,3);camera.userData.fusion_shake_amp=.1;e.root.add(camera);captureCameraRest(camera);
 const expected=[];for(let f=1;f<=21;f++){t.evaluate(f,{strict:true});expected.push({x:mesh.position.x,cam:camera.position.x});}
 addAnimEvent(e.root,{frame:6,name:'side-effect'});let events=0;t.onEvent(()=>events++);t.evaluate(3);t.playing=true;t.pingDir=-1;t.accumulator=.7;t.lastTime=123;
 const before=JSON.stringify(e.root.toJSON()),clip=t.exportClips()[0];assert.equal(JSON.stringify(e.root.toJSON()),before);assert.equal(t.frame,3);assert.equal(t.playing,true);assert.equal(t.pingDir,-1);assert.equal(t.accumulator,.7);assert.equal(t.lastTime,123);assert.equal(events,0);
 for(const [id,prop]of [[mesh.uuid,'x'],[camera.uuid,'cam']]){const track=clip.tracks.find(c=>c.name===id+'.position'),sample=track.createInterpolant();for(let i=0;i<21;i++)close(sample.evaluate(i/24)[0],expected[i][prop]);}
});

test('motion-path sampling restores pose/frame and does not fire animation events',()=>{
 const {e,t,mesh}=fixture();e.root.userData.fusion_timeline=[key(1,mesh.uuid),key(11,mesh.uuid,{position:[10,0,0]})];t.end=11;t.evaluate(4);addAnimEvent(e.root,{frame:6,name:'event'});let events=0;t.onEvent(()=>events++);
 const line=t.samplePose(()=>motionPath(f=>t.evaluate(f,{notify:false,strict:true}),{start:1,end:11,object:mesh}));assert.equal(line.geometry.attributes.position.count,11);assert.equal(t.frame,4);assert.equal(mesh.position.x,3);assert.equal(events,0);
});

test('retiming rejects colliding keys and single-frame pingpong cannot hang',()=>{
 const keys=[key(1,'a'),key(2,'a'),key(3,'a')],before=JSON.stringify(keys);assert.throws(()=>retimeKeys(keys,{scale:.1}),/unique/);assert.throws(()=>stretchRange(keys,{start:1,end:3,newEnd:2}),/unique/);assert.equal(JSON.stringify(keys),before);
 assert.deepEqual(mapLoopFrame(1000000,1,1,'pingpong'),{frame:1,pingDir:1});assert.equal(mapLoopFrame(0,1,20,'pingpong',-1).pingDir,1);assert.ok(Number.isFinite(mapLoopFrame(1e15,1,120,'pingpong').frame));
});

test('timeline settings and follow-path definitions survive undo/save/reopen; invalid metadata leaves scene intact',async()=>{
 const {e,t,mesh}=fixture();e.commit();t.end=48;t.fps=30;t.loopMode='pingpong';t.defaultInterp='spline';t.autoKey=true;setFollowPath(mesh,[[0,0,0],[1,0,0],[1,1,0]],{end:48});e.commit();
 await e.undo();assert.equal(t.end,120);await e.redo();assert.equal(t.end,48);assert.equal(t.fps,30);assert.equal(t.loopMode,'pingpong');assert.equal(t.defaultInterp,'spline');
 const saved=JSON.parse(JSON.stringify(e.serialize())),{e:other}=fixture();await other.restore(saved);other.timeline.evaluate(25,{strict:true});assert.ok(other.root.children[0].position.length()>.5);assert.equal(other.timeline.fps,30);
 const bad=structuredClone(saved);bad.object.userData.fusion_timeline_settings.fps=0;const prior=other.root;await assert.rejects(other.restore(bad),/timeline settings/);assert.equal(other.root,prior);
});

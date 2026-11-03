import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Timeline} from '../src/timeline.js';
import {ease,sampleSegment,dopeSheet,fcurves,sampleFcurve,reduceKeys,retimeKeys,stretchRange,mapLoopFrame,addNlaTrack,addNlaClip,nlaSourceFrame,nlaState,motionPath,onionFrames,addAnimEvent,eventsAt,followPath,createPathCurve,captureAnimClip,applyAnimClip,INTERP_MODES} from '../src/animation.js';

function editorWith(mesh){
 const root=new THREE.Group();root.add(mesh);return {root,selected:mesh,commit(){},change(){}};
}

test('event inspection and timeline evaluation preserve event-free detailed scenes without inventing saved metadata',async()=>{
 const mesh=new THREE.Mesh(new THREE.TorusGeometry(.5,.12,64,256),new THREE.MeshStandardMaterial()),editor=editorWith(mesh),timeline=new Timeline(editor),before=JSON.stringify(editor.root.toJSON());
 assert.ok(mesh.geometry.index.count/3>=32768);assert.deepEqual(eventsAt(editor.root,1),[]);timeline.evaluate(1);timeline.evaluate(17,{notify:false});timeline.evaluate(1);assert.equal(JSON.stringify(editor.root.toJSON()),before);assert.equal(Object.hasOwn(editor.root.userData,'fusion_anim_events'),false);
 const event=addAnimEvent(editor.root,{frame:7,name:'Foot contact',payload:{side:'left'}}),authored=JSON.stringify(editor.root.toJSON()),seen=[];timeline.onEvent(value=>seen.push(value));timeline.evaluate(7);assert.deepEqual(seen,[event]);assert.equal(JSON.stringify(editor.root.toJSON()),authored);
 const restored=await new THREE.ObjectLoader().parseAsync(editor.root.toJSON());assert.deepEqual(eventsAt(restored,7),[event]);assert.equal(JSON.stringify(restored.userData),JSON.stringify(editor.root.userData));
});

test('interpolation modes ease and stepped hold',()=>{
 assert.equal(ease(0,'linear'),0);assert.equal(ease(1,'linear'),1);assert.equal(ease(.5,'linear'),.5);
 assert.ok(ease(.5,'spline')>.49&&ease(.5,'spline')<.51);assert.equal(ease(.4,'stepped'),0);assert.equal(ease(.9,'constant'),0);
 assert.ok(INTERP_MODES.includes('bezier'));
 const {t}=sampleSegment({frame:1,interp:'bezier'},{frame:11},6);assert.ok(t>0&&t<1);
 assert.equal(sampleSegment({frame:1,interp:'stepped'},{frame:11},10).t,0);
 assert.equal(sampleSegment({frame:1,interp:'stepped'},{frame:11},11).t,1);
});

test('timeline keys interpolate with per-key modes, auto-key flag, loop and events',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name='Cube';
 const editor=editorWith(mesh),timeline=new Timeline(editor);
 mesh.position.x=0;timeline.insert();timeline.frame=11;mesh.position.x=10;timeline.setInterp('linear');timeline.insert();
 timeline.evaluate(6,{strict:true});assert.ok(Math.abs(mesh.position.x-5)<1e-6);
 timeline.frame=1;timeline.setInterp('stepped');timeline.evaluate(10,{strict:true});assert.ok(Math.abs(mesh.position.x)<1e-6);
 timeline.evaluate(11,{strict:true});assert.ok(Math.abs(mesh.position.x-10)<1e-6);
 timeline.autoKey=true;timeline.frame=21;mesh.position.x=20;timeline.maybeAutoKey();assert.equal(timeline.keys().length,3);
 timeline.setLoopMode('loop');timeline.end=20;const looped=mapLoopFrame(21,1,20,'loop');assert.equal(looped.frame,1);
 timeline.setLoopMode('pingpong');assert.equal(mapLoopFrame(21,1,20,'pingpong',1).pingDir,-1);
 addAnimEvent(editor.root,{frame:6,name:'beat'});let heard=null;timeline.onEvent(e=>{heard=e.name;});timeline.evaluate(6,{strict:true});assert.equal(heard,'beat');assert.equal(eventsAt(editor.root,6).length,1);
});

test('dope sheet, f-curves, reduce, retime, stretch and NLA mapping',()=>{
 const keys=[{frame:1,tracks:{a:{position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}},{frame:5,tracks:{a:{position:[1,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}},{frame:9,tracks:{a:{position:[2,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}}}];
 assert.equal(dopeSheet(keys).length,1);const curve=fcurves(keys,'a',{property:'position',index:0});assert.equal(sampleFcurve(curve,5),1);
 const reduced=reduceKeys(keys,{tolerance:.0001});assert.ok(reduced.length<=keys.length);
 assert.equal(retimeKeys(keys,{scale:2,origin:1})[1].frame,9);
 assert.equal(stretchRange(keys,{start:1,end:9,newEnd:17}).at(-1).frame,17);
 const root=new THREE.Group(),track=addNlaTrack(root,'Body');addNlaClip(track,{start:1,end:10,sourceStart:1,sourceEnd:20});
 assert.equal(nlaSourceFrame(nlaState(root),6),12);
});

test('motion path, follow path, onion frames and animation library',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());const editor=editorWith(mesh),timeline=new Timeline(editor);
 mesh.position.set(0,0,0);timeline.insert();timeline.frame=5;mesh.position.set(1,0,0);timeline.insert();
 const line=motionPath(f=>timeline.evaluate(f,{notify:false}),{start:1,end:5,object:mesh});assert.equal(line.geometry.attributes.position.count,5);
 assert.deepEqual(onionFrames(10,{before:1,after:1}),[9,10,11]);
 const curve=createPathCurve([[0,0,0],[1,0,0],[1,1,0]]);followPath(mesh,curve,{frame:3,start:1,end:5,align:true});assert.ok(mesh.position.length()>0);
 const clip=captureAnimClip(editor.root,timeline.keys(),{name:'Walk'});assert.equal(clip.keys.length,2);applyAnimClip(editor.root,clip,{at:1});assert.equal(timeline.keys().length,2);
});

test('camera and object animation share the timeline',()=>{
 const cam=new THREE.PerspectiveCamera(50,1,.1,100);cam.name='Cam';const cube=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 const root=new THREE.Group();root.add(cam);root.add(cube);const editor={root,selected:cube,commit(){},change(){}},timeline=new Timeline(editor);
 cube.position.x=0;timeline.insert();editor.selected=cam;cam.position.z=5;timeline.frame=1;timeline.insert();timeline.frame=11;cam.position.z=2;timeline.insert();
 editor.selected=cube;timeline.frame=11;cube.position.x=3;timeline.insert();timeline.evaluate(6,{strict:true});
 assert.ok(Math.abs(cube.position.x-1.5)<1e-6);assert.ok(Math.abs(cam.position.z-3.5)<1e-6);
});

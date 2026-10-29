import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {visibleAnimationClips} from '../src/animation-visibility.js';
test('hidden actor tracks cannot discard visible replacement motion and input clips stay intact',()=>{
 const source=new THREE.Group(),hidden=new THREE.Group(),visible=new THREE.Group();source.add(hidden,visible);hidden.visible=false;const content=new THREE.Group(),copy=visible.clone();copy.uuid=visible.uuid;content.add(copy);const clip=new THREE.AnimationClip('motion',1,[new THREE.VectorKeyframeTrack(hidden.uuid+'.position',[0,1],[0,0,0,1,0,0]),new THREE.VectorKeyframeTrack(visible.uuid+'.position',[0,1],[0,0,0,0,1,0])]),result=visibleAnimationClips(content,source,[clip]);assert.equal(result.clips.length,1);assert.equal(result.clips[0].tracks.length,1);assert.equal(clip.tracks.length,2);assert.equal(result.report.omittedTracks,1);assert.ok(result.clips[0].tracks[0].name.startsWith(visible.uuid));
});
test('unresolved and ambiguous animation names are actionable failures rather than dropped clips',()=>{
 const source=new THREE.Group(),content=new THREE.Group();for(let i=0;i<2;i++){const n=new THREE.Group();n.name='Bone';source.add(n);}const track=name=>new THREE.AnimationClip('invalid',1,[new THREE.VectorKeyframeTrack(name+'.position',[0,1],[0,0,0,1,0,0])]);assert.throws(()=>visibleAnimationClips(content,source,[track('Bone')]),/ambiguous/);assert.throws(()=>visibleAnimationClips(content,source,[track('Missing')]),/missing/);
});

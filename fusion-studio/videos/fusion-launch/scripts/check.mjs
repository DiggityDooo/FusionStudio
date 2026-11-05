import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scenes,shots,cues,film,workflow} from '../src/story.mjs';
import {screenCamera} from '../src/camera.mjs';
assert.equal(film.durationInFrames,3600);assert.equal(film.fps,30);
assert.equal(scenes[0].from,0);assert.equal(scenes.at(-1).to,3600);
for(const [i,s]of scenes.entries()){if(i)assert.equal(s.from,scenes[i-1].to);assert.ok(s.to>s.from);if(s.clips.length)assert.equal(s.clips.reduce((n,c)=>n+c.frames,0),s.to-s.from);}
for(const [i,[from,to,text]]of cues.entries()){assert.ok(Number.isInteger(from)&&Number.isInteger(to)&&to>from&&to<=3600);assert.ok(text.length<=120);if(i)assert.equal(from,cues[i-1][1]);}
assert.equal(cues[0][0],0);assert.equal(cues.at(-1)[1],3600);
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
for(const [name,v]of Object.entries(pkg.dependencies))assert.equal(v,name.startsWith('react')?'19.3.1':'4.0.540');
assert.equal(workflow.revision.length,40);
assert.equal(workflow.reference.sha256.length,64);
assert.equal(new Set(shots.map(s=>s.id)).size,shots.length);
for(const shot of shots){if(shot.from)assert.equal((shot.from-3)%18,0,'Editorial cut must land on music grid');assert.ok(shot.words[0][0]===0);for(let i=1;i<shot.words.length;i++)assert.ok(shot.words[i][0]>shot.words[i-1][0]&&shot.words[i][0]<shot.frames);}
assert.ok(shots.length>=35,'Launch cut requires varied beats and feature moments');
assert.ok(shots.filter(s=>s.scene==='hook').every(s=>s.frames<=108),'Opening holds stay brief');
assert.ok(shots.some(s=>s.asset==='bmw-orbit')&&shots.some(s=>s.asset==='hair-orbit'),'Montage includes varied imported assets');
assert.ok(shots.filter(s=>/wire$/.test(s.asset)).length>=2,'Montage includes real wireframe views');
const decorative=shots.filter(s=>['hero','format','stack','end'].includes(s.layout));
assert.ok(decorative.every(s=>!['optics-orbit','garment-orbit','sculpt-orbit'].includes(s.asset)),'Avoid repeated camera, tank top and vase filler');
for(const id of ['dragon-orbit','dragon-wire','trunk-orbit','handbag-orbit','crate-orbit'])assert.ok(shots.some(s=>s.asset===id),'Missing new library view '+id);
for(const shot of shots)if(shot.cards){assert.equal(shot.cards.length,3);assert.equal(new Set(shot.cards.map(c=>c[0])).size,3);}
for(const shot of shots.filter(s=>s.camera)){
 assert.ok(shot.camera.length>=2);assert.equal(shot.camera[0].frame,0);
 for(const [i,key]of shot.camera.entries()){assert.ok(key.zoom>=1&&key.x>=0&&key.x<=1&&key.y>=0&&key.y<=1&&key.frame<shot.frames);if(i)assert.ok(key.frame>shot.camera[i-1].frame);}
 for(let f=0;f<shot.frames;f++){const c=screenCamera(f,shot.camera);assert.ok(c.x*c.zoom>=.5-1e-8&&(1-c.x)*c.zoom>=.5-1e-8&&c.y*c.zoom>=.5-1e-8&&(1-c.y)*c.zoom>=.5-1e-8,'Camera exposes empty edge');}
}
const typing=shots.find(s=>s.id==='chat-ask'),reply=shots.find(s=>s.id==='chat-response');
assert.ok(screenCamera(20,typing.camera).zoom>=2.8,'Prompt readable during typing');
assert.ok(screenCamera(60,reply.camera).y<.32,'Reply stays centered on conversation');
const workflowTimeline=new URL('../../../docs/demo/2026-11-04-workflow/timeline.json',import.meta.url);
let workflowFrames=null;
if(fs.existsSync(workflowTimeline)){
 const take=JSON.parse(fs.readFileSync(workflowTimeline));workflowFrames=take.frames;
 assert.ok(Number.isInteger(take.frames)&&take.frames>0&&take.continuous);
 assert.equal(take.rate,1);assert.equal(take.startStopPairs,1);
 assert.ok(Math.abs(take.frames/30-take.seconds)<=2/30);
 assert.equal(take.steps[0].frame,0);
 for(const [i,step]of take.steps.entries()){
  assert.ok(Number.isInteger(step.frame)&&step.frame>=0&&step.frame<take.frames);
  if(i)assert.ok(step.frame>take.steps[i-1].frame);
  assert.ok(step.title.length<=50&&step.caption.length<=115);
 }
}
console.log(JSON.stringify({passed:true,frames:3600,seconds:120,scenes:scenes.length,shots:shots.length,cues:cues.length,pinnedDependencies:true,workflowFrames}));

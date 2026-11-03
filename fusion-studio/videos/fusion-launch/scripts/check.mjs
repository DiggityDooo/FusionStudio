import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scenes,cues,film,workflow} from '../src/story.mjs';
assert.equal(film.durationInFrames,3600);assert.equal(film.fps,30);
assert.equal(scenes[0].from,0);assert.equal(scenes.at(-1).to,3600);
for(const [i,s]of scenes.entries()){if(i)assert.equal(s.from,scenes[i-1].to);assert.ok(s.to>s.from);if(s.clips.length)assert.equal(s.clips.reduce((n,c)=>n+c.frames,0),s.to-s.from);}
for(const [i,[from,to,text]]of cues.entries()){assert.ok(Number.isInteger(from)&&Number.isInteger(to)&&to>from&&to<=3600);assert.ok(text.length<=120);if(i)assert.equal(from,cues[i-1][1]);}
assert.equal(cues[0][0],0);assert.equal(cues.at(-1)[1],3600);
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
for(const [name,v]of Object.entries(pkg.dependencies))assert.equal(v,name.startsWith('react')?'19.3.1':'4.0.540');
assert.equal(workflow.revision.length,40);
console.log(JSON.stringify({passed:true,frames:3600,seconds:120,scenes:scenes.length,cues:cues.length,pinnedDependencies:true}));

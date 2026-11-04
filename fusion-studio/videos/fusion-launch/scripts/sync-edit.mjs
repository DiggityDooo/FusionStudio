import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace,output,hash,json} from './common.mjs';
import {scenes,shots,cues,film,workflow} from '../src/story.mjs';
const prepared=JSON.parse(fs.readFileSync(path.join(workspace,'public/prepared.json')));
for(const asset of Object.values(prepared.assets))assert.equal(hash(path.join(workspace,'public',asset.file)),asset.sha256,'Prepared media changed');
assert.equal(hash(path.join(workspace,'public/audio/secret-master.wav')),prepared.music.masterSha256);
for(const shot of shots){const a=prepared.assets[shot.asset];assert.ok(a,'Missing '+shot.asset);if(a.kind!=='image')assert.ok((shot.sourceIn||0)<(shot.sourceOut??a.frames)&&(shot.sourceOut??a.frames)<=a.frames,'Source range '+shot.id);}
Object.assign(prepared,{film,workflow,story:scenes,shots,cues});prepared.music.artist='ESPRIT 空想';json(path.join(workspace,'public/prepared.json'),prepared);
const proof=JSON.parse(fs.readFileSync(path.join(output,'provenance.json')));Object.assign(proof,{film,workflow,story:scenes,shots,captions:cues,music:prepared.music,preparedSha256:hash(path.join(workspace,'public/prepared.json'))});json(path.join(output,'provenance.json'),proof);
const stamp=f=>new Date(Math.round(f/30*1000)).toISOString().slice(11,23);
fs.writeFileSync(path.join(output,'fusion-launch.vtt'),'WEBVTT\n\n'+cues.map(([a,b,t])=>`${stamp(a)} --> ${stamp(b)}\n${t}\n`).join('\n'));
console.log(JSON.stringify({passed:true,shots:shots.length,cues:cues.length,preparedAssets:Object.keys(prepared.assets).length}));

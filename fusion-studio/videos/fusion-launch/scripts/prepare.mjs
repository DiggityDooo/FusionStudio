import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace,appRoot,output,hash,json,run,details,duration} from './common.mjs';
import {scenes,cues,film,workflow} from '../src/story.mjs';
const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
const capture=path.resolve(option('--capture')||path.join(workspace,'local/capture'));
const receipt=JSON.parse(fs.readFileSync(path.join(capture,'capture.json')));
assert.equal(receipt.passed,true,'Capture must pass');
assert.equal(receipt.asarSha256,'49f10f486e9e118d73e8b1af3ef76c585ae0a399b2e9a1aa501e4b33ac5a12f8','Frozen app must match');
const pub=path.join(workspace,'public');fs.mkdirSync(path.join(pub,'media'),{recursive:true});fs.mkdirSync(path.join(pub,'fonts'),{recursive:true});
const assets={};
for(const row of receipt.clips){const file=path.join(capture,row.file);assert.equal(hash(file),row.sha256,'Capture hash mismatch: '+row.id);const dest=path.join(pub,'media',row.id+'.mp4');fs.copyFileSync(file,dest);const seconds=duration(dest);assets[row.id]={file:'media/'+row.id+'.mp4',sha256:hash(dest),seconds,frames:Math.round(seconds*30),width:1920,height:960};}
for(const [a,b]of [['segoeui.ttf','regular.ttf'],['seguisb.ttf','semibold.ttf']])fs.copyFileSync(path.join(process.env.SystemRoot,'Fonts',a),path.join(pub,'fonts',b));
let music=null,beats=[];
const musicArg=option('--music'),previous=path.join(workspace,'local/music-input.json');
const input=musicArg||(fs.existsSync(previous)?JSON.parse(fs.readFileSync(previous)).path:null);
if(input){
 const source=path.resolve(input);assert.ok(fs.existsSync(source),'Music file missing');assert.ok(duration(source)>=120,'Music must contain at least 120 seconds');
 fs.mkdirSync(path.join(pub,'audio'),{recursive:true});
 const fade='afade=t=in:st=0:d=1,afade=t=out:st=117:d=3';
 const log=details(['-i',source,'-t','120','-af',fade+',loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-']);
 const measured=JSON.parse(log.slice(log.lastIndexOf('{'),log.lastIndexOf('}')+1));
 const normal=`loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
 const master=path.join(pub,'audio/secret-master.wav');run(['-y','-loglevel','error','-i',source,'-t','120','-af',fade+','+normal,'-ar','48000','-ac','2','-c:a','pcm_s24le',master]);
 const pcm=run(['-loglevel','error','-i',source,'-t','120','-ar','11025','-ac','1','-f','s16le','-']);
 const envelope=[];for(let f=0;f<3600;f++){let e=0,n=0;for(let s=Math.floor(f*11025/30);s<Math.floor((f+1)*11025/30)&&s*2+1<pcm.length;s++){const v=pcm.readInt16LE(s*2)/32768;e+=v*v;n++;}envelope.push(Math.sqrt(e/Math.max(1,n)));}
 const flux=envelope.map((v,i)=>Math.max(0,v-(envelope[i-1]||0)));
 let best={score:-Infinity,period:0,phase:0};
 for(let lag=12;lag<=30;lag+=.05){let score=0;for(let i=31;i<flux.length;i++){const p=i-lag,j=Math.floor(p),v=flux[j]+(flux[j+1]-flux[j])*(p-j);score+=flux[i]*v;}if(score>best.score)best={score,period:lag,phase:0};}
 let phaseScore=-Infinity;for(let phase=0;phase<best.period;phase+=.25){let sum=0;for(let p=phase;p<3600-1;p+=best.period){const j=Math.round(p);sum+=flux[j];}if(sum>phaseScore){phaseScore=sum;best.phase=phase;}}
 for(let p=best.phase;p<3600;p+=best.period)beats.push(Math.round(p));
 music={title:'Secret',artist:'ESPRIT 空想',sourceSha256:hash(source),masterSha256:hash(master),excerpt:{startSeconds:0,seconds:120,playbackRate:1,fadeInSeconds:1,fadeOutSeconds:3},analysis:{estimatedBpm:1800/best.period,periodFrames:best.period,phaseFrames:best.phase,method:'PCM energy-onset autocorrelation; constant beat grid',beats}};
 json(previous,{path:source});
}
const story=structuredClone(scenes),captions=structuredClone(cues);
for(let i=1;i<story.length;i++){const nominal=scenes[i].from,nearest=beats.reduce((a,b)=>Math.abs(b-nominal)<Math.abs(a-nominal)?b:a,nominal+10000);if(Math.abs(nearest-nominal)<=15){story[i].from=nearest;story[i-1].to=nearest;}}
for(let i=0;i<story.length;i++){const s=story[i],original=scenes[i],ratio=(s.to-s.from)/(original.to-original.from);let n=0;for(const [j,c]of s.clips.entries()){c.frames=j===s.clips.length-1?s.to-s.from-n:Math.round(c.frames*ratio);n+=c.frames;}}
for(let i=0;i<cues.length;i++){const [a,b,t]=cues[i],index=scenes.findIndex(s=>a>=s.from&&a<s.to),s=story[index],old=scenes[index],ratio=(s.to-s.from)/(old.to-old.from);captions[i]=[s.from+Math.round((a-old.from)*ratio),s.from+Math.round((b-old.from)*ratio),t];}
const prepared={film,workflow,assets,music,story,cues:captions,capture:receipt};json(path.join(pub,'prepared.json'),prepared);
fs.mkdirSync(output,{recursive:true});
const stamp=f=>{let ms=Math.round(f/30*1000),h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(ms/1000)).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(output,'fusion-launch.vtt'),'WEBVTT\n\n'+captions.map(([a,b,t])=>`${stamp(a)} --> ${stamp(b)}\n${t}\n`).join('\n'));
json(path.join(output,'provenance.json'),{workflow,film,story,captions,music:music?{...music,masterSha256:music.masterSha256}:null,capture:receipt,fontHashes:fs.readdirSync(path.join(pub,'fonts')).map(file=>({file,sha256:hash(path.join(pub,'fonts',file))})),preparedSha256:hash(path.join(pub,'prepared.json'))});
console.log(JSON.stringify({prepared:true,clips:Object.keys(assets).length,musicReady:!!music,seconds:120,estimatedBpm:music?.analysis.estimatedBpm,output}));

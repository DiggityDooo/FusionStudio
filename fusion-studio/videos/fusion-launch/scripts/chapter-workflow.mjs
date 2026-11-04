// Separate process lets Windows release Remotion's output handles before remux.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const workspace=path.resolve(import.meta.dirname,'..'),root=path.resolve(workspace,'../..'),out=path.join(root,'docs/demo/2026-11-04-workflow');
const timeline=JSON.parse(fs.readFileSync(path.join(out,'timeline.json'))),proof=JSON.parse(fs.readFileSync(path.join(out,'provenance.json')));
const ffmpeg=process.env.FUSION_MEDIA_FFMPEG||path.join(root,'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const metadata=path.join(workspace,'local/workflow-chapters.txt'),temp=path.join(workspace,'local/workflow-chapters.mp4'),video=path.join(out,'fusion-workflow.mp4');
const chapters=timeline.steps.map((s,i)=>({title:s.title,start:s.frame,end:timeline.steps[i+1]?.frame??timeline.frames}));
fs.writeFileSync(metadata,';FFMETADATA1\ntitle=Fusion Studio - Continuous Workflow\n'+chapters.map(c=>`[CHAPTER]\nTIMEBASE=1/30\nSTART=${c.start}\nEND=${c.end}\ntitle=${c.title}\n`).join(''));
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',video,'-i',metadata,'-map','0','-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',temp],{windowsHide:true,timeout:600000});
fs.copyFileSync(temp,video);proof.film.sha256=crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex');proof.film.chapters=chapters;
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({chapters:chapters.length,sha256:proof.film.sha256}));

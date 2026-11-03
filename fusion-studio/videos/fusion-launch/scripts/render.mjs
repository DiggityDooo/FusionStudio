import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import {workspace,output,json} from './common.mjs';
const preview=process.argv.includes('--preview'),still=process.argv.indexOf('--still');
const prepared=JSON.parse(fs.readFileSync(path.join(workspace,'public/prepared.json')));
if(!preview&&!prepared.music)throw Error('Final soundtrack required. Run prepare --music <local Secret file>. Use preview for explicit silent picture review.');
fs.mkdirSync(output,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(workspace,'src/index.jsx'),publicDir:path.join(workspace,'public')});
const props={preview},composition=await selectComposition({serveUrl,id:'FusionLaunch',inputProps:props});
const options={serveUrl,composition,inputProps:props,chromiumOptions:{gl:'angle'},concurrency:4,timeoutInMilliseconds:120000};
if(still>=0){const frame=Number(process.argv[still+1]);await renderStill({...options,frame,output:path.join(workspace,'local',`frame-${frame}.png`)});console.log('Still rendered: '+frame);}
else{
 let last=-1;
 const file=preview?'fusion-launch-picture-preview.mp4':'fusion-launch.mp4';
 await renderMedia({...options,codec:'h264',audioCodec:'aac',audioBitrate:'192k',pixelFormat:'yuv420p',crf:18,outputLocation:preview?path.join(output,file):path.join(workspace,'local/remotion-render.mp4'),overwrite:true,onProgress:p=>{const percent=Math.floor(p.progress*100/10)*10;if(percent!==last){last=percent;console.log(`Rendering ${percent}%`);}}});
 await renderStill({...options,frame:95,output:path.join(output,'poster.png')});
 if(!preview)await import('./chapter.mjs');
 json(path.join(workspace,'local/render.json'),{completed:new Date().toISOString(),preview,file,frames:3600,seconds:120,renderer:'Remotion 4.0.540'});
 console.log(JSON.stringify({rendered:true,file,preview}));
}

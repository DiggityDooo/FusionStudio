import * as THREE from 'three';

export const PASSES={z:'Depth',normal:'Normal',position:'Position',ao:'Ambient occlusion',mist:'Mist',uv:'UV',diffuse:'Diffuse',glossy:'Glossy',emission:'Emission',vector:'Motion vector',object_index:'Object index',material_index:'Material index',crypto_object:'Cryptomatte object',crypto_material:'Cryptomatte material',shadow_catcher:'Shadow catcher',shadow:'Shadow',wireframe:'Wireframe (Freestyle)',light_groups:'Light groups'};
export const QUALITY={draft:{label:'Draft',samples:16,adaptive:.1,denoise:true},preview:{label:'Preview',samples:64,adaptive:.05,denoise:true},final:{label:'Final',samples:512,adaptive:.01,denoise:true}};
export const VIEW_TRANSFORMS=['AgX','Filmic','Standard','Khronos PBR Neutral','ACES'];
export const ENGINES=['CYCLES','EEVEE'];
export const DENOISERS=['OIDN','OPTIX'];
export const SEQUENCE_OUTPUTS=[['mp4','MP4 video (H.264)'],['prores','ProRes QuickTime'],['png','PNG image sequence'],['jpeg','JPEG image sequence'],['tiff','TIFF image sequence'],['exr','EXR image sequence']];
export const SIZES=[[1200,1000],[1920,1080],[3840,2160],[2048,2048],[1080,1920]];
// `sequence` holds animation-render settings; it is sent as `animation` only by Render Animation.
export const defaultRenderSettings=()=>({samples:32,width:1200,height:1000,device:'CPU',cameraMode:'source',sequence:{mode:'turntable',start:1,end:120,fps:24,output:'mp4'},render:{engine:'CYCLES',denoiser:'OIDN',denoise:true,adaptive:0,timeLimit:0,transparent:false,floor:'studio',viewTransform:'AgX',exposure:0,iso:100,whiteBalance:6500,motionBlur:false,shutter:180,passes:[],exr:false,caustics:false,contactShadows:false,npr:false,lightCache:false,outOfCore:false,tileSize:0,region:null,world:{color:[.18,.2,.24],strength:.35,rotation:0,volume:0,sunSky:{enabled:false,timeOfDay:false,elevation:45,rotation:0,air:1,dust:1,ozone:1,latitude:40.7,longitude:-74,month:6,day:21,hour:15}}}});
export function estimateRenderSeconds(s){
  const px=(s.width||1200)*(s.height||1000),samples=s.samples||32,r=s.render||{},passes=(r.passes||[]).length;
  const speed=s.device==='CPU'?1:s.device==='OPTIX'?10:s.device==='HIP'?6:5;
  const engine=r.engine==='EEVEE'?8:1,region=r.region?(r.region.w*r.region.h):1;
  return Math.max(1,Math.round(px*samples*(1+passes*.08)*region/(2.4e6*speed*engine)));
}
export function enqueueRender(queue,s,{name='Still',kind='image'}={}){const entry={id:crypto.randomUUID(),name,kind,settings:structuredClone(s),created:Date.now()};queue.push(entry);return entry;}
export const qualityPreset=s=>Object.entries(QUALITY).find(([,q])=>q.samples===s.samples&&q.adaptive===s.render.adaptive&&q.denoise===s.render.denoise)?.[0]||'custom';

// Saved project render settings: known keys only, with the same bounds the engine enforces.
export function normalizeRenderSettings(saved){
  const s=defaultRenderSettings();if(saved===undefined)return s;
  const bad=()=>{throw Error('Saved render settings are invalid.');},num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max?v:bad(),pick=(v,list)=>list.includes(v)?v:bad();
  if(!saved||typeof saved!=='object')bad();const r=saved.render||{},w=r.world||{};
  if(saved.samples!==undefined)s.samples=num(saved.samples,1,4096);if(saved.width!==undefined)s.width=num(saved.width,128,4096);if(saved.height!==undefined)s.height=num(saved.height,128,4096);
  if(saved.device!==undefined)s.device=pick(saved.device,['CPU','CUDA','OPTIX','HIP']);if(saved.cameraMode!==undefined)s.cameraMode=pick(saved.cameraMode,['source','viewport','scene']);
  for(const k of ['denoise','transparent','caustics','contactShadows','npr','lightCache','outOfCore'])if(r[k]!==undefined)s.render[k]=typeof r[k]==='boolean'?r[k]:bad();
  if(r.engine!==undefined)s.render.engine=pick(r.engine,ENGINES);if(r.denoiser!==undefined)s.render.denoiser=pick(r.denoiser,DENOISERS);
  if(r.tileSize!==undefined)s.render.tileSize=num(r.tileSize,0,4096);
  if(r.region!==undefined){if(r.region===null)s.render.region=null;else{if(!r.region||typeof r.region!=='object')bad();s.render.region={x:num(r.region.x,0,1),y:num(r.region.y,0,1),w:num(r.region.w,.01,1),h:num(r.region.h,.01,1)};if(s.render.region.x+s.render.region.w>1.0001||s.render.region.y+s.render.region.h>1.0001)bad();}}
  if(r.adaptive!==undefined)s.render.adaptive=num(r.adaptive,0,.5);if(r.timeLimit!==undefined)s.render.timeLimit=num(r.timeLimit,0,86400);if(r.exposure!==undefined)s.render.exposure=num(r.exposure,-10,10);
  if(r.iso!==undefined)s.render.iso=num(r.iso,50,102400);if(r.whiteBalance!==undefined)s.render.whiteBalance=num(r.whiteBalance,1000,12000);if(r.shutter!==undefined)s.render.shutter=num(r.shutter,1,360);
  if(r.motionBlur!==undefined)s.render.motionBlur=typeof r.motionBlur==='boolean'?r.motionBlur:bad();
  if(r.floor!==undefined)s.render.floor=pick(r.floor,['studio','shadow_catcher','none']);if(r.viewTransform!==undefined)s.render.viewTransform=pick(r.viewTransform,VIEW_TRANSFORMS);
  if(r.passes!==undefined)s.render.passes=Array.isArray(r.passes)&&r.passes.every(p=>PASSES[p])?[...r.passes]:bad();if(r.exr!==undefined)s.render.exr=pick(r.exr,[false,'16','32']);
  if(w.color!==undefined)s.render.world.color=Array.isArray(w.color)&&w.color.length===3?w.color.map(v=>num(v,0,1)):bad();
  if(w.strength!==undefined)s.render.world.strength=num(w.strength,0,1000);if(w.rotation!==undefined)s.render.world.rotation=num(w.rotation,-360,360);
  const q=saved.sequence;if(q!==undefined){if(!q||typeof q!=='object')bad();s.sequence={mode:pick(q.mode,['timeline','turntable']),output:pick(q.output,SEQUENCE_OUTPUTS.map(([k])=>k)),start:num(q.start,0,1e6),end:num(q.end,q.start,q.start+1999),fps:num(q.fps,1,240)};if(![s.sequence.start,s.sequence.end,s.sequence.fps].every(Number.isInteger))bad();}
  if(saved.previewEnvironment!==undefined)s.previewEnvironment=saved.previewEnvironment===true;
  if(w.hdri!==undefined)s.render.world.hdri=typeof w.hdri==='string'&&/\.(hdr|exr)$/i.test(w.hdri)?w.hdri:bad();
  if(w.volume!==undefined)s.render.world.volume=num(w.volume,0,10);
  if(w.sunSky!==undefined){const sky=w.sunSky;if(!sky||typeof sky!=='object')bad();const d=s.render.world.sunSky;
    for(const k of ['enabled','timeOfDay'])if(sky[k]!==undefined)d[k]=typeof sky[k]==='boolean'?sky[k]:bad();
    for(const [k,min,max] of [['elevation',-90,90],['rotation',-360,360],['air',0,10],['dust',0,10],['ozone',0,10],['latitude',-90,90],['longitude',-180,180],['month',1,12],['day',1,31],['hour',0,24]])if(sky[k]!==undefined)d[k]=num(sky[k],min,max);}
  if(r.caustics!==undefined)s.render.caustics=typeof r.caustics==='boolean'?r.caustics:bad();
  if(r.contactShadows!==undefined)s.render.contactShadows=typeof r.contactShadows==='boolean'?r.contactShadows:bad();
  return s;
}
const hex=rgb=>'#'+new THREE.Color().setRGB(...rgb).getHexString();
const opt=(value,label,current)=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`;
const num=(id,label,value,attrs)=>`<label class="field-label" for="${id}">${label}</label><input id="${id}" type="number" value="${value}" ${attrs}>`;
export function renderPanel(s,esc){
  const r=s.render,w=r.world,reg=r.region||{x:0,y:0,w:1,h:1},seconds=estimateRenderSeconds(s);
  return `<label class="field-label" for="render-engine">Engine</label><select id="render-engine">${opt('CYCLES','Cycles (path tracing)',r.engine||'CYCLES')}${opt('EEVEE','EEVEE (raster)',r.engine)}</select>
  <label class="field-label" for="render-device">Device</label><select id="render-device">${['CPU','CUDA','OPTIX','HIP'].map(d=>opt(d,d,s.device)).join('')}</select>
  <label class="field-label" for="render-camera">Camera</label><select id="render-camera">${opt('source','Preserved scene camera',s.cameraMode)}${opt('viewport','Viewport camera',s.cameraMode)}${opt('scene','Active scene camera',s.cameraMode)}</select>
  <label class="field-label" for="render-quality">Quality preset</label><select id="render-quality">${Object.entries(QUALITY).map(([k,q])=>opt(k,`${q.label} · ${q.samples} samples`,qualityPreset(s))).join('')}${opt('custom','Custom',qualityPreset(s))}</select>
  ${num('render-samples','Samples',s.samples,'min="1" max="4096" step="1"')}${num('render-adaptive','Adaptive noise threshold (0 = off)',r.adaptive,'min="0" max="0.5" step="0.005"')}${num('render-time','Time limit (s, 0 = none)',r.timeLimit,'min="0" max="86400" step="1"')}
  <label class="check-row"><input id="render-denoise" type="checkbox" ${r.denoise?'checked':''}> Denoise</label>
  <label class="field-label" for="render-denoiser">Denoiser</label><select id="render-denoiser">${opt('OIDN','OpenImageDenoise',r.denoiser||'OIDN')}${opt('OPTIX','OptiX AI',r.denoiser)}</select>
  <p class="microcopy" id="render-estimate">Estimate ~${seconds}s for a still at ${s.width}×${s.height}, ${s.samples} samples (${s.device}${r.engine==='EEVEE'?' · EEVEE':''}).</p>
  <label class="field-label" for="render-size">Output size</label><select id="render-size">${SIZES.map(([a,b])=>opt(`${a},${b}`,`${a} × ${b}`,`${s.width},${s.height}`)).join('')}${SIZES.some(([a,b])=>a===s.width&&b===s.height)?'':opt(`${s.width},${s.height}`,`${s.width} × ${s.height}`,`${s.width},${s.height}`)}</select>
  <div class="rig-coordinates">${num('render-width','Width',s.width,'min="128" max="4096" step="1"')}${num('render-height','Height',s.height,'min="128" max="4096" step="1"')}</div>
  <label class="check-row"><input id="render-transparent" type="checkbox" ${r.transparent?'checked':''}> Transparent background</label>
  <label class="field-label" for="render-floor">Floor</label><select id="render-floor">${opt('studio','Studio floor',r.floor)}${opt('shadow_catcher','Shadow catcher',r.floor)}${opt('none','None',r.floor)}</select>
  <label class="field-label" for="render-view">View transform</label><select id="render-view">${VIEW_TRANSFORMS.map(v=>opt(v,v,r.viewTransform)).join('')}</select>${num('render-exposure','Exposure (EV)',r.exposure,'min="-10" max="10" step="0.1"')}
  ${num('render-iso','ISO',r.iso??100,'min="50" max="102400" step="50"')}${num('render-wb','White balance (K)',r.whiteBalance??6500,'min="1000" max="12000" step="50"')}
  <label class="check-row"><input id="render-motion-blur" type="checkbox" ${r.motionBlur?'checked':''}> Motion blur</label>${num('render-shutter','Shutter angle (°)',r.shutter??180,'min="1" max="360" step="1"')}
  <div class="section-heading">WORLD</div><div class="color-field"><label>Background</label><input id="world-color" type="color" value="${hex(w.color)}"></div>${num('world-strength','Strength',w.strength,'min="0" max="1000" step="0.05"')}
  <p class="microcopy" id="world-hdri-name">${w.hdri?'Environment: '+esc(w.hdri.split(/[\\/]/).pop()):'No environment image'}</p><div class="shade-buttons"><button id="world-hdri">Choose HDRI…</button><button id="world-hdri-clear" ${w.hdri?'':'disabled'}>Clear</button></div>
  ${num('world-rotation','Environment rotation (°)',w.rotation,'min="-360" max="360" step="1"')}<label class="check-row"><input id="world-preview" type="checkbox" ${s.previewEnvironment?'checked':''} ${w.hdri?'':'disabled'}> Preview environment in viewport</label>
  ${num('world-volume','Volume density (god rays)',w.volume||0,'min="0" max="10" step="0.05"')}
  <div class="section-heading">SUN / SKY</div>
  <label class="check-row"><input id="sunsky-enabled" type="checkbox" ${w.sunSky?.enabled?'checked':''}> Physical sun / sky (Nishita)</label>
  <label class="check-row"><input id="sunsky-tod" type="checkbox" ${w.sunSky?.timeOfDay?'checked':''}> Time of day / location</label>
  ${num('sunsky-elevation','Sun elevation (°)',w.sunSky?.elevation??45,'min="-90" max="90" step="1"')}${num('sunsky-rotation','Sun rotation (°)',w.sunSky?.rotation??0,'min="-360" max="360" step="1"')}
  <div class="rig-coordinates">${num('sunsky-lat','Latitude',w.sunSky?.latitude??40.7,'min="-90" max="90" step="0.1"')}${num('sunsky-lon','Longitude',w.sunSky?.longitude??-74,'min="-180" max="180" step="0.1"')}</div>
  <div class="rig-coordinates">${num('sunsky-month','Month',w.sunSky?.month??6,'min="1" max="12" step="1"')}${num('sunsky-day','Day',w.sunSky?.day??21,'min="1" max="31" step="1"')}${num('sunsky-hour','Hour',w.sunSky?.hour??15,'min="0" max="24" step="0.5"')}</div>
  <label class="check-row"><input id="render-caustics" type="checkbox" ${r.caustics?'checked':''}> Caustics (reflective / refractive)</label>
  <label class="check-row"><input id="render-contact" type="checkbox" ${r.contactShadows?'checked':''}> Contact shadows (Fast GI AO)</label>
  <label class="check-row"><input id="render-npr" type="checkbox" ${r.npr?'checked':''}> Toon / NPR (Freestyle)</label>
  <label class="check-row"><input id="render-cache" type="checkbox" ${r.lightCache?'checked':''}> Light cache (Fast GI + persistent data)</label>
  <label class="check-row"><input id="render-ooc" type="checkbox" ${r.outOfCore?'checked':''}> Out-of-core tiles</label>
  ${num('render-tile','Tile size (0 = auto)',r.tileSize||0,'min="0" max="4096" step="8"')}
  <div class="section-heading">REGION</div>
  <label class="check-row"><input id="render-region" type="checkbox" ${r.region?'checked':''}> Render region</label>
  <div class="rig-coordinates">${num('region-x','X',reg.x,'min="0" max="1" step="0.01"')}${num('region-y','Y',reg.y,'min="0" max="1" step="0.01"')}${num('region-w','W',reg.w,'min="0.01" max="1" step="0.01"')}${num('region-h','H',reg.h,'min="0.01" max="1" step="0.01"')}</div>
  <label class="check-row"><input id="render-ipr" type="checkbox" ${s.ipr?'checked':''}> Viewport IPR (progressive)</label>
  <div class="section-heading">PASSES</div><div class="pass-grid">${Object.entries(PASSES).map(([k,label])=>`<label class="check-row"><input type="checkbox" data-pass="${k}" ${r.passes.includes(k)?'checked':''}> ${label}</label>`).join('')}</div>
  <label class="field-label" for="render-exr">Multilayer EXR</label><select id="render-exr">${opt('false','Off (PNG only)',String(r.exr))}${opt('16','Half float (16-bit)',r.exr)}${opt('32','Full float (32-bit)',r.exr)}</select>
  <div class="section-heading">ANIMATION</div><label class="field-label" for="anim-mode">Motion</label><select id="anim-mode">${opt('turntable','Turntable (camera orbits once)',s.sequence.mode)}${opt('timeline','Timeline animation',s.sequence.mode)}</select>
  <div class="rig-coordinates">${num('anim-start','Start',s.sequence.start,'min="0" step="1"')}${num('anim-end','End',s.sequence.end,'min="0" step="1"')}${num('anim-fps','FPS',s.sequence.fps,'min="1" max="240" step="1"')}</div><button id="anim-timeline" class="text-button">Use timeline range</button>
  <label class="field-label" for="anim-output">Output</label><select id="anim-output">${SEQUENCE_OUTPUTS.map(([k,label])=>opt(k,label,s.sequence.output)).join('')}</select>`;
}
// Wires the panel; `changed(redraw)` persists the shared settings object and optionally re-renders the panel.
export function wireRenderPanel(s,{$,changed,chooseEnvironment,previewEnvironment,timeline,onContact,onIpr}){
  const q=s.sequence,frame=(id,key,min,max)=>$('#'+id)?.addEventListener('change',e=>{const v=Number(e.target.value);if(!Number.isInteger(v)||v<min||v>max){e.target.value=q[key];return;}q[key]=v;q.end=Math.min(Math.max(q.end,q.start),q.start+1999);changed(true);});
  frame('anim-start','start',0,1e6);frame('anim-end','end',0,1e6);frame('anim-fps','fps',1,240);
  $('#anim-mode')?.addEventListener('change',e=>{q.mode=e.target.value;changed(false);});$('#anim-output')?.addEventListener('change',e=>{q.output=e.target.value;changed(false);});
  $('#anim-timeline')?.addEventListener('click',()=>{const t=timeline();Object.assign(q,{start:t.start,end:Math.min(t.end,t.start+1999),fps:t.fps});changed(true);});
  const r=s.render,w=r.world,on=(id,ev,fn)=>$('#'+id)?.addEventListener(ev,fn),bounded=(e,min,max,apply)=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<min||v>max){e.target.value=e.target.defaultValue;return;}apply(v);changed(false);};
  on('render-engine','change',e=>{r.engine=e.target.value;changed(true);});on('render-device','change',e=>{s.device=e.target.value;changed(true);});on('render-camera','change',e=>{s.cameraMode=e.target.value;changed(false);});
  on('render-denoiser','change',e=>{r.denoiser=e.target.value;changed(false);});
  on('render-quality','change',e=>{const q=QUALITY[e.target.value];if(q){s.samples=q.samples;r.adaptive=q.adaptive;r.denoise=q.denoise;}changed(true);});
  on('render-samples','change',e=>bounded(e,1,4096,v=>s.samples=Math.round(v)));on('render-adaptive','change',e=>bounded(e,0,.5,v=>r.adaptive=v));on('render-time','change',e=>bounded(e,0,86400,v=>r.timeLimit=v));
  on('render-denoise','change',e=>{r.denoise=e.target.checked;changed(true);});
  on('render-size','change',e=>{const [width,height]=e.target.value.split(',').map(Number);Object.assign(s,{width,height});changed(true);});
  on('render-width','change',e=>bounded(e,128,4096,v=>s.width=Math.round(v)));on('render-height','change',e=>bounded(e,128,4096,v=>s.height=Math.round(v)));
  on('render-transparent','change',e=>{r.transparent=e.target.checked;changed(false);});on('render-floor','change',e=>{r.floor=e.target.value;changed(false);});
  on('render-view','change',e=>{r.viewTransform=e.target.value;changed(false);});on('render-exposure','change',e=>bounded(e,-10,10,v=>r.exposure=v));
  on('render-iso','change',e=>bounded(e,50,102400,v=>r.iso=Math.round(v)));on('render-wb','change',e=>bounded(e,1000,12000,v=>r.whiteBalance=v));
  on('render-motion-blur','change',e=>{r.motionBlur=e.target.checked;changed(false);});on('render-shutter','change',e=>bounded(e,1,360,v=>r.shutter=v));
  on('world-color','change',e=>{const c=new THREE.Color(e.target.value);w.color=[c.r,c.g,c.b];changed(false);});on('world-strength','change',e=>bounded(e,0,1000,v=>{w.strength=v;previewEnvironment();}));
  on('world-rotation','change',e=>bounded(e,-360,360,v=>{w.rotation=v;previewEnvironment();}));
  on('world-hdri','click',async()=>{const file=await chooseEnvironment();if(!file)return;w.hdri=file.path;changed(true);await previewEnvironment();});
  on('world-hdri-clear','click',()=>{delete w.hdri;s.previewEnvironment=false;changed(true);previewEnvironment();});
  on('world-preview','change',e=>{s.previewEnvironment=e.target.checked;changed(false);previewEnvironment();});
  on('world-volume','change',e=>bounded(e,0,10,v=>w.volume=v));
  const sky=()=>w.sunSky||(w.sunSky={enabled:false,timeOfDay:false,elevation:45,rotation:0,air:1,dust:1,ozone:1,latitude:40.7,longitude:-74,month:6,day:21,hour:15});
  on('sunsky-enabled','change',e=>{sky().enabled=e.target.checked;changed(false);});
  on('sunsky-tod','change',e=>{sky().timeOfDay=e.target.checked;changed(true);});
  on('sunsky-elevation','change',e=>bounded(e,-90,90,v=>sky().elevation=v));on('sunsky-rotation','change',e=>bounded(e,-360,360,v=>sky().rotation=v));
  on('sunsky-lat','change',e=>bounded(e,-90,90,v=>sky().latitude=v));on('sunsky-lon','change',e=>bounded(e,-180,180,v=>sky().longitude=v));
  on('sunsky-month','change',e=>bounded(e,1,12,v=>sky().month=Math.round(v)));on('sunsky-day','change',e=>bounded(e,1,31,v=>sky().day=Math.round(v)));on('sunsky-hour','change',e=>bounded(e,0,24,v=>sky().hour=v));
  on('render-caustics','change',e=>{r.caustics=e.target.checked;changed(false);});
  on('render-contact','change',e=>{r.contactShadows=e.target.checked;onContact?.(e.target.checked);changed(false);});
  on('render-npr','change',e=>{r.npr=e.target.checked;changed(false);});
  on('render-cache','change',e=>{r.lightCache=e.target.checked;changed(false);});
  on('render-ooc','change',e=>{r.outOfCore=e.target.checked;if(e.target.checked&&!r.tileSize)r.tileSize=64;changed(true);});
  on('render-tile','change',e=>bounded(e,0,4096,v=>r.tileSize=Math.round(v)));
  const region=()=>{if(!$('#render-region')?.checked){r.region=null;return;}r.region={x:Number($('#region-x').value)||0,y:Number($('#region-y').value)||0,w:Math.max(.01,Number($('#region-w').value)||1),h:Math.max(.01,Number($('#region-h').value)||1)};};
  on('render-region','change',()=>{region();changed(true);});
  for(const id of ['region-x','region-y','region-w','region-h'])on(id,'change',()=>{region();changed(false);});
  document.querySelectorAll('[data-pass]').forEach(b=>b.onchange=()=>{r.passes=b.checked?[...new Set([...r.passes,b.dataset.pass])]:r.passes.filter(p=>p!==b.dataset.pass);changed(false);});
  on('render-exr','change',e=>{r.exr=e.target.value==='false'?false:e.target.value;changed(false);});
  on('render-ipr','change',e=>onIpr?.(e.target.checked));
}

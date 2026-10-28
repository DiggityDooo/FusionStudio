import {createLiveLink,createVirtualCamera,createPrevisSequencer,addPrevisClip,createLedVolume,syncLedFrustum,createTimecode,formatTimecode,advanceTimecode} from './virtual-production.js';
import {createPbrRealtimePipeline,createProfiler,profilerCapture,createBuildPackage,createDatasmithImport,datasmithSync} from './realtime-engine.js';
import {checkManifold,sliceModel,generateGcode,estimatePrint} from './print-cam.js';
import {createPointCloud,reconstructFromPhotos,importGaussianSplat} from './scanning.js';
import {createCloner,createGreasePencil,addGreaseStroke,createText3d} from './mograph.js';
import {textToMesh,nlCommandParse,aiGenerateMaterial} from './ai-tools.js';
import {createCloudProject,createVersionHistory,commitVersion,createAssetLibrary,tagAsset,searchAssets} from './collab.js';
import {createSnapSettings,createOutliner,createPolygroups,createUdimTiles,createRenderFarmJob,createLipSync,createSubstanceGraph,importBimCad} from './remaining-features.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function pipelinePanel(editor){
  const st=editor.root.userData.fusion_pipeline||{};
  return `<section class="library-section" id="pipeline-panel"><div class="section-heading">PIPELINE · VP · ENGINE</div>
<p class="microcopy">${st.liveLink?'Live-link configuration preview':'No live-link configuration'} · ${st.tc?esc(formatTimecode(st.tc)):'no TC'}</p>
<button id="pipe-livelink" class="full-button">Preview live-link configuration</button>
<button id="pipe-vcam" class="text-button">Preview camera / LED metadata</button>
<button id="pipe-previs" class="text-button">Preview sample shot metadata</button>
<button id="pipe-pbr" class="full-button">Preview real-time settings</button>
<button id="pipe-profile" class="text-button">Measure viewport CPU submission</button>
<button id="pipe-build" class="text-button">Preview build manifest</button>
<button id="pipe-datasmith" class="text-button">Preview sample Datasmith metadata</button>
<button id="pipe-slice" class="full-button">Sample geometry print estimate</button>
<button id="pipe-scan" class="text-button">Preview scan descriptors</button>
<button id="pipe-mograph" class="text-button">Preview MoGraph descriptors</button>
<button id="pipe-ai" class="text-button">Preview AI descriptors</button>
<button id="pipe-collab" class="full-button">Preview collaboration records</button>
<button id="pipe-remaining" class="full-button">Create sample feature descriptors</button>
<p class="microcopy">These controls store sample data and configuration records. They do not connect external services, reconstruct photos, generate AI assets or build executables. Viewport profiling measures real render calls and CPU submission time; GPU timing is unavailable.</p></section>`;
}

export function wirePipelinePanel({editor,run,refresh,notify}){
  const panel=document.querySelector('#pipeline-panel');if(!panel)return;const $=s=>panel.querySelector(s);
  const st=()=>editor.root.userData.fusion_pipeline??={};
  $('#pipe-livelink').onclick=()=>run(()=>{const l=createLiveLink({engine:'unreal'});st().liveLink=l;notify('Live-link configuration preview saved; no receiver connected.');editor.commit();refresh();});
  $('#pipe-vcam').onclick=()=>run(()=>{const cam=createVirtualCamera();const led=createLedVolume();syncLedFrustum(led,cam);const tc=createTimecode({fps:24});advanceTimecode(tc,{frames:1});st().vcam=cam;st().led=led;st().tc=tc;notify(`Camera / LED metadata preview · ${formatTimecode(tc)}`);editor.commit();refresh();});
  $('#pipe-previs').onclick=()=>run(()=>{const seq=createPrevisSequencer();addPrevisClip(seq,{name:'Master',end:5});st().previs=seq;notify('Sample shot metadata: 5 seconds.');editor.commit();});
  $('#pipe-pbr').onclick=()=>run(()=>{st().pbr=createPbrRealtimePipeline();notify('Real-time settings preview saved.');editor.commit();});
  $('#pipe-profile').onclick=()=>run(()=>{
    const info=editor.renderer.info,auto=info.autoReset;info.reset();info.autoReset=false;const started=performance.now();let measured;
    try{editor.draw();measured={drawCalls:info.render.calls,tris:info.render.triangles,ms:performance.now()-started};}finally{info.autoReset=auto;}
    const p=st().profiler??=createProfiler();profilerCapture(p,measured);p.measurement={version:1,kind:'cpu-render-submission',gpuMilliseconds:null,points:info.render.points,lines:info.render.lines};
    notify(`CPU submission ${measured.ms.toFixed(2)} ms · ${measured.drawCalls} draws · ${measured.tris.toLocaleString()} triangles`);editor.commit();
  });
  $('#pipe-build').onclick=()=>run(()=>{st().build=createBuildPackage({platforms:['win64']});notify('Build manifest preview saved; no executable generated.');editor.commit();});
  $('#pipe-datasmith').onclick=()=>run(()=>{const d=createDatasmithImport();datasmithSync(d,{actors:8,materials:3});st().datasmith=d;notify(`Sample Datasmith metadata: ${d.actors} actors; no file imported.`);editor.commit();});
  $('#pipe-slice').onclick=()=>run(()=>{
    const mesh={positions:new Float32Array([0,0,0,1,0,0,0,1,0,1,1,1]),indices:new Uint32Array([0,1,2,1,3,2])};
    const man=checkManifold(mesh);const sl=sliceModel(mesh);const g=generateGcode(sl);const est=estimatePrint({layers:sl.layers});
    st().print={man,sl,g,est};notify(`Sample geometry only: ${sl.layers} layers · ~${est.timeMinutes.toFixed(0)}m`);editor.commit();
  });
  $('#pipe-scan').onclick=()=>run(()=>{st().scan={photo:reconstructFromPhotos({count:12}),cloud:createPointCloud({count:200}),splat:importGaussianSplat({count:100})};notify('Sample scan descriptors saved; no photos reconstructed.');editor.commit();});
  $('#pipe-mograph').onclick=()=>run(()=>{const gp=createGreasePencil();addGreaseStroke(gp,[[0,0,0],[1,1,0],[2,0,0]]);st().mograph={cloner:createCloner({count:8,mode:'radial'}),gp,text:createText3d({text:'FX'})};notify('Sample MoGraph descriptors saved.');editor.commit();});
  $('#pipe-ai').onclick=()=>run(()=>{const cmd=nlCommandParse('subdivide mesh 2');st().ai={mesh:textToMesh({prompt:'rock'}),mat:aiGenerateMaterial({prompt:'stone'}),cmd};notify('Sample AI descriptors saved; no model generation ran.');editor.commit();});
  $('#pipe-collab').onclick=()=>run(()=>{
    const cloud=createCloudProject({name:'Fusion'});const hist=createVersionHistory();commitVersion(hist,{message:'pipeline'});
    const lib=createAssetLibrary();tagAsset(lib,{name:'Hero',tags:['char']});st().collab={cloud,hist,lib,hits:searchAssets(lib,'Hero')};notify('Local collaboration preview saved; no cloud session started.');editor.commit();refresh();
  });
  $('#pipe-remaining').onclick=()=>run(()=>{
    const mesh={positions:new Float32Array(36),indices:new Uint32Array(36)};
    st().remaining={snap:createSnapSettings({}),outliner:createOutliner([{name:'Root'}]),poly:createPolygroups(mesh),udim:createUdimTiles({tiles:4}),farm:createRenderFarmJob({}),lipsync:createLipSync({}),sub:createSubstanceGraph({}),bim:importBimCad({})};
    notify('Sample feature descriptors saved.');editor.commit();
  });
}

export function registerPipeline(registry,editor){
  registry.register({id:'pipeline.livelink',label:'Preview live-link configuration',undo:'snapshot',execute:()=>{const l=createLiveLink({});editor.root.userData.fusion_pipeline??={};editor.root.userData.fusion_pipeline.liveLink=l;editor.commit();}});
}

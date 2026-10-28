// A23 real-time / game-engine pipeline previews.

const uid=()=>'rt'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

export function createPbrRealtimePipeline({colorSpace='sRGB',shadows=true,msaa=4}={}){
  return {version:1,kind:'pbr_rt',colorSpace,shadows,msaa,materials:'metallic_roughness',ready:true};
}

export function createVirtualizedMesh({positions,indices,clusterSize=64}={}){
  if(!positions?.length||!indices?.length)throw Error('Mesh buffers required.');
  const tri=indices.length/3|0,clusters=[];
  for(let i=0;i<tri;i+=clusterSize){
    const slice=indices.slice(i*3,Math.min(indices.length,(i+clusterSize)*3));
    let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let t=0;t<slice.length;t+=3){const vi=slice[t]*3;for(let a=0;a<3;a++){min[a]=Math.min(min[a],positions[vi+a]);max[a]=Math.max(max[a],positions[vi+a]);}}
    clusters.push({triStart:i,triCount:slice.length/3|0,min,max});
  }
  return {version:1,kind:'nanite_lite',clusters,tri,streaming:true};
}

export function createGiSystem({mode='lumen_lite',probes=8}={}){
  if(!['lumen_lite','baked','probes'].includes(mode))throw Error('GI mode.');
  const list=[];for(let i=0;i<probes;i++)list.push({id:uid(),position:[Math.cos(i)*2,1.5,Math.sin(i)*2],irradiance:[.2,.22,.25]});
  return {version:1,kind:'gi',mode,probes:list,dynamic:mode==='lumen_lite'};
}

export function bakeLightmap({res=64,samples=16}={}){
  if(res<8||res>1024)throw Error('lightmap res.');
  const data=new Float32Array(res*res*3);for(let i=0;i<data.length;i++)data[i]=.15+Math.random()*.05;
  return {version:1,kind:'lightmap',res,samples,data};
}

export function createRtRaytrace({mode='realtime',bounces=2}={}){
  if(!['realtime','path'].includes(mode))throw Error('RT mode.');
  return {version:1,kind:'rt_ray',mode,bounces,enabled:true};
}

export function generateLods(mesh,{levels=3,ratios=[1,.5,.25]}={}){
  if(!mesh?.positions)throw Error('Mesh required.');
  const vert=mesh.positions.length/3|0;
  return {version:1,kind:'lods',levels:levels,entries:ratios.slice(0,levels).map((r,i)=>({lod:i,ratio:r,verts:Math.max(3,Math.floor(vert*r))}))};
}

export function generateImpostor({frames=8,size=128}={}){
  return {version:1,kind:'impostor',frames,size,atlas:`${frames}x1`};
}

export function generateCollisionMesh(mesh,{kind='convex_hull',maxVerts=32}={}){
  if(!mesh?.positions)throw Error('Mesh required.');
  const verts=[];
  for(let i=0;i<mesh.positions.length;i+=3)verts.push([mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]]);
  // AABB + sampled extremes as convex proxy
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of verts)for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}
  const hull=[[min[0],min[1],min[2]],[max[0],min[1],min[2]],[min[0],max[1],min[2]],[max[0],max[1],max[2]]].slice(0,maxVerts);
  return {version:1,kind:'collision',type:kind,hull,aabb:{min,max}};
}

export function frustumCull(objects,camera){
  const fov=(camera.fov||60)*Math.PI/180,pos=camera.position||[0,0,0],near=camera.near??.1,far=camera.far??1000;
  const visible=[],culled=[];
  for(const o of objects){
    const p=o.position||[0,0,0],dx=p[0]-pos[0],dy=p[1]-pos[1],dz=p[2]-pos[2],d=Math.hypot(dx,dy,dz);
    if(d>far||d<near){culled.push(o.id);continue;}
    const forward=camera.forward||[0,0,-1];
    const nd=d||1,fx=forward[0],fy=forward[1],fz=forward[2];
    const cos=(dx*fx+dy*fy+dz*fz)/nd;const ang=Math.acos(Math.min(1,Math.max(-1,cos)));
    if(ang>fov*.5)culled.push(o.id);else visible.push(o.id);
  }
  return {visible,culled};
}

export function occlusionCull(objects,occluders){
  const culled=new Set();
  for(const o of objects)for(const occ of occluders){
    if(o.id===occ.id)continue;
    const op=o.position||[0,0,0],cp=occ.position||[0,0,0],or=o.radius||.5,cr=occ.radius||1;
    if(Math.hypot(op[0]-cp[0],op[2]-cp[2])<cr&&op[1]<cp[1]+cr)culled.add(o.id);
    void or;
  }
  return {visible:objects.filter(o=>!culled.has(o.id)).map(o=>o.id),culled:[...culled]};
}

export function createShaderGraph({name='M_Master'}={}){
  return {version:1,kind:'shader_graph',name,nodes:[],links:[]};
}

export function addShaderNode(graph,type,params={}){
  const allowed=['texture','constant','multiply','add','pbr_output','normal_map','uv','vertex_color'];
  if(!allowed.includes(type))throw Error('Unknown shader node.');
  const n={id:uid(),type,params:{...params}};graph.nodes.push(n);return n;
}

export function linkShaderNodes(graph,from,to){
  graph.links.push({from,to});return graph.links.at(-1);
}

export function createBlueprint({name='BP_Actor'}={}){
  return {version:1,kind:'blueprint',name,nodes:[],vars:{}};
}

export function addBlueprintNode(bp,type,params={}){
  if(!['event_begin','branch','set_var','print','timeline','delay','cast'].includes(type))throw Error('BP node.');
  const n={id:uid(),type,params:{...params}};bp.nodes.push(n);return n;
}

export function createAnimBlueprint({name='ABP'}={}){
  return {version:1,kind:'anim_bp',name,states:[],transitions:[],blendSpaces:[],ikNodes:[]};
}

export function addAnimState(abp,name,{blend='locomotion'}={}){
  const s={id:uid(),name,blend};abp.states.push(s);return s;
}

export function addBlendSpace(abp,{name='Move',axes=['speed','direction']}={}){
  const b={id:uid(),name,axes,samples:[]};abp.blendSpaces.push(b);return b;
}

export function addIkRigNode(abp,{bone='foot_l',kind='two_bone'}={}){
  const n={id:uid(),bone,kind};abp.ikNodes.push(n);return n;
}

export function createPhysicsAsset({bones=[]}={}){
  const bodies=bones.map(b=>({bone:b,shape:'capsule',radius:.05,length:.2}));
  return {version:1,kind:'physics_asset',bodies,constraints:bodies.slice(1).map((b,i)=>({a:bodies[i].bone,b:b.bone,type:'cone'}))};
}

export function createEngineParticles({count=32}={}){
  const p=[];for(let i=0;i<count;i++)p.push({p:[0,1,0],v:[Math.random()-.5,Math.random(),Math.random()-.5],life:1});
  return {version:1,kind:'engine_fx',particles:p};
}

export function createLevelSequencer({fps=30}={}){
  return {version:1,kind:'level_seq',fps,tracks:[],length:0};
}

export function addSequencerTrack(seq,{name='Camera',keys=[]}={}){
  const t={id:uid(),name,keys};seq.tracks.push(t);seq.length=Math.max(seq.length,...keys.map(k=>k.t||0),0);return t;
}

export function createLandscapeFoliage({res=32,size=50}={}){
  const heights=new Float32Array(res*res);for(let i=0;i<heights.length;i++)heights[i]=Math.sin(i*.1)*.5;
  return {version:1,kind:'landscape',res,size,heights,foliageInstances:[]};
}

export function scatterEngineFoliage(land,{count=20}={}){
  for(let i=0;i<count;i++)land.foliageInstances.push({x:(Math.random()-.5)*land.size,z:(Math.random()-.5)*land.size, proto:'grass'});
  return land;
}

export function compressTextureStreaming({width=256,height=256,format='BC7'}={}){
  if(!['BC1','BC3','BC5','BC7','ASTC_4x4','ASTC_8x8'].includes(format))throw Error('format.');
  const blocks=Math.ceil(width/4)*Math.ceil(height/4);
  return {version:1,kind:'tex_stream',width,height,format,blocks,bytes:blocks*(format.startsWith('ASTC')?16:16)};
}

export function importSkeletalMorph({bones=10,morphs=3,verts=100}={}){
  return {version:1,kind:'skel_morph',bones:Array.from({length:bones},(_,i)=>`b${i}`),morphTargets:Array.from({length:morphs},(_,i)=>({name:`morph_${i}`,deltas:verts})),verts};
}

export function createRtClothHair({kind='cloth',particles=40}={}){
  if(!['cloth','hair'].includes(kind))throw Error('kind.');
  return {version:1,kind:'rt_'+kind,particles:Array.from({length:particles},()=>({p:[0,1,0],prev:[0,1,0]})),stiffness:.9};
}

export function stepRtClothHair(sim,{dt=1/60}={}){
  for(const p of sim.particles){const x=p.p[0],y=p.p[1]-9.8*dt*dt,z=p.p[2];p.prev=[...p.p];p.p=[x,Math.max(0,y),z];}
  return sim;
}

export function createNaniteReadyPipeline(mesh){
  const virt=createVirtualizedMesh(mesh);const lods=generateLods(mesh,{levels:4});
  return {version:1,kind:'nanite_pipeline',virtualized:virt,lods,ready:true};
}

export function createAudioIntegration({buses=['Master','SFX','Music']}={}){
  return {version:1,kind:'audio',buses,events:[],listener:[0,1.6,0]};
}

export function playAudioEvent(audio,{name='Footstep',position=[0,0,0],bus='SFX'}={}){
  const e={id:uid(),name,position,bus,t:Date.now()};audio.events.push(e);return e;
}

export function createEngineUi({screens=['HUD','Pause']}={}){
  return {version:1,kind:'engine_ui',screens,widgets:[]};
}

export function addUiWidget(ui,{screen='HUD',type='text',text=''}={}){
  const w={id:uid(),screen,type,text};ui.widgets.push(w);return w;
}

export function createBuildPackage({platforms=['win64','android'],config='Development'}={}){
  return {version:1,kind:'build',platforms,config,artifacts:platforms.map(p=>({platform:p,path:`Saved/StagedBuilds/${p}`,bytes:1e6}))};
}

export function createProfiler(){
  return {version:1,kind:'profiler',frames:[],counters:{drawCalls:0,tris:0,ms:0}};
}

export function profilerCapture(prof,{drawCalls=100,tris=50000,ms=8.3}={}){
  const f={drawCalls,tris,ms,t:Date.now()};prof.frames.push(f);prof.counters=f;return f;
}

export function createDatasmithImport({source='cad',format='udatasmith'}={}){
  return {version:1,kind:'datasmith',source,format,actors:0,materials:0,synced:false};
}

export function datasmithSync(ds,{actors=12,materials=4}={}){
  ds.actors=actors;ds.materials=materials;ds.synced=true;ds.lastSync=Date.now();return ds;
}

export function createMobileXrProfile({tier='mobile_high',maxTris=150000,msaa=2}={}){
  return {version:1,kind:'mobile_xr',tier,maxTris,msaa,instancing:true,bakedGi:true};
}

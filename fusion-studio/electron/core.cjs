const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {capsuleForFile,withDsonInventory}=require('./source-capsule.cjs');
const {PersistentWorker}=require('./persistent-worker.cjs');
const {GltfValidator}=require('./gltf-validator.cjs');
const {assertUsable}=require('./gltf-inspection.cjs');
const {snapshotGltf}=require('./gltf-resources.cjs');
const {characterMaterials}=require('./character-materials.cjs');
const {tangentReport}=require('./gltf-reports.cjs');
const meshOperations=require('./mesh-operations.json');
const {validateNativeScene}=require('./native-scene.cjs');
const {validatePatternPayload}=require('./pattern-payload.cjs');
const {validateSurfacePanels,validateSurfacePanelResult}=require('./surface-panels.cjs');
const RENDER_PASSES=['z','normal','position','ao','mist','uv','diffuse','glossy','emission','vector','object_index','material_index','crypto_object','crypto_material','shadow_catcher'];
const VIEW_TRANSFORMS=['AgX','Filmic','Standard','Khronos PBR Neutral'];
// Cycles quality, passes, colour management and world settings; rejects anything unexpected before Blender runs.
function renderQuality(o){
  if(o===undefined)return undefined;if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Invalid render settings.');
  const out={},num=(key,min,max)=>{if(o[key]===undefined)return;if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw Error(`Render ${key} must be between ${min} and ${max}.`);out[key]=o[key];};
  for(const key of ['denoise','transparent'])if(o[key]!==undefined){if(typeof o[key]!=='boolean')throw Error('Invalid render '+key+'.');out[key]=o[key];}
  num('adaptive',0,.5);num('timeLimit',0,86400);num('exposure',-10,10);
  if(o.viewTransform!==undefined){if(!VIEW_TRANSFORMS.includes(o.viewTransform))throw Error('Unsupported view transform.');out.viewTransform=o.viewTransform;}
  if(o.floor!==undefined){if(!['studio','shadow_catcher','none'].includes(o.floor))throw Error('Unsupported floor mode.');out.floor=o.floor;}
  if(o.passes!==undefined){if(!Array.isArray(o.passes)||o.passes.some(p=>!RENDER_PASSES.includes(p)))throw Error('Unsupported render pass.');out.passes=[...new Set(o.passes)];}
  if(o.exr!==undefined){if(!['16','32',false].includes(o.exr))throw Error('EXR depth must be 16 or 32.');if(o.exr)out.exr=o.exr;}
  if(o.world!==undefined){const w=o.world,world={};if(!w||typeof w!=='object')throw Error('Invalid world settings.');
    if(w.color!==undefined){if(!Array.isArray(w.color)||w.color.length!==3||w.color.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('World colour must be three values from 0 to 1.');world.color=w.color;}
    for(const [key,min,max] of [['strength',0,1000],['rotation',-360,360]])if(w[key]!==undefined){if(!Number.isFinite(w[key])||w[key]<min||w[key]>max)throw Error(`World ${key} is out of range.`);world[key]=w[key];}
    if(w.hdri!==undefined){if(typeof w.hdri!=='string'||!path.isAbsolute(w.hdri)||!['.hdr','.exr'].includes(path.extname(w.hdri).toLowerCase())||!fs.existsSync(w.hdri)||!fs.statSync(w.hdri).isFile())throw Error('Environment image must be an existing .hdr or .exr file.');world.hdri=w.hdri;}
    out.world=world;}
  return out;
}
function meshParams(action,params){
  const out={};for(const f of meshOperations[action]?.fields||[]){
    const v=params[f.key]??f.default;
    if(f.type==='enum'?!f.values.includes(v):!Number.isFinite(v)||v<f.min||v>f.max||(f.step===1&&!Number.isInteger(v)))throw Error('Invalid '+f.label+' for '+action+'.');
    out[f.key]=v;
  }return out;
}

const APPS = [
  {id:'blender',name:'Blender',role:'Model · sculpt · render',path:'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',color:'#f79b56',formats:'BLEND / GLB / FBX / OBJ',integration:'Background processing'},
  {id:'daz',name:'DAZ Studio',role:'Characters · posing',path:'C:\\Program Files\\DAZ 3D\\DAZStudio4\\DAZStudio.exe',color:'#72c9e5',formats:'FBX / OBJ + MTL',integration:'File handoff'},
  {id:'marvelous',name:'Marvelous Designer',role:'Patterns · cloth simulation',path:'C:\\Program Files\\Marvelous Designer Enterprise Network Offline\\MarvelousDesigner_Enterprise_Offline.exe',color:'#cfbaf6',formats:'OBJ / FBX / Alembic',integration:'File handoff'},
  {id:'cc',name:'Character Creator 5',role:'Character design · rigging',path:'C:\\Program Files\\Reallusion\\Character Creator 5\\Bin64\\CharacterCreator.exe',color:'#dbe888',formats:'FBX + JSON + textures',integration:'File handoff'},
];
// Export action -> output extension (STL is written in millimetres for slicers).
const EXPORTS={render:'png',blend:'blend',fbx:'fbx',obj:'obj',stl:'stl',ply:'ply',usd:'usdc',usdz:'usdz',abc:'abc'};
const FORMATS = new Set(['flattenPanels','stack',...Object.keys(meshOperations),...Object.keys(EXPORTS),'glb','subdivide','bevel','decimate','convert','solidify','mirror','remesh','recalculate','uv','boolean','cloth']);
const IMPORTS = new Set(['.duf','.glb','.gltf','.obj','.fbx','.stl','.ply','.blend','.abc','.usd','.usda','.usdc','.usdz']);
function inside(root, file) {
  const rel=path.relative(path.resolve(root),path.resolve(file));
  return rel!=='' && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel);
}
function slug(name) { const clean=String(name||'Untitled').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,60)||'Untitled'; return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean)?'Project '+clean:clean; }
function uniqueDir(root, label) {
  fs.mkdirSync(root,{recursive:true});
  const dest=path.join(root,`${slug(label)}-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(dest); return dest;
}
function writeNew(root, dest, data) {
  if(!inside(root,dest)) throw Error('Output must stay inside Fusion Studio data.');
  // Every output is new; never overwrite existing project or source files.
  fs.writeFileSync(dest,data,{flag:'wx'}); return dest;
}
function migrateProject(input){
  if(!input||input.format!=='fusion-studio')throw Error('This is not a supported Fusion Studio project.');
  if(input.version===2)return input;
  if(input.version!==1)throw Error('This project version is not supported.');
  const doc=structuredClone(input),projectId=doc.scene?.object?.uuid;
  if(typeof projectId!=='string'||!projectId)throw Error('Legacy project is missing its scene identity.');
  doc.version=2;doc.projectId=projectId;doc.manifest={schema:2,evaluation:'dependency-graph-v1',geometry:'three-json-embedded',migratedFrom:1};doc.migrations=[...(doc.migrations||[]),{from:1,to:2}];return doc;
}
function validateProject(input) {
  const doc=migrateProject(input);
  if(!doc.scene?.object || !Array.isArray(doc.scene.object.children)||typeof doc.projectId!=='string'||doc.projectId.length>100) throw Error('This is not a supported Fusion Studio project.');
  if(doc.scene.object.children.length>5000) throw Error('Project exceeds the 5,000 root-object limit.');
  for(const image of doc.scene.images||[]){
    for(const url of [].concat(image.url||[])){
      if(typeof url==='string'&&!url.startsWith('data:image/'))throw Error('Project textures must be embedded images.');
    }
  }
  const visit=node=>{if(node.userData?.nativeBlend)validateNativeScene({...node.userData.nativeBlend,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});for(const child of node.children||[])visit(child);};visit(doc.scene.object);
  return doc;
}
function saveProject(root,doc) {
  doc=validateProject(doc);
  const dir=uniqueDir(path.join(root,'projects'),doc.name);
  const file=path.join(dir,slug(doc.name)+'.fusion');
  writeNew(root,file,JSON.stringify({...doc,savedAt:new Date().toISOString()},null,2));
  return {path:file,name:doc.name};
}
function listProjects(root) {
  const base=path.join(root,'projects'); if(!fs.existsSync(base)) return [];
  return fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).flatMap(d=>{
    const dir=path.join(base,d.name);
    return fs.readdirSync(dir).filter(f=>f.endsWith('.fusion')).map(f=>({path:path.join(dir,f),name:f.slice(0,-7),time:fs.statSync(path.join(dir,f)).mtime.toISOString()}));
  }).sort((a,b)=>b.time.localeCompare(a.time));
}
function isolatedEnv(root) {
  const config=path.join(root,'blender-profile'); const temp=path.join(root,'temp');
  fs.mkdirSync(config,{recursive:true});fs.mkdirSync(temp,{recursive:true});
  return {...process.env,BLENDER_USER_CONFIG:config,BLENDER_USER_DATAFILES:path.join(config,'datafiles'),BLENDER_USER_SCRIPTS:path.join(config,'scripts'),BLENDER_USER_EXTENSIONS:path.join(config,'extensions'),TEMP:temp,TMP:temp,PYTHONDONTWRITEBYTECODE:'1'};
}
class Engine {
  constructor(root,worker,onUpdate=()=>{}) {this.root=root;this.worker=worker;this.onUpdate=onUpdate;this.jobs=[];this.active=null;this.validation=new GltfValidator();fs.mkdirSync(root,{recursive:true});this.transport=new PersistentWorker(APPS[0].path,worker,root,isolatedEnv(root));}
  apps(){return APPS.map(a=>({...a,installed:fs.existsSync(a.path)}));}
  async exportGltf({data,name='Scene',context,tangents}={}){
    if(this.active||this.validation.active)throw Error('Finish or cancel the current job before exporting.');
    const diagnostics=tangents===undefined?null:tangentReport(tangents),dir=uniqueDir(path.join(this.root,'jobs'),'glb-direct'),output=path.join(dir,slug(name)+'.glb');
    const job={id:path.basename(dir),action:'glb',status:'running',started:new Date().toISOString(),directory:dir,output,log:'Validating a direct Fusion GLB export. No Blender conversion.'};this.jobs.unshift(job);this.active={job,stop:()=>this.validation.close()};this.onUpdate({...job});
    try{const validation=await this.validation.run({data,context}),validationPath=writeNew(this.root,path.join(dir,'output-validation.json'),JSON.stringify(validation,null,2));assertUsable(validation);if(job.cancelled)throw Error('Job cancelled.');const bytes=Buffer.from(data,'base64');if(bytes.length<4||bytes.readUInt32LE(0)!==0x46546c67)throw Error('Direct export requires a binary GLB.');writeNew(this.root,output,bytes);if(diagnostics)writeNew(this.root,path.join(dir,'tangent-generation.json'),JSON.stringify(diagnostics,null,2));job.status='complete';return {...job,metadata:{route:'fusion-direct-glb'},validation,validationPath,context:context||null};}
    catch(error){job.status=job.cancelled?'cancelled':'failed';job.error=error.message;throw error;}
    finally{job.finished=new Date().toISOString();this.active=null;this.onUpdate({...job});}
  }
  run({action,data,source,scale=1,name='Scene',ratio=.5,params={}}) {
    if(this.active) throw Error('A Blender job is already running. Wait or cancel it first.');
    if(!FORMATS.has(action)) throw Error('Unsupported Blender action.');
    if(!fs.existsSync(APPS[0].path)) throw Error('Blender was not found at the configured installation path.');
    if(action==='convert' && (!source || !IMPORTS.has(path.extname(source).toLowerCase()) || !fs.statSync(source).isFile())) throw Error('Choose a supported 3D file.');
    if(!Number.isFinite(scale)||scale<=0||scale>10000) throw Error('Invalid import scale.');
    const stack=action==='stack'?validateStack(params.stack):null;
    const validated=meshParams(action,action==='decimate'?{ratio,...params}:params);
    const patternCloth=action==='cloth'&&params.patternCloth?validatePatternPayload(params.patternCloth):null;
    const surfacePanels=action==='flattenPanels'?validateSurfacePanels(params.surfacePanels):null;
    let context;if(params.context!==undefined){const c=params.context;if(!c||!['projectId','objectId'].every(k=>typeof c[k]==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(c[k]))||!Number.isSafeInteger(c.revision)||c.revision<0||!Number.isSafeInteger(c.requestId)||c.requestId<1||!/^[a-f0-9]{64}$/.test(c.inputHash||''))throw Error('Invalid scene evaluation context.');context={projectId:c.projectId,objectId:c.objectId,revision:c.revision,requestId:c.requestId,inputHash:c.inputHash};}
    if(patternCloth&&!params.targetId)throw Error('Select a pattern garment before simulation.');
    for(const key of ['targetId','cutterId','sceneCamera'])if(params[key]!==undefined&&(typeof params[key]!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(params[key])))throw Error('Invalid mesh identifier.');
    if(action==='boolean'&&(!params.targetId||!params.cutterId||params.targetId===params.cutterId))throw Error('Boolean requires a separate target and operand.');
    const nativeBytes=params.nativeScene?validateNativeScene(params.nativeScene):null;
    if(nativeBytes&&action!=='render')throw Error('Preserved scenes are currently supported by Render only.');
    if(params.blendMode!==undefined&&!['preserved','interchange'].includes(params.blendMode))throw Error('Unsupported Blender import mode.');
    if(params.device!==undefined&&!['CPU','CUDA','OPTIX'].includes(params.device))throw Error('Unsupported render device.');
    const quality=renderQuality(params.render);
    const dir=uniqueDir(path.join(this.root,'jobs'),action);
    const id=path.basename(dir);const input=surfacePanels?writeNew(this.root,path.join(dir,'surface-input.json'),JSON.stringify(surfacePanels)):action==='convert'?source:writeNew(this.root,path.join(dir,'input.glb'),Buffer.from(data||'','base64'));
    const ext=surfacePanels?'json':EXPORTS[action]||'glb';
    const output=path.join(dir,slug(name)+'.'+ext);
    const safeParams={...validated};if(params.characterMaterials){safeParams.characterMaterials=characterMaterials(params.characterMaterials);writeNew(this.root,path.join(dir,'character-materials.json'),JSON.stringify(safeParams.characterMaterials,null,2));}if(context)safeParams.context=context;if(stack)safeParams.stack=stack;for(const key of ['frames','thickness','stiffness','mass','samples','width','height'])if(Number.isFinite(params[key]))safeParams[key]=params[key];
    if(patternCloth)safeParams.patternCloth=patternCloth;
    if(params.device)safeParams.device=params.device;
    if(quality)safeParams.render=quality;
    if(params.blendMode)safeParams.blendMode=params.blendMode;
    if(nativeBytes){const snapshot=writeNew(this.root,path.join(dir,'native-input.blend'),nativeBytes);safeParams.nativeScene={snapshot,matrix:params.nativeScene.matrix,ordinary:!!params.nativeScene.ordinary};safeParams.cameraMode=params.cameraMode==='viewport'?'viewport':'source';}
    for(const key of ['targetId','cutterId','sceneCamera'])if(typeof params[key]==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(params[key]))safeParams[key]=params[key];
    if(params.camera&&Array.isArray(params.camera.position)&&Array.isArray(params.camera.target)&&[...params.camera.position,...params.camera.target].every(Number.isFinite))safeParams.camera=params.camera;
    if(Array.isArray(params.contentRoots))safeParams.contentRoots=params.contentRoots.filter(p=>typeof p==='string'&&path.isAbsolute(p)&&fs.existsSync(p));
    if(params.morphValues&&typeof params.morphValues==='object')safeParams.morphValues=Object.fromEntries(Object.entries(params.morphValues).filter(([k,v])=>k.length<1000&&Number.isFinite(v)).slice(0,1200));
    if(params.poseValues&&typeof params.poseValues==='object')safeParams.poseValues=Object.fromEntries(Object.entries(params.poseValues).filter(([k,v])=>k.length<200&&Array.isArray(v)&&v.length===3&&v.every(a=>Number.isFinite(a)&&Math.abs(a)<=360)).slice(0,512));
    const spec={action,input,output,scale,params:safeParams,ratio:Math.min(.95,Math.max(.05,Number(ratio)||.5)),directory:dir};
    const needsGltfReview=action==='convert'&&['.glb','.gltf'].includes(path.extname(source).toLowerCase());
    const specPath=writeNew(this.root,path.join(dir,needsGltfReview?'unvalidated-job.json':'job.json'),JSON.stringify(spec));
    const job={id,action,status:'running',started:new Date().toISOString(),output,log:'',directory:dir};this.jobs.unshift(job);
    const logFile=fs.createWriteStream(path.join(dir,'blender.log'),{flags:'wx'});
    let child;this.active={job,stop:()=>this.transport.stop()};this.onUpdate({...job});
    const collect=b=>{const s=b.toString();logFile.write(s);job.log=(job.log+s).slice(-14000);this.onUpdate({...job});};
    logFile.on('error',error=>{job.error='Unable to write the Blender log: '+error.message;this.active?.stop();});
    const timeout=setTimeout(()=>{job.error='Blender job exceeded 10 minutes.';this.active?.stop();},600000);
    let inputValidation;
    const task=Promise.resolve().then(async()=>{
    if(needsGltfReview){
      inputValidation=await this.validation.run({file:source});writeNew(this.root,path.join(dir,'input-validation.json'),JSON.stringify(inputValidation,null,2));assertUsable(inputValidation);
      if(params.gltfHash!==undefined&&params.gltfHash!==inputValidation.assetHash)throw Error('The glTF source or resources changed after review. Inspect again.');
      spec.input=await snapshotGltf(source,inputValidation,dir);
      // The worker spec is a new artifact, so the original job manifest is retained.
    }
    if(job.cancelled)throw Error('Job cancelled.');
    const effectiveSpecPath=inputValidation?writeNew(this.root,path.join(dir,'job.json'),JSON.stringify(spec)):specPath;
    if(process.env.FUSION_ENGINE_ONESHOT==='1'){
      const args=['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',this.worker,'--',effectiveSpecPath];
      child=spawn(APPS[0].path,args,{cwd:dir,env:isolatedEnv(this.root),windowsHide:true,stdio:['ignore','pipe','pipe']});
      this.active.stop=()=>child.kill();child.stdout.on('data',collect);child.stderr.on('data',collect);
      return new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve({pid:child.pid,mode:'one-shot'}):reject(Error('Blender exited with code '+code+'. See job log.')));});
    }else return this.transport.request(effectiveSpecPath,collect);
    });
    return task.then(async worker=>{
      if(job.cancelled)throw Error('Job cancelled.');
      if(!fs.existsSync(output)||!fs.statSync(output).size)throw Error('Worker did not produce a valid output.');
      const metadata=JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8'));
      const data=ext==='glb'?fs.readFileSync(output).toString('base64'):undefined;
      let validation,validationPath;if(data){validation=await this.validation.run({data});validationPath=writeNew(this.root,path.join(dir,'output-validation.json'),JSON.stringify(validation,null,2));assertUsable(validation);}
      if(job.cancelled)throw Error('Job cancelled.');
      let nativeBlend;if(metadata.nativeBlend){const snapshot=metadata.nativeBlend.snapshot;if(!inside(dir,snapshot))throw Error('Invalid native scene output path.');const bytes=fs.readFileSync(snapshot);nativeBlend={version:1,...metadata.nativeBlend,data:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
      let sourceCapsule;if(action==='convert'){sourceCapsule=withDsonInventory(await capsuleForFile(source),metadata?.dson);writeNew(this.root,path.join(dir,'source-capsule.json'),JSON.stringify(sourceCapsule,null,2));}
      let flattened;if(surfacePanels){if(fs.statSync(output).size>32000000)throw Error('Panel flattening output exceeds 32 MB. Simplify the working copy.');flattened=validateSurfacePanelResult(JSON.parse(fs.readFileSync(output,'utf8')),surfacePanels);}
      job.status='complete';job.worker=worker;return {...job,metadata,data,nativeBlend,...(sourceCapsule?{sourceCapsule}:{}),...(validation?{validation,validationPath}:{}),...(context?{context}:{}),...(flattened?{flattened}: {})};
    }).catch(error=>{job.status=job.cancelled?'cancelled':'failed';job.error=job.error||(job.cancelled?'Job cancelled.':error.message);throw Error(job.error);})
      .finally(()=>{clearTimeout(timeout);logFile.end();this.active=null;job.finished=new Date().toISOString();this.onUpdate({...job});});
  }
  cancel(){const validating=!!this.validation.active;this.validation.close();if(this.active){this.active.job.cancelled=true;this.active.stop();return true;}return validating;}
  close(){this.cancel();this.transport.stop('Fusion closed.');}
}
module.exports={meshParams,renderQuality,RENDER_PASSES,APPS,IMPORTS,Engine,inside,slug,writeNew,saveProject,validateProject,migrateProject,listProjects,isolatedEnv,uniqueDir};

function validateStack(stack){if(!Array.isArray(stack)||stack.length>32)throw Error("Modifier stack must contain at most 32 entries.");const ids=new Set();return stack.map(s=>{if(!s||!meshOperations[s.action]||["uv","recalculate"].includes(s.action)||typeof s.enabled!=="boolean")throw Error("Invalid stack entry.");if(typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(s.id)||ids.has(s.id))throw Error('Modifier IDs must be unique stable identifiers.');ids.add(s.id);const params=meshParams(s.action,s.params||{});if(s.action==="boolean"){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(s.params?.cutterId||""))throw Error("Invalid Boolean operand");params.cutterId=s.params.cutterId;}return {id:s.id,action:s.action,enabled:s.enabled,params};});}

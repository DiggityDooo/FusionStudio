const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{once}=require('node:events');
const {Engine,meshParams}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.5,8,16,4),new THREE.MeshStandardMaterial({color:0x5588cc}));mesh.userData.fusion_id='subject';mesh.position.set(.2,1,.1);scene.add(mesh);
 const exportData=async()=>Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const data=await exportData();fs.writeFileSync(path.join(output,'modeling-fixture.glb'),Buffer.from(data,'base64'));
 const engine=new Engine(path.join(output,'engine-modeling-'+Date.now()),path.join(root,'scripts/blender_worker.py')),reports=[];
 const run=async(action,params={},input=data)=>{const start=performance.now();const r=await engine.run({action,data:input,name:'Modeling test',params:{targetId:'subject',...params}});assert.ok(fs.statSync(r.output).size>100);reports.push({action,params,pid:r.worker.pid,revision:r.worker.revision,ms:performance.now()-start,...r.metadata});return r;};
 const bounds=r=>{const b=Buffer.from(r.data,'base64'),doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());return doc.meshes.flatMap(m=>m.primitives.map(p=>doc.accessors[p.attributes.POSITION])).map(a=>({min:a.min,max:a.max}));};
 const positions=r=>{const b=Buffer.from(r.data,'base64'),jsonLength=b.readUInt32LE(12),doc=JSON.parse(b.subarray(20,20+jsonLength).toString()),bin=28+jsonLength;return doc.meshes.flatMap(m=>m.primitives.flatMap(p=>{const a=doc.accessors[p.attributes.POSITION],v=doc.bufferViews[a.bufferView],at=bin+(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>b.readFloatLE(at+i*(v.byteStride||12)+k*4)).join(','));})).sort();};
 try{
  assert.throws(()=>meshParams('array',{count:10000}),/Invalid/);assert.throws(()=>meshParams('twist',{axis:'script'}),/Invalid/);assert.throws(()=>meshParams('bevel',{segments:1.5}),/Invalid/);
  const base=await run('glb'),pid=base.worker.pid;
  const array=await run('array',{count:3,axis:'X',offset:1.2});assert.equal(array.metadata.polygons,base.metadata.polygons*3);assert.equal(array.worker.pid,pid);
  assert.ok(bounds(array)[0].max[0]-bounds(base)[0].max[0]>2);
  const arrayY=await run('array',{count:2,axis:'Y',offset:1});assert.ok(bounds(arrayY)[0].max[1]-bounds(base)[0].max[1]>1.9,'Y axis must use Fusion up');
  const arrayZ=await run('array',{count:2,axis:'Z',offset:1});assert.ok(bounds(arrayZ)[0].max[2]-bounds(base)[0].max[2]>.49,'Z spacing must use positive Fusion Z');
  for(const action of ['subdivide','bevel','decimate','solidify','mirror','remesh','wireframe','weld','triangulate','smooth','twist','bend','taper','stretch','recalculate','uv']){
   const r=await run(action);assert.equal(r.worker.pid,pid,'successive operations reuse Blender');
   if(['subdivide','solidify','mirror','wireframe'].includes(action))assert.ok(r.metadata.polygons>base.metadata.polygons,action+' adds geometry');
   if(action==='decimate')assert.ok(r.metadata.polygons<base.metadata.polygons);
   if(action==='weld')assert.ok(r.metadata.vertices<base.metadata.vertices,'weld removes split vertices');
   if(['smooth','twist','bend','taper','stretch'].includes(action))assert.notDeepEqual(positions(r),positions(base),action+' deforms geometry');
  }
  const cutter=new THREE.Mesh(new THREE.BoxGeometry(.8,3,.8),mesh.material);cutter.position.set(.6,1,0);cutter.userData.fusion_id='cutter';scene.add(cutter);
  const booleanData=await exportData(),booleanResults=[];
  for(const operation of ['DIFFERENCE','UNION','INTERSECT'])booleanResults.push(await run('boolean',{operation,cutterId:'cutter'},booleanData));
  assert.notDeepEqual(bounds(booleanResults[0]),bounds(booleanResults[1]));assert.notDeepEqual(bounds(booleanResults[1]),bounds(booleanResults[2]));
  // Inputs are authoritative on every revision, including after multi-object jobs.
  const restored=await run('glb');assert.equal(restored.metadata.mesh_count,1);assert.deepEqual(bounds(restored),bounds(base));
  // Job failure leaves the process usable, cancellation discards it, and restart is explicit.
  await assert.rejects(engine.run({action:'bevel',data:'not glb',name:'Bad input'}));
  assert.equal((await run('glb')).worker.pid,pid);
  const cancelled=engine.run({action:'subdivide',data,params:{levels:3},name:'Cancel test'});engine.cancel();await assert.rejects(cancelled,/cancelled/);
  const restarted=await run('glb');assert.notEqual(restarted.worker.pid,pid);
  const ownedChild=engine.transport.child,closed=once(ownedChild,'close');ownedChild.kill();await closed;
  const recovered=await run('glb');assert.notEqual(recovered.worker.pid,restarted.worker.pid);
  const warmTimes=[];
  for(let i=0;i<3;i++){const t=performance.now();await run('glb');warmTimes.push(performance.now()-t);}
  const oldMode=process.env.FUSION_ENGINE_ONESHOT,oneShotTimes=[];
  try{process.env.FUSION_ENGINE_ONESHOT='1';for(let i=0;i<3;i++){const t=performance.now(),r=await run('glb');oneShotTimes.push(performance.now()-t);assert.equal(r.worker.mode,'one-shot');assert.deepEqual(bounds(r),bounds(base));}}
  finally{if(oldMode===undefined)delete process.env.FUSION_ENGINE_ONESHOT;else process.env.FUSION_ENGINE_ONESHOT=oldMode;}
  fs.writeFileSync(path.join(output,'engine-modeling-results.json'),JSON.stringify({passed:true,checks:['18 modeling operations plus Boolean modes','geometry changes and axis mapping','same PID across requests','fresh input scene per revision','invalid parameters rejected','failure recovery','cancellation restart','crash restart','one-shot fallback'],timing:{fixtureTriangles:896,warmTimes,oneShotTimes},reports},null,2));
  console.log('Engine modeling PASS: '+reports.length+' successful jobs, reuse/cancel/crash recovery.');
 }finally{engine.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

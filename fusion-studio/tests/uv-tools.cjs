const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
// UV operations run in Blender and come back as glTF texture-coordinate sets.
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,2,24,4),new THREE.MeshStandardMaterial());mesh.userData.fusion_id='subject';scene.add(mesh);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const engine=new Engine(path.join(output,'uv-tools-'+Date.now()),path.join(root,'scripts/blender_worker.py'));
 const doc=r=>{const b=Buffer.from(r.data,'base64'),len=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+len).toString()),bin:b.subarray(28+len)};};
 const uvs=(r,set=0)=>{const {json,bin}=doc(r),p=json.meshes[0].primitives[0],a=json.accessors[p.attributes['TEXCOORD_'+set]];if(!a)return null;const v=json.bufferViews[a.bufferView],o=(v.byteOffset||0)+(a.byteOffset||0),s=v.byteStride||8,out=[];for(let i=0;i<a.count;i++)out.push([bin.readFloatLE(o+i*s),bin.readFloatLE(o+i*s+4)]);return out;};
 const inUnit=list=>list.every(([u,v])=>u>=-1e-4&&u<=1+1e-4&&v>=-1e-4&&v<=1+1e-4);
 const run=(action,params={},input=data)=>engine.run({action,data:input,name:'UV',params:{targetId:'subject',...params}});
 try{
  const results={};
  for(const method of ['Angle based','Conformal','Minimum stretch'])results[method]=uvs(await run('uv_unwrap',{method,seams:'From sharp angles',angle:60,margin:.02}));
  assert.ok(Object.values(results).every(inUnit),'unwrapped islands stay inside 0–1');assert.notDeepEqual(results['Angle based'],results['Conformal'],'methods differ');
  for(const type of ['Box','Cylinder','Sphere']){const r=uvs(await run('uv_project',{type,axis:'Y',size:1}));assert.ok(r.length>0&&r.every(([u,v])=>Number.isFinite(u)&&Number.isFinite(v)),type);results[type]=r;}
  assert.notDeepEqual(results.Box,results.Cylinder);
  const planar=uvs(await run('uv_project',{type:'Planar',axis:'Y',size:1}));const span=k=>Math.max(...planar.map(p=>p[k]))-Math.min(...planar.map(p=>p[k]));
  assert.ok(Math.abs(Math.max(span(0),span(1))-1)<1e-4&&Math.abs(span(0)-span(1))<1e-4,'top-down planar fits the circular footprint to 0–1 with equal aspect');
  const scaled=await run('uv_average'),packed=await run('uv_pack',{margin:.02,rotate:'Yes'},scaled.data);assert.ok(inUnit(uvs(packed)),'packing fits islands in 0–1');
  const lightmap=await run('uv_lightmap',{margin:.1});assert.ok(uvs(lightmap,1),'second UV set exported');assert.ok(inUnit(uvs(lightmap,1)));
  // Non-overlapping islands: the summed UV area of every triangle fits inside the unit square.
  const uvArea=(r,set)=>{const {json,bin}=doc(r),p=json.meshes[0].primitives[0],a=json.accessors[p.indices],v=json.bufferViews[a.bufferView],o=(v.byteOffset||0)+(a.byteOffset||0),read=a.componentType===5125?i=>bin.readUInt32LE(o+i*4):i=>bin.readUInt16LE(o+i*2),t=uvs(r,set);let area=0;for(let i=0;i<a.count;i+=3){const [p0,p1,p2]=[read(i),read(i+1),read(i+2)].map(k=>t[k]);area+=Math.abs((p1[0]-p0[0])*(p2[1]-p0[1])-(p2[0]-p0[0])*(p1[1]-p0[1]))/2;}return area;};
  const lightArea=uvArea(lightmap,1);assert.ok(lightArea>.2&&lightArea<=1+1e-6,'lightmap islands are packed without overlap: '+lightArea);assert.ok(uvArea(lightmap,0)>1.5,'texture UVs untouched (overlapping per-face layout)');
  assert.deepEqual(uvs(lightmap,0).length,uvs(lightmap,1).length);
  assert.throws(()=>engine.run({action:'stack',data,name:'Bad stack',params:{targetId:'subject',stack:[{id:'a',action:'uv_unwrap',enabled:true,params:{}}]}}),/Invalid stack entry/);
  fs.writeFileSync(path.join(output,'uv-tools-results.json'),JSON.stringify({passed:true,uvCounts:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.length]))},null,2));console.log('UV tools PASS');
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));

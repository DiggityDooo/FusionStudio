const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..');
let engine;
(async()=>{
 const fixture=path.join(root,'test-output','studio-v2.glb');
 if(!fs.existsSync(fixture))throw Error('Run npm run test:ui first to generate the current editor fixture.');
 const data=fs.readFileSync(fixture).toString('base64');
 const staticData=fs.readFileSync(path.join(root,'test-output','studio-v2-static.glb')).toString('base64');
 const runtime=path.join(root,'test-output','integration-'+Date.now());
 engine=new Engine(runtime,path.join(root,'scripts','blender_worker.py'));
 const reports=[];
 for(const action of ['glb','obj','fbx','blend','subdivide','bevel','decimate','render']){
   console.log('Testing Blender '+action+'…');
   const result=await engine.run({action,data:['subdivide','bevel','decimate'].includes(action)?staticData:data,name:'Integration scene'});
   const stats=fs.statSync(result.output);assert.ok(stats.size>100);
   reports.push({action,output:result.output,bytes:stats.size,result:JSON.parse(fs.readFileSync(path.join(result.directory,'result.json'),'utf8'))});
   console.log('PASS '+action+' ('+stats.size+' bytes)');
 }
 for(const ext of ['obj','fbx','blend']){
   const source=reports.find(r=>r.action===ext).output;const original=fs.readFileSync(source);
   const result=await engine.run({action:'convert',source,scale:1,name:'Roundtrip '+ext});
   assert.ok(result.data);assert.deepEqual(fs.readFileSync(source),original);
   reports.push({action:'import-'+ext,output:result.output,bytes:fs.statSync(result.output).size});console.log('PASS import '+ext+' (source unchanged)');
 }
 fs.writeFileSync(path.join(root,'test-output','integration-results.json'),JSON.stringify({passed:true,reports},null,2));
 console.log('Integration suite passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>engine?.close());

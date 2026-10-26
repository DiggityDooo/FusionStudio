const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..');
let engine;
(async()=>{
 const data=fs.readFileSync(path.join(root,'test-output','studio-v2.glb')).toString('base64'),target=JSON.parse(fs.readFileSync(path.join(root,'test-output','studio-v2-cloth.json'))).targetId;
 engine=new Engine(path.join(root,'test-output','integration-v2-'+Date.now()),path.join(root,'scripts','blender_worker.py'));const reports=[];
 for(const action of ['solidify','mirror','remesh','recalculate','uv','cloth']){
  console.log('Testing '+action+'…');const result=await engine.run({action,data,name:'Unified test',params:{targetId:target,frames:20,stiffness:12,mass:.25,thickness:.002,voxel:.06}});const report=result.metadata;assert.ok(fs.statSync(result.output).size>100);if(action==='cloth')assert.ok(report.cloth_max_displacement>.0001,'Cloth must actually deform');reports.push(report);console.log('PASS '+action+(action==='cloth'?' — displacement '+report.cloth_max_displacement:'') );
 }
 fs.writeFileSync(path.join(root,'test-output','integration-v2-results.json'),JSON.stringify({passed:true,reports},null,2));console.log('Integrated mesh/cloth suite PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>engine?.close());

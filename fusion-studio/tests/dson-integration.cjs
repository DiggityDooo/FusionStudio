const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');const {preflightDson}=require('../electron/dson.cjs');
const root=path.resolve(__dirname,'..'),source='C:/Users/Public/Documents/My DAZ 3D Library/People/Genesis 9/Genesis 9.duf',roots=['C:/Users/Public/Documents/My DAZ 3D Library'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function glbJSON(file){const bytes=fs.readFileSync(file);return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());}
let engine;
(async()=>{
 const runtime=path.join(root,'test-output','dson-integration-'+Date.now());fs.mkdirSync(runtime,{recursive:true});
 const preflight=await preflightDson(runtime,path.join(root,'scripts','dson_importer.py'),source,roots);assert.ok(preflight.ok);assert.equal(preflight.meshes[0].vertices,25182);assert.ok(preflight.warnings.length>0);const before=hash(source);
 engine=new Engine(runtime,path.join(root,'scripts','blender_worker.py'));
 console.log('Importing native Genesis 9 directly…');const result=await engine.run({action:'convert',source,name:'Genesis 9',params:{contentRoots:roots}});assert.ok(result.data);assert.equal(result.metadata.dson.created_meshes.length,1);assert.equal(result.metadata.dson.created_rigs.length,1);
 const document=glbJSON(result.output);assert.ok(document.skins?.length);assert.ok(document.meshes[0].primitives[0].attributes.TEXCOORD_0);assert.ok(document.meshes.some(m=>m.weights?.length));
 const property=preflight.properties[0];console.log('Applying native sparse shape key…');const shaped=await engine.run({action:'convert',source,name:'Genesis 9 morph variant',params:{contentRoots:roots,morphValues:{[property.key]:0}}});assert.equal(shaped.metadata.dson.properties.find(p=>p.key===property.key).value,0);
 assert.equal(hash(source),before);for(const dependency of preflight.dependencies){if(dependency.sha256&&dependency.path)assert.equal(hash(dependency.path),dependency.sha256);}
 fs.writeFileSync(path.join(root,'test-output','dson-integration-results.json'),JSON.stringify({passed:true,source,sourceSha256:before,preflight:{vertices:preflight.meshes[0].vertices,faces:preflight.meshes[0].faces,bones:preflight.meshes[0].bones,warnings:preflight.warnings},output:result.output,morphOutput:shaped.output,properties:shaped.metadata.dson.properties,originalsUnchanged:true},null,2));console.log('Direct DSON PASS: geometry, UV, rig, sparse shape key, GLB and original dependency hashes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>engine?.close());

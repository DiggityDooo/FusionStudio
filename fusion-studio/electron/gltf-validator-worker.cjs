const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path');
const validator=require('gltf-validator');
const {MAX_BYTES,MAX_RESOURCES,hash,documentFromBytes,inventory}=require('./gltf-inspection.cjs');
const {readResource}=require('./gltf-resources.cjs');
async function inspect(){
 const start=performance.now(),{id,file,data,context}=workerData;
 let bytes;if(file){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Choose a regular glTF file below 64 MiB.');bytes=await fs.readFile(file);}else bytes=Buffer.from(data);
 if(bytes.length>MAX_BYTES||!bytes.length)throw Error('glTF inspection supports nonempty assets up to 64 MiB.');
 const sha256=hash(bytes),doc=documentFromBytes(bytes),summary=inventory(doc),resources=[],cache=new Map(),reasons=[];let total=bytes.length;
 const load=async uri=>{if(cache.has(uri))return cache.get(uri);if(!file)throw Error('External glTF resources are unavailable for an embedded scene.');if(resources.length>=MAX_RESOURCES)throw Error('glTF inspection supports at most 256 external resources.');const {bytes:data}=await readResource(path.dirname(file),uri);total+=data.length;if(total>MAX_BYTES)throw Error('glTF and its resources exceed 64 MiB.');resources.push({uri,bytes:data.length,sha256:hash(data)});cache.set(uri,data);return data;};
 // Enumerate all declared files, including resources the validator cannot decode.
 for(const item of [...(Array.isArray(doc.buffers)?doc.buffers:[]),...(Array.isArray(doc.images)?doc.images:[])])if(typeof item?.uri==='string'&&!item.uri.startsWith('data:')){try{await load(item.uri);}catch(error){reasons.push(error.message);}}
 const resourcesComplete=!reasons.length;
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:file?path.basename(file):'Fusion scene.glb',writeTimestamp:false,maxIssues:1000,externalResourceFunction:load});
 if(report.issues.numErrors)reasons.push(`${report.issues.numErrors} glTF specification error(s); see validation messages.`);
 if(report.issues.truncated)reasons.push('The validator reached its 1,000-message limit; inspection is incomplete.');
 for(const e of summary.extensions)if(e.outcome==='blocked')reasons.push('Required extension has no verified Fusion adapter: '+e.name+'.');
 const unknown=summary.extensions.filter(e=>!validator.supportedExtensions().includes(e.name)).map(e=>e.name);
 if(summary.assetVersion!=='2.0')reasons.push('Only glTF 2.0 is supported by this inspection route.');
 return {id,schema:1,sha256,assetHash:hash(JSON.stringify({sha256,resources})),bytes:bytes.length,totalBytes:total,context:context||null,complete:!report.issues.truncated&&resourcesComplete,blocked:reasons.length>0,reasons:[...new Set(reasons)],resources,summary,validator:{packageVersion:require('gltf-validator/package.json').version,version:validator.version(),unsupportedExtensions:unknown,...report},milliseconds:performance.now()-start};
}
inspect().then(result=>parentPort.postMessage({id:workerData.id,result}),error=>parentPort.postMessage({id:workerData.id,error:String(error.message||error)}));

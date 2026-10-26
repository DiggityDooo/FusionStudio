const fs=require('node:fs/promises'),path=require('node:path');
const {hash,MAX_BYTES}=require('./gltf-inspection.cjs');
function resourcePath(uri){
 if(typeof uri!=='string'||uri.length>4096)throw Error('Invalid glTF resource URI.');
 let decoded;try{decoded=decodeURIComponent(uri);}catch{throw Error('Invalid encoded glTF resource URI.');}
 if(!decoded||/[\x00-\x1f\\:#?]/.test(decoded)||decoded.startsWith('/')||decoded.split('/').some(p=>p==='..'||p==='.'||!p)||path.isAbsolute(decoded))throw Error('External resources must be ordinary relative files inside the selected model folder. Remote, absolute and parent paths are blocked.');
 return decoded;
}
async function readResource(directory,uri){
 const relative=resourcePath(uri),base=await fs.realpath(directory),file=await fs.realpath(path.join(base,relative)),rel=path.relative(base,file);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('glTF resource link leaves the selected model folder.');
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('glTF resource is not a regular file below 64 MiB.');
 const bytes=await fs.readFile(file);if(bytes.length>MAX_BYTES)throw Error('glTF resource exceeds 64 MiB.');return {bytes,relative};
}
// Copy only inspected bytes to a new private job directory. A source edit after
// review is rejected; Blender cannot fetch unreviewed external paths later.
async function snapshotGltf(source,report,directory){
 const bytes=await fs.readFile(source);if(hash(bytes)!==report.sha256)throw Error('The glTF source changed after inspection. Inspect it again.');
 const target=path.join(directory,'inspected-source');await fs.mkdir(target,{recursive:false});
 const primary=path.basename(source),input=path.join(target,primary);await fs.writeFile(input,bytes,{flag:'wx'});
 for(const r of report.resources){const {bytes:data,relative}=await readResource(path.dirname(source),r.uri);if(hash(data)!==r.sha256)throw Error('A glTF resource changed after inspection. Inspect it again.');const dest=path.join(target,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data,{flag:'wx'});}
 return input;
}
module.exports={resourcePath,readResource,snapshotGltf};

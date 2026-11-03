// Read-only provenance inventory. Outputs belong only to test-output.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function entry(file){if(!fs.existsSync(file))return {path:file,missing:true};const s=fs.statSync(file);return {path:path.resolve(file),bytes:s.size,mtimeMs:s.mtimeMs,sha256:sha(file)};}
function inventory(){
 const sources=[];const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='target'||e.name==='__pycache__')continue;const file=path.join(dir,e.name);if(e.isDirectory())visit(file);else if(e.isFile())sources.push(entry(file));}};
 for(const dir of ['src','electron','scripts','tests','native/src','native-cpp/src','docs'])if(fs.existsSync(path.join(root,dir)))visit(path.join(root,dir));
 for(const file of ['package.json','package-lock.json','native/Cargo.toml','native/Cargo.lock','native/fusion_geometry.node'])if(fs.existsSync(path.join(root,file)))sources.push(entry(path.join(root,file)));
 const originals=[];for(const file of ['../BMW27_2.blend/bmw27/bmw27_cpu.blend','../BMW27_2.blend/bmw27/bmw27_gpu.blend'])originals.push(entry(path.resolve(root,file)));
 for(const file of ['People/Genesis 8 Female/Genesis 8 Basic Female.duf','People/Genesis 8 Male/Genesis 8 Basic Male.duf','People/Genesis 9/Genesis 9.duf'])originals.push(entry(path.join('C:/Users/Public/Documents/My DAZ 3D Library',file)));
 const prior=JSON.parse(fs.readFileSync(path.join(root,'research/original-files-manifest.json'),'utf8'));
 const vendor=[];const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){if(typeof value.path==='string'&&fs.existsSync(value.path)&&fs.statSync(value.path).isFile())vendor.push(entry(value.path));else Object.values(value).forEach(walk);}};walk(prior);
 const releases=[];for(const dir of fs.readdirSync(root).filter(n=>/^release(?:-v.*)?$/.test(n)))for(const file of ['win-unpacked/resources/app.asar','win-unpacked/resources/app.asar.unpacked/native/fusion_geometry.node']){const p=path.join(root,dir,file);if(fs.existsSync(p))releases.push(entry(p));}
 const toolchains=[process.execPath,require('../electron/core.cjs').APPS[0].path,...['cargo/bin/cargo.exe','cargo/bin/rustc.exe','mingw64/bin/gcc.exe'].map(file=>path.join(root,'toolchains',file))].map(entry);
 return {schema:1,capturedAt:new Date().toISOString(),node:process.version,toolchains,gitStatus:cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}),sources,originals,vendor,releases};
}
if(require.main===module){const output=path.resolve(process.argv[2]||path.join(root,'test-output/rc-20261103/before.json'));if(!output.startsWith(path.join(root,'test-output')+path.sep))throw Error('Inventory output must stay in test-output.');fs.mkdirSync(path.dirname(output),{recursive:true});const result=inventory();fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({output,sources:result.sources.length,originals:result.originals.length,vendor:result.vendor.length,releases:result.releases.length}));}
module.exports={inventory,entry};

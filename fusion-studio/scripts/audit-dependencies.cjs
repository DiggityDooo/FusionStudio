const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
const packages=Object.entries(lock.packages).filter(([location])=>location).map(([location,item])=>{
 const manifest=path.join(root,location,'package.json');let installed=null;try{installed=JSON.parse(fs.readFileSync(manifest));}catch{}
 const name=installed?.name||location.split('node_modules/').at(-1);
 const licenseFiles=[];if(installed)for(const filename of fs.readdirSync(path.dirname(manifest))){if(!/^(licen[cs]es?|copying|notices?)([._-]|$)/i.test(filename))continue;const file=path.join(path.dirname(manifest),filename);if(fs.statSync(file).isFile())licenseFiles.push({path:path.relative(root,file).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}
 return {name,version:item.version,location,license:installed?.license||item.license||'UNKNOWN',developmentOnly:!!item.dev,installed:!!installed,licenseFiles};
});
const output=path.join(root,'docs','dependency-licenses.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),scope:'npm lockfile declarations plus installed package-root notice hashes; not a legal clearance or full binary-component audit',packages},null,2));
console.log(JSON.stringify({packages:packages.length,unknown:packages.filter(p=>p.license==='UNKNOWN').map(p=>p.name),output}));

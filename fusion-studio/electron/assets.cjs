const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const os=require('node:os');
const {IMPORTS}=require('./core.cjs');
// Default content roots are derived per machine: shared Public folders plus
// the current user's Documents. Never hardcode a specific user's profile.
const PUBLIC_DOCS=process.env.PUBLIC?path.join(process.env.PUBLIC,'Documents'):'C:\\Users\\Public\\Documents';
const USER_DOCS=path.join(os.homedir(),'Documents');
const DEFAULT_ROOTS=[
 ['DAZ',path.join(PUBLIC_DOCS,'My DAZ 3D Library')],
 ['DAZ',path.join(USER_DOCS,'DAZ 3D','Studio','My Library')],
 ['DAZ',path.join(USER_DOCS,'DAZ 3D','Studio','My Daz Connect Library')],
 ['Reallusion',path.join(PUBLIC_DOCS,'Reallusion','Reallusion Templates')],
 ['Reallusion',path.join(PUBLIC_DOCS,'Reallusion','Custom','Character Creator 5 Custom')],
 ['Projects',path.join(USER_DOCS,'Reallusion','DataLink')],
 ['Marvelous',path.join(PUBLIC_DOCS,'Marvelous Designer')],
];
const NATIVE=new Set(['.duf','.ccavatar','.iavatar','.ccproject','.zprj','.zpac']);
class AssetCatalog{
 constructor(){this.roots=DEFAULT_ROOTS.filter(([,dir])=>fs.existsSync(dir)).map(([vendor,directory])=>({vendor,directory}));this.assets=[];this.allowed=new Map();}
 async scan(){
  const assets=[];let directories=0,limited=false;
  const visit=async(dir,vendor,root,depth)=>{
   if(depth>15||assets.length>=60000||directories>=80000){limited=true;return;}directories++;
   let entries;try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch{return;}
   for(const entry of entries){if(assets.length>=60000){limited=true;break;}if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);
    if(entry.isDirectory()){if(!/^(data|Runtime|Textures|Support|Documentation|Render|Cache|temp|\.\w+)$/i.test(entry.name))await visit(file,vendor,root,depth+1);}
    else if(entry.isFile()){const ext=path.extname(entry.name).toLowerCase();if(!IMPORTS.has(ext)&&!NATIVE.has(ext))continue;
     const id=crypto.createHash('sha256').update(file).digest('hex').slice(0,24);let preview=null;
     for(const candidate of [file+'.png',file+'.jpg',file.slice(0,-ext.length)+'.png'])if(fs.existsSync(candidate)){preview=candidate;break;}
     const stat=await fs.promises.stat(file);assets.push({id,name:path.basename(file,ext),extension:ext,vendor,path:file,relative:path.relative(root,file),bytes:stat.size,native:NATIVE.has(ext),loadable:IMPORTS.has(ext)||ext==='.duf',preview});
    }
   }
  };
  for(const {vendor,directory} of this.roots)await visit(directory,vendor,directory,0);
  this.assets=assets.sort((a,b)=>a.name.localeCompare(b.name));this.allowed=new Map(this.assets.map(a=>[a.id,a]));return {assets:this.assets,roots:this.roots,limited,directories};
 }
 get(id){const asset=this.allowed.get(id);if(!asset)throw Error('Select a catalog asset first.');return asset;}
 addRoot(directory){if(!this.roots.some(r=>r.directory===directory))this.roots.push({vendor:'Your library',directory});}
 preview(id){const asset=this.get(id);if(!asset.preview)return null;const ext=path.extname(asset.preview).toLowerCase();return 'data:image/'+(ext==='.jpg'?'jpeg':'png')+';base64,'+fs.readFileSync(asset.preview).toString('base64');}
}
module.exports={AssetCatalog,DEFAULT_ROOTS};

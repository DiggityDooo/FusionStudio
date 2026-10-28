import * as THREE from 'three';

export const PAINT_CHANNELS=['baseColor','roughness','metallic','height','emissive','opacity','subsurface','anisotropy','clearcoat','sheen'];
export const LAYER_KINDS=['paint','fill','filter','mask'];
export const BLEND_MODES=['normal','multiply','overlay','add','screen'];
export const ENGINE_EXPORT_PRESETS={
 unreal:{label:'Unreal',maps:['baseColor','normal','roughness','metallic','emissive','opacity']},
 unity:{label:'Unity',maps:['baseColor','normal','metallicSmoothness','emissive','opacity']},
 gltf:{label:'glTF',maps:['baseColor','normal','metallicRoughness','emissive','occlusion']}
};

export function createPaintDocument(size=1024,{channels=['baseColor','roughness','metallic']}={}){
 if(![256,512,1024,2048,4096].includes(size))throw Error('Paint size must be 256–4096 power-of-two.');
 if(!channels.length||channels.some(c=>!PAINT_CHANNELS.includes(c)))throw Error('Invalid paint channels.');
 const doc={version:1,size,channels:[...channels],layers:[],activeLayer:null,udim:1001,materials:[]};
 addPaintLayer(doc,{name:'Base',kind:'fill',color:'#808080'});
 return doc;
}

export function addPaintLayer(doc,{name='Layer',kind='paint',color='#ffffff',opacity=1,blend='normal',channel='baseColor'}={}){
 if(doc.layers.length>=32)throw Error('At most 32 paint layers.');
 if(!LAYER_KINDS.includes(kind)||!BLEND_MODES.includes(blend))throw Error('Invalid layer kind/blend.');
 if(channel&&!doc.channels.includes(channel)&&channel!=='mask')throw Error('Channel not in document.');
 const layer={id:`L${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,name:String(name).slice(0,40),kind,color,opacity,blend,channel:channel||'baseColor',enabled:true,anchor:null,
  buffer:kind==='paint'||kind==='mask'?new Float32Array(doc.size*doc.size*4):null};
 if(kind==='fill'||kind==='paint')fillLayerBuffer(doc,layer,color,kind==='fill'?1:0);
 doc.layers.push(layer);doc.activeLayer=layer.id;return layer;
}

function hexRgb(hex){const n=parseInt(String(hex).slice(1),16);if(!Number.isFinite(n))throw Error('Color must be #rrggbb.');return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}

function fillLayerBuffer(doc,layer,color,alpha=1){
 if(!layer.buffer)return;const [r,g,b]=hexRgb(color);for(let i=0;i<layer.buffer.length;i+=4){layer.buffer[i]=r;layer.buffer[i+1]=g;layer.buffer[i+2]=b;layer.buffer[i+3]=alpha;}
}

export function paintStroke(doc,uv,{radius=.02,color='#c45c6a',strength=1,channel}={}){
 const layer=doc.layers.find(l=>l.id===doc.activeLayer);if(!layer?.buffer)throw Error('Active paint/mask layer required.');
 if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>!Number.isFinite(v)))throw Error('UV required.');
 if(!Number.isFinite(radius)||radius<=0||radius>.5||!Number.isFinite(strength)||strength<=0||strength>1)throw Error('Invalid stroke.');
 const [cr,cg,cb]=hexRgb(color),u=((uv[0]%1)+1)%1,v=((uv[1]%1)+1)%1;
 const cx=Math.floor(u*(doc.size-1)),cy=Math.floor((1-v)*(doc.size-1)),rPx=Math.max(1,Math.round(radius*doc.size));
 if(channel&&layer.channel!=='mask')layer.channel=channel;
 for(let y=cy-rPx;y<=cy+rPx;y++)for(let x=cx-rPx;x<=cx+rPx;x++){
  if(x<0||y<0||x>=doc.size||y>=doc.size)continue;const d=Math.hypot(x-cx,y-cy)/rPx;if(d>1)continue;
  const w=(1-d)*strength,i=(y*doc.size+x)*4;
  layer.buffer[i]=layer.buffer[i]*(1-w)+cr*w;layer.buffer[i+1]=layer.buffer[i+1]*(1-w)+cg*w;layer.buffer[i+2]=layer.buffer[i+2]*(1-w)+cb*w;
  layer.buffer[i+3]=Math.min(1,layer.buffer[i+3]+w);
 }
 return layer;
}

export function setLayerAnchor(doc,layerId,name){
 const layer=doc.layers.find(l=>l.id===layerId);if(!layer)throw Error('Layer missing.');
 layer.anchor=String(name||'').slice(0,40)||null;return layer;
}

export function compositePaint(doc,{channel='baseColor'}={}){
 const out=new Float32Array(doc.size*doc.size*4);out.fill(0);
 for(const layer of doc.layers){if(!layer.enabled||(layer.channel!==channel&&layer.kind!=='mask'))continue;
  if(layer.kind==='fill'){const [r,g,b]=hexRgb(layer.color),a=layer.opacity;for(let i=0;i<out.length;i+=4){out[i]=out[i]*(1-a)+r*a;out[i+1]=out[i+1]*(1-a)+g*a;out[i+2]=out[i+2]*(1-a)+b*a;out[i+3]=Math.min(1,out[i+3]+a);}}
  else if(layer.buffer){for(let i=0;i<out.length;i+=4){const a=layer.buffer[i+3]*layer.opacity;if(a<=0)continue;
   if(layer.blend==='multiply'){out[i]*=(1-a)+layer.buffer[i]*a;out[i+1]*=(1-a)+layer.buffer[i+1]*a;out[i+2]*=(1-a)+layer.buffer[i+2]*a;}
   else{out[i]=out[i]*(1-a)+layer.buffer[i]*a;out[i+1]=out[i+1]*(1-a)+layer.buffer[i+1]*a;out[i+2]=out[i+2]*(1-a)+layer.buffer[i+2]*a;}
   out[i+3]=Math.min(1,out[i+3]+a);}}
 }
 return out;
}

export function generateProceduralTexture(kind='noise',size=256,{seed=1,scale=8,colorA='#3a3a3a',colorB='#cfcfcf'}={}){
 if(!['noise','grunge','tiles','bricks','checker'].includes(kind))throw Error('Unknown procedural kind.');
 if(![64,128,256,512,1024].includes(size))throw Error('Invalid procedural size.');
 let s=seed>>>0||1;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const [ar,ag,ab]=hexRgb(colorA),[br,bg,bb]=hexRgb(colorB),data=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let t;if(kind==='noise'||kind==='grunge'){t=rnd();if(kind==='grunge')t=Math.pow(t,2.2);}
  else if(kind==='tiles'||kind==='checker'){const cx=Math.floor(x/(size/scale))%2,cy=Math.floor(y/(size/scale))%2;t=(cx^cy)?1:0;}
  else{const bx=x%(size/scale),by=y%(size/Math.max(2,scale/2));t=bx<2||by<2?0:.7+rnd()*.3;}
  const i=(y*size+x)*4;data[i]=(ar+(br-ar)*t)*255;data[i+1]=(ag+(bg-ag)*t)*255;data[i+2]=(ab+(bb-ab)*t)*255;data[i+3]=255;
 }
 return {kind,size,data,seed,scale};
}

export function smartMaskFromMesh(mesh,kind='curvature',size=128){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Smart mask needs a mesh.');
 if(!['curvature','ao','thickness','position','worldNormal'].includes(kind))throw Error('Unknown smart mask.');
 mesh.geometry.computeVertexNormals();const pos=mesh.geometry.attributes.position,nml=mesh.geometry.attributes.normal;
 const data=new Float32Array(size*size);data.fill(kind==='ao'?.5:0);
 // Sample by projecting vertex attributes into a rough UV occupancy (or spherical).
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  const u=Math.floor(((Math.atan2(z,x)/Math.PI+1)*.5)*(size-1)),v=Math.floor(((y+1)*.5)*(size-1));
  if(u<0||v<0||u>=size||v>=size)continue;
  let val=.5;if(kind==='worldNormal'&&nml)val=(nml.getY(i)+1)*.5;
  else if(kind==='position')val=(y+1)*.5;
  else if(kind==='curvature'&&nml)val=Math.min(1,Math.abs(nml.getX(i))+Math.abs(nml.getZ(i)));
  else if(kind==='ao')val=.35+.4*((nml?.getY(i)||0)+1)*.5;
  else if(kind==='thickness')val=.4;
  data[v*size+u]=val;
 }
 return {kind,size,data};
}

export function paintVertexColors(mesh,indices,color='#ff8800',{strength=1}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Vertex paint needs a mesh.');
 if(!Array.isArray(indices)||!indices.length)throw Error('Vertex indices required.');
 const [r,g,b]=hexRgb(color);let colors=mesh.geometry.attributes.color;
 if(!colors){colors=new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*3).fill(1),3);mesh.geometry.setAttribute('color',colors);}
 for(const i of indices){if(!Number.isInteger(i)||i<0||i>=colors.count)throw Error('Vertex index out of range.');
  colors.setXYZ(i,colors.getX(i)*(1-strength)+r*strength,colors.getY(i)*(1-strength)+g*strength,colors.getZ(i)*(1-strength)+b*strength);}
 colors.needsUpdate=true;if(mesh.material){mesh.material.vertexColors=true;mesh.material.needsUpdate=true;}
 return colors.count;
}

export function paintMaterialIds(mesh,faceIndices,id=1){
 if(!mesh?.isMesh||!mesh.geometry?.index)throw Error('Material ID paint needs indexed mesh.');
 if(!Number.isInteger(id)||id<0||id>255)throw Error('Material ID 0–255.');
 const index=mesh.geometry.index,groups=mesh.geometry.groups.length?mesh.geometry.groups:[{start:0,count:index.count,materialIndex:0}];
 // Store face IDs in userData map
 const map=mesh.userData.fusion_material_ids??=new Uint16Array(index.count/3);
 for(const f of faceIndices){if(!Number.isInteger(f)||f<0||f>=map.length)throw Error('Face index out of range.');map[f]=id;}
 void groups;return map;
}

export function bakeMeshMaps(mesh,size=128,{maps=['ao','curvature','position','normal']}={}){
 if(!mesh?.isMesh)throw Error('Bake needs a mesh.');
 if(![64,128,256,512,1024].includes(size))throw Error('Invalid bake size.');
 const out={};
 for(const m of maps){
  if(m==='normal'){out.normal=smartMaskFromMesh(mesh,'worldNormal',size);continue;}
  if(['ao','curvature','position','worldNormal','thickness'].includes(m)){out[m]=smartMaskFromMesh(mesh,m,size);continue;}
  throw Error('Unsupported bake map: '+m);
 }
 return {size,maps:out,cage:mesh.userData.fusion_bake_cage||null,rayDistance:mesh.userData.fusion_bake_ray||.05};
}

export function setBakeCage(mesh,{rayDistance=.05,cageScale=1.02}={}){
 if(!mesh?.isMesh)throw Error('Cage needs a mesh.');
 if(!Number.isFinite(rayDistance)||rayDistance<=0||rayDistance>1||!Number.isFinite(cageScale)||cageScale<1||cageScale>1.2)throw Error('Invalid cage settings.');
 mesh.userData.fusion_bake_cage={rayDistance,cageScale};mesh.userData.fusion_bake_ray=rayDistance;return mesh.userData.fusion_bake_cage;
}

export function highToLowBake(high,low,size=128){
 if(!high?.isMesh||!low?.isMesh)throw Error('High and low meshes required.');
 setBakeCage(low);return {version:1,size,from:high.uuid,to:low.uuid,maps:bakeMeshMaps(low,size).maps};
}

export function triplanarSample(point,normal,{scale=1}={}){
 if(!point||point.length!==3||!normal||normal.length!==3)throw Error('Point and normal XYZ required.');
 const ax=Math.abs(normal[0]),ay=Math.abs(normal[1]),az=Math.abs(normal[2]),sum=ax+ay+az||1;
 const u=(point[0]*scale*ay+point[2]*scale*ax+point[0]*scale*az)/sum,v=(point[1]*scale*az+point[2]*scale*ay+point[1]*scale*ax)/sum;
 return [((u%1)+1)%1,((v%1)+1)%1];
}

export function projectionPaint(doc,screenUV,{color='#ffffff',radius=.03,strength=.8}={}){
 return paintStroke(doc,screenUV,{color,radius,strength});
}

export function createSeamlessTile(size=256,{seed=3}={}){
 const tex=generateProceduralTexture('tiles',size,{seed,scale:8});
 for(let i=0;i<size;i++){
  for(const c of [0,1,2]){const top=(0*size+i)*4+c,bot=((size-1)*size+i)*4+c,avg=(tex.data[top]+tex.data[bot])*.5;tex.data[top]=tex.data[bot]=avg;}
  for(const c of [0,1,2]){const left=(i*size+0)*4+c,right=(i*size+(size-1))*4+c,avg=(tex.data[left]+tex.data[right])*.5;tex.data[left]=tex.data[right]=avg;}
 }
 tex.seamless=true;return tex;
}

export function buildTextureAtlas(images,{atlasSize=512,padding=2}={}){
 if(!Array.isArray(images)||!images.length||images.length>64)throw Error('Atlas needs 1–64 images.');
 if(![256,512,1024,2048].includes(atlasSize))throw Error('Invalid atlas size.');
 const cell=Math.floor(Math.sqrt(images.length)),tile=Math.floor((atlasSize-padding*(cell+1))/cell);
 const data=new Uint8ClampedArray(atlasSize*atlasSize*4),rects=[];
 images.forEach((img,i)=>{const x=(i%cell)*(tile+padding)+padding,y=Math.floor(i/cell)*(tile+padding)+padding;rects.push({i,x,y,w:tile,h:tile});
  const src=img.data||img;for(let py=0;py<tile;py++)for(let px=0;px<tile;px++){
   const sx=Math.floor(px/tile*(img.size||tile)),sy=Math.floor(py/tile*(img.size||tile)),si=(sy*(img.size||tile)+sx)*4,di=((y+py)*atlasSize+x+px)*4;
   if(si+3<src.length){data[di]=src[si];data[di+1]=src[si+1];data[di+2]=src[si+2];data[di+3]=src[si+3];}}});
 return {size:atlasSize,data,rects,padding};
}

export function exportEngineMaps(doc,engine='gltf'){
 const preset=ENGINE_EXPORT_PRESETS[engine];if(!preset)throw Error('Unknown engine preset.');
 const maps={};for(const name of preset.maps){
  if(name==='metallicRoughness'||name==='metallicSmoothness'){const m=compositePaint(doc,{channel:'metallic'}),r=compositePaint(doc,{channel:'roughness'});maps[name]={metallic:m,roughness:r};}
  else if(doc.channels.includes(name)||name==='baseColor')maps[name]=compositePaint(doc,{channel:name==='baseColor'?'baseColor':name});
  else maps[name]=null;
 }
 return {engine,label:preset.label,size:doc.size,maps};
}

export function listMaterialLibrary(){
 return [
  {id:'steel',label:'Steel',preset:'metal'},{id:'skin',label:'Skin',preset:'skin'},{id:'fabric',label:'Fabric',preset:'fabric'},
  {id:'plastic',label:'Plastic',preset:'plastic'},{id:'glass',label:'Glass',preset:'glass'},{id:'rubber',label:'Rubber',preset:'rubber'}
 ];
}

export function applyPaintDocToMesh(mesh,doc,{channel='baseColor'}={}){
 if(!mesh?.isMesh)throw Error('Mesh required.');
 const rgba=compositePaint(doc,{channel}),data=new Uint8Array(doc.size*doc.size*4);
 for(let i=0;i<rgba.length;i++)data[i]=Math.round(Math.min(1,Math.max(0,rgba[i]))*255);
 const tex=new THREE.DataTexture(data,doc.size,doc.size);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
 const mat=mesh.material||new THREE.MeshStandardMaterial();if(channel==='baseColor'){mat.map=tex;mat.needsUpdate=true;mesh.material=mat;}
 mesh.userData.fusion_paint=doc;return tex;
}

import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {fitHairGuides,scalpStrandGuides} from './creator-hair.js';
import {createEyeSurfaces} from './creator-eyes.js';
const cache=new WeakMap();
const skinShaders=new WeakMap();
export function configureSkinPreview(material,settings){
 material.specularIntensity=.35;material.clearcoat=0;
 material.onBeforeCompile=shader=>{shader.uniforms.fusionFreckles={value:material.userData.fusion_character_material.freckles||0};shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float fusionFreckles;');shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 #ifdef USE_MAP
 vec2 cell=floor(vMapUv*800.0);float dotNoise=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);float spot=step(.987, dotNoise)*fusionFreckles;diffuseColor.rgb*=mix(vec3(1.0),vec3(.40,.25,.18),spot*.7);
 #endif`);skinShaders.set(material,shader);};material.customProgramCacheKey=()=> 'fusion-skin-preview-v1';const shader=skinShaders.get(material);if(shader)shader.uniforms.fusionFreckles.value=settings.freckles;
}
const V=()=>new THREE.Vector3();
function mean(source,positions,key){const ids=source.landmarks[key],v=V();for(const id of ids)v.add(V().fromArray(positions,id*3));return v.divideScalar(ids.length);}
function dispose(group){group.traverse(n=>{n.geometry?.dispose();for(const m of [].concat(n.material||[])){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});group.removeFromParent();}
function sphere(name,center,radius,material,parent){const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),material);mesh.name=name;mesh.position.copy(center);mesh.castShadow=true;parent.add(mesh);return mesh;}
function hairMaterial(color,kind='hair'){const m=new THREE.MeshPhysicalMaterial({color,roughness:.62,anisotropy:.5,specularIntensity:.3});m.name='Fusion '+kind;m.userData.fusion_character_material={version:1,kind};return m;}
function tubes(paths,radius,material,name,parent){if(!paths.length)return;const pieces=paths.map(points=>{const curve=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(curve,Math.min(48,Math.max(12,points.length*2)),radius,3,false),p=g.attributes.position;for(let i=0;i<p.count;i++){const t=g.attributes.uv.getX(i),center=curve.getPointAt(t),point=V().fromBufferAttribute(p,i);point.sub(center).multiplyScalar(1-.9*t*t).add(center);p.setXYZ(i,...point.toArray());}g.computeVertexNormals();return g;});const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());if(material.userData.fusion_character_material.roots){const colors=[],root=new THREE.Color(material.userData.fusion_character_material.roots),tip=material.color.clone();for(let i=0;i<geometry.attributes.position.count;i++){const t=Math.min(1,geometry.attributes.uv.getX(i)*3);colors.push(...root.clone().lerp(tip,t).toArray());}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));material.vertexColors=true;material.color.set('white');}const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;parent.add(mesh);return mesh;}
function strands(paths,material,name,parent){ // paths are flat xyz arrays from fitHairGuides
 const samples=(paths[0]?.length||0)/3;if(!samples)return;const vertices=paths.length*samples*2,p=new Float32Array(vertices*3),colors=new Float32Array(vertices*3),normals=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),indices=new Uint32Array(paths.length*(samples-1)*6),rootColor=new THREE.Color(material.userData.fusion_character_material.roots),tipColor=material.color.clone();let face=0;
 paths.forEach((path,j)=>{let rx=Math.sin(j*2.4),ry=.37,rz=Math.cos(j*2.4);const rn=Math.sqrt(rx*rx+ry*ry+rz*rz);rx/=rn;ry/=rn;rz/=rn;for(let i=0;i<samples;i++){const t=i/(samples-1),o=i*3,no=Math.min(i+1,samples-1)*3,po=Math.max(i-1,0)*3;let dx=path[no]-path[po],dy=path[no+1]-path[po+1],dz=path[no+2]-path[po+2];const dn=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;dx/=dn;dy/=dn;dz/=dn;let wx=dy*rz-dz*ry,wy=dz*rx-dx*rz,wz=dx*ry-dy*rx;const wn=Math.sqrt(wx*wx+wy*wy+wz*wz)||1;wx/=wn;wy/=wn;wz/=wn; // ribbon normal = tangent x width dir (both unit, perpendicular)
 const nx=dy*wz-dz*wy,ny=dz*wx-dx*wz,nz=dx*wy-dy*wx,scale=.00026*(1-.96*t*t);wx*=scale;wy*=scale;wz*=scale;const blend=Math.min(1,t*3),red=rootColor.r+(tipColor.r-rootColor.r)*blend,green=rootColor.g+(tipColor.g-rootColor.g)*blend,blue=rootColor.b+(tipColor.b-rootColor.b)*blend,at=(j*samples+i)*2;for(let side=0;side<2;side++){const xyz=(at+side)*3,tex=(at+side)*2,sign=side?1:-1;p[xyz]=path[o]+wx*sign;p[xyz+1]=path[o+1]+wy*sign;p[xyz+2]=path[o+2]+wz*sign;colors[xyz]=red;colors[xyz+1]=green;colors[xyz+2]=blue;normals[xyz]=nx;normals[xyz+1]=ny;normals[xyz+2]=nz;uv[tex]=t;uv[tex+1]=side;}if(i<samples-1){indices[face++]=at;indices[face++]=at+1;indices[face++]=at+2;indices[face++]=at+1;indices[face++]=at+3;indices[face++]=at+2;}}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('normal',new THREE.BufferAttribute(normals,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(new THREE.BufferAttribute(indices,1));g.computeBoundingSphere();material.vertexColors=true;material.color.set('white');material.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=true;mesh.userData.fusion_hair_preview={version:1,strands:paths.length,binding:'seeded barycentric scalp',approximation:'two-sided strand ribbons; no strand collision'};parent.add(mesh);return mesh;
}
let irisPixels;
function irisDetail(){const size=256,data=irisPixels||new Uint8Array(size*size*4);if(!irisPixels){for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=(x-size/2)/(size/2),dy=(y-size/2)/(size/2),r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),fiber=Math.sin(angle*173+Math.sin(angle*67)*2+r*17)*.16+Math.sin(angle*311+r*8)*.08,ring=.68+.15*Math.sin(r*34),edge=1-Math.max(0,(r-.8)*4),value=Math.max(.08,Math.min(1,(ring+fiber)*edge)),i=(y*size+x)*4;data[i]=value*255;data[i+1]=value*245;data[i+2]=value*225;data[i+3]=255;}irisPixels=data;}const texture=new THREE.DataTexture(data.slice(),size,size);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;return texture;}
function frontSurface(source,positions,x,y,fallback){let z=-Infinity;const ids=source.triangles;for(let i=0;i<ids.length;i+=3){const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3,ax=positions[a],ay=positions[a+1],bx=positions[b],by=positions[b+1],cx=positions[c],cy=positions[c+1],det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<1e-12)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det;if(u>=0&&v>=0&&u+v<=1)z=Math.max(z,u*positions[a+2]+v*positions[b+2]+(1-u-v)*positions[c+2]);}return Number.isFinite(z)?z:fallback;}
export function updateCreatorAttachments(root,positions){
 const c=root.userData.fusion_creator,d=c.definition,s=d.source,r=c.recipe,a=r.appearance,head=root.getObjectByName('head'),body=root.getObjectByName('Body');if(!head||!s.landmarks)return;
 const existing=root.getObjectByName('Creator attachments'),previous=cache.get(root)||existing?.userData.fusion_attachment_key,parts=[r.sex,r.controls,r.shapes.map(s=>[s.id,s.value,s.deltas]),r.hair,r.visibility,a.eye,a.hair,a.roots,a.grey,root.userData.fusion_skin_edit?.revision||0],key=JSON.stringify(a.version===2?[{appearanceVersion:2},...parts]:parts);let derivedMissing=false;existing?.traverse(n=>{if(n.geometry?.userData.fusion_derived_creator_hair)derivedMissing=true;});if(previous===key&&!derivedMissing)return;
 const identities=[],retain=n=>identities.push({uuid:n.uuid,geometry:n.geometry?.uuid,material:n.material?.uuid,map:n.material?.map?.uuid,source:n.material?.map?.source?.uuid});if(derivedMissing){existing.traverse(retain);const coverage=root.getObjectByName('Creator coverage');if(coverage)retain(coverage);}
 const old=root.getObjectByName('Creator attachments'),oldCoverage=root.getObjectByName('Creator coverage'),group=new THREE.Group();let coverage=null;group.name='Creator attachments';group.userData={fusion_creator_part:'attachments',fusion_attachment_key:key};
 try{
 const headPoint=mean(s,positions,'joint-head'),eyes=['joint-l-eye','joint-r-eye'].map(k=>mean(s,positions,k)),eyeDistance=eyes[0].distanceTo(eyes[1]),radius=eyeDistance*.205;
 for(const [i,point] of eyes.entries()){
  if(a.version===2){
   const center=point.clone().sub(headPoint),surfaces=createEyeSurfaces(radius),materials={
    sclera:new THREE.MeshPhysicalMaterial({color:'#e3dfd8',roughness:.25}),
    iris:new THREE.MeshPhysicalMaterial({color:a.eye,roughness:.35,map:irisDetail()}),
    pupil:new THREE.MeshStandardMaterial({color:'#010202',roughness:1}),
    cornea:new THREE.MeshPhysicalMaterial({color:'white',roughness:.025,transmission:1,thickness:surfaces.dimensions.thickness,ior:1.376,attenuationDistance:1,side:THREE.DoubleSide})
   };
   for(const kind of ['sclera','iris','pupil','cornea']){const material=materials[kind],mesh=new THREE.Mesh(surfaces[kind],material);material.name=kind[0].toUpperCase()+kind.slice(1);material.userData.fusion_character_material={version:1,kind,appearanceVersion:2};mesh.name=(kind==='sclera'?'Eye':material.name)+' '+i;mesh.position.copy(center);mesh.userData.fusion_eye_surface={version:2,part:kind,radius};if(kind==='iris')mesh.userData.fusion_creator_part='iris';mesh.castShadow=kind!=='cornea';group.add(mesh);}
  }else{
  const center=point.clone().sub(headPoint),sclera=new THREE.MeshPhysicalMaterial({color:'#e3dfd8',roughness:.25});sclera.name='Sclera';sclera.userData.fusion_character_material={version:1,kind:'sclera'};sphere('Eye '+i,center,radius,sclera,group);
  const irisMat=new THREE.MeshPhysicalMaterial({color:a.eye,roughness:.3,map:irisDetail()});irisMat.name='Iris';irisMat.userData.fusion_character_material={version:1,kind:'iris'};
  const iris=new THREE.Mesh(new THREE.CircleGeometry(radius*.5,64),irisMat);iris.position.copy(center).add(V().set(0,0,radius*.99));iris.userData.fusion_creator_part='iris';group.add(iris);
  const pupil=new THREE.Mesh(new THREE.SphereGeometry(radius*.21,32,16),new THREE.MeshStandardMaterial({color:'#070909',roughness:.2}));pupil.scale.z=.1;pupil.position.copy(center).add(V().set(0,0,radius*1.025));pupil.name='Pupil';group.add(pupil);
  const cornea=new THREE.MeshPhysicalMaterial({color:'white',roughness:.035,transmission:1,thickness:.001,ior:1.376,attenuationDistance:1});cornea.name='Cornea';cornea.userData.fusion_character_material={version:1,kind:'cornea'};sphere('Cornea '+i,center,radius*1.012,cornea,group).castShadow=false;
  }
  if(s.hair)continue;
  const browPaths=[];for(let j=0;j<60;j++){const t=j/59-.5,x=point.x+t*radius*2.7,y=point.y+radius*(1.8-.35*Math.abs(t)),z=frontSurface(s,positions,x,y,point.z)+.0007,p=V().set(x,y,z).sub(headPoint);browPaths.push([p,p.clone().add(V().set(i?-.001:.001,.002,.0003)),p.clone().add(V().set(i?-.003:.003,.003,0))]);}tubes(browPaths,.00018,hairMaterial(a.hair,'brows'),'Eyebrows '+i,group);
  const lashPaths=[];for(let j=0;j<35;j++){const t=j/34*Math.PI,x=point.x+Math.cos(t)*radius*.98,y=point.y+Math.sin(t)*radius*.63,z=frontSurface(s,positions,x,y,point.z+radius*.6)+.0004,p=V().set(x,y,z).sub(headPoint);lashPaths.push([p,p.clone().add(V().set(Math.cos(t)*.001,.0015,.0015)),p.clone().add(V().set(Math.cos(t)*.002,.002,.003))]);}tubes(lashPaths,.00009,hairMaterial(a.hair,'brows'),'Eyelashes '+i,group);
 }
 if(s.hair){
  const flatPaths=(guides,settings={})=>fitHairGuides({positions,guides,...settings}).paths.map(path=>{for(let i=0;i<path.length;i+=3){path[i]-=headPoint.x;path[i+1]-=headPoint.y;path[i+2]-=headPoint.z;}return path;});
  const tubePaths=(guides,settings={})=>flatPaths(guides,settings).map(path=>Array.from({length:path.length/3},(_,i)=>V().fromArray(path,i*3)));
  tubes(tubePaths(s.hair.styles.brows,{density:2}),.00010,hairMaterial(a.hair,'brows'),'Authored eyebrows',group);
  for(const kind of ['lashes-upper','lashes-lower'])tubes(tubePaths(s.hair.styles[kind],{density:1}),.000055,hairMaterial(a.hair,'brows'),'Authored '+kind,group);
  if(r.hair.style!=='bald'){
   const source=['short','curly','coily'].includes(r.hair.style)?'short':'long',length=r.hair.length*(r.hair.style==='medium'?.6:1),grey=new THREE.Color(a.hair).lerp(new THREE.Color('#c1bbb3'),a.grey),material=hairMaterial(grey);material.userData.fusion_character_material={version:1,kind:'hair',roots:a.roots,grey:a.grey};
   const fitted=flatPaths(scalpStrandGuides(s,source),{length,volume:r.hair.volume,offset:r.hair.offset,curl:['wavy','curly','coily'].includes(r.hair.style)?r.hair.style:'straight',density:1});
   strands(fitted,material,'Hairstyle · '+r.hair.style,group);
  }
  if(r.hair.facial&&r.hair.facial!=='none'){const material=hairMaterial(new THREE.Color(a.hair).lerp(new THREE.Color('#c1bbb3'),a.grey));tubes(tubePaths(s.hair.styles[r.hair.facial],{density:2}),.00010,material,'Facial hair · '+r.hair.facial,group);}
 }
 // Compatibility fallback for the earlier development-only foundation.
 if(!s.hair&&r.hair.style!=='bald'){
  const ids=[...new Set(s.cornerSource)],eyeY=(eyes[0].y+eyes[1].y)/2,center=V().set(0,headPoint.y+.04,headPoint.z-.012),roots=ids.filter(id=>{const p=V().fromArray(positions,id*3);return p.y>eyeY+.018&&p.y<headPoint.y+.2&&Math.abs(p.x)<eyeDistance*1.8&&(p.z<eyes[0].z-.005||p.y>eyeY+.075);}),paths=[],lengths={short:.018,medium:.10,long:.30,wavy:.23,curly:.12,coily:.055},length=lengths[r.hair.style]*r.hair.length;
  for(let j=0;j<roots.length;j+=Math.max(1,Math.floor(roots.length/650))){const p=V().fromArray(positions,roots[j]*3),normal=p.clone().sub(center).normalize(),rootPoint=p.clone().addScaledVector(normal,.001+r.hair.offset),phase=j*2.39996,points=[];
   for(let k=0;k<=12;k++){const t=k/12,point=rootPoint.clone().addScaledVector(normal,Math.sin(t*Math.PI*.6)*length*.5*r.hair.volume);point.y-=t*t*length*(r.hair.style==='short'?.1:.85);point.z-=t*length*.2;const curl=['wavy','curly','coily'].includes(r.hair.style)?Math.sin(t*Math.PI*(r.hair.style==='wavy'?3:10)+phase)*length*.13*t:0;point.x+=curl;point.z+=Math.cos(t*20+phase)*Math.abs(curl);points.push(point.sub(headPoint));}paths.push(points);
  }
  const grey=new THREE.Color(a.hair).lerp(new THREE.Color('#c1bbb3'),a.grey),material=hairMaterial(grey);material.userData.fusion_character_material={version:1,kind:'hair',roots:a.roots,grey:a.grey};tubes(paths,r.hair.style==='coily'?.0012:.00065,material,'Hairstyle · '+r.hair.style,group);
 }
 if(r.visibility.clothing!=='nude'||!r.visibility.anatomy){
  const h=r.controls.height,src=body.geometry,ids=src.attributes._fusion_source_vertex,index=src.index.array,points=[],weights=[],bones=[];
  for(let t=0;t<index.length;t+=3){const triangle=Array.from(index.slice(t,t+3)),p=triangle.map(i=>V().fromArray(positions,ids.getX(i)*3)),y=p.reduce((sum,v)=>sum+v.y,0)/3,x=p.reduce((sum,v)=>sum+Math.abs(v.x),0)/3,z=p.reduce((sum,v)=>sum+v.z,0)/3;
   const hip=y>h*.43&&y<h*.55&&x<h*.16,chest=r.sex==='female'&&y>h*.67&&y<h*.78&&x<h*.15;
   const clothed=r.visibility.clothing==='clothed'&&y>h*.43&&y<h*.8&&x<h*.18;
   if(!(hip||chest||clothed))continue;for(let j=0;j<3;j++){const i=triangle[j],normal=V().fromBufferAttribute(src.attributes.normal,i);points.push(...p[j].addScaledVector(normal,.0025).toArray());weights.push(...Array.from(src.attributes.skinWeight.array.slice(i*4,i*4+4)));bones.push(...Array.from(src.attributes.skinIndex.array.slice(i*4,i*4+4)));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(bones,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.computeVertexNormals();const m=new THREE.MeshStandardMaterial({color:'#343b46',roughness:.92,side:THREE.DoubleSide}),mesh=new THREE.SkinnedMesh(g,m);mesh.name='Creator coverage';mesh.userData.fusion_creator_part='coverage';mesh.bind(body.skeleton,body.bindMatrix);mesh.castShadow=true;coverage=mesh;
 }
 if(derivedMissing){let at=0;const restore=n=>{const prior=identities[at++];if(!prior)return;n.uuid=prior.uuid;if(n.geometry&&prior.geometry)n.geometry.uuid=prior.geometry;if(n.material&&prior.material)n.material.uuid=prior.material;if(n.material?.map&&prior.map){n.material.map.uuid=prior.map;n.material.map.source.uuid=prior.source;}};group.traverse(restore);if(coverage)restore(coverage);}
 }catch(error){dispose(group);if(coverage)dispose(coverage);throw error;}
 const replace=(previous,next,parent)=>{const index=previous?.parent===parent?parent.children.indexOf(previous):-1;if(previous)dispose(previous);if(next){parent.add(next);if(index>=0){parent.children.splice(parent.children.indexOf(next),1);parent.children.splice(index,0,next);}}};
 replace(old,group,head);replace(oldCoverage,coverage,root);
 cache.set(root,key);
}
export async function loadCreatorSkin(root,{signal}={}){
 if(typeof document==='undefined')return;const {recipe:r}=root.userData.fusion_creator,loader=new THREE.TextureLoader(),base=new URL(/* @vite-ignore */ '../characters/skins/',import.meta.url).href.replace('/src/../characters/','/characters/');
 const results=await Promise.allSettled([loader.loadAsync(base+r.sex+'-detail.jpg'),loader.loadAsync(base+r.sex+'-bump.png')]);if(signal?.aborted||results.some(result=>result.status==='rejected')){for(const result of results)if(result.status==='fulfilled')result.value.dispose();if(signal?.aborted)throw Error('Character texture loading cancelled.');throw Error('Character skin textures are missing. Relink the matching starter skin assets.');}const [map,bump]=results.map(result=>result.value);map.colorSpace=THREE.SRGBColorSpace;map.flipY=true;bump.flipY=true;const material=root.getObjectByName('Body').material;material.map=map;material.bumpMap=bump;material.bumpScale=.0001+r.appearance.pores*.00045+r.appearance.ageDetail*.0001;material.needsUpdate=true;
}

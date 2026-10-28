import * as THREE from 'three';
import {fractalNoise,voronoi3,generateCityBlock,generateRoadSpline,scatterOnMesh,instanceOnPoints,realizeInstances} from './geometry-nodes.js';
import {hydraulicErosion,thermalErosion} from './terrain-erosion.js';
import {sunPosition,sunDirection,daylightFactor} from './solar.js';

const rnd=(seed)=>{let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};

export function createHeightfield({res=64,size=20,seed=1,octaves=4,height=3,erosion=0}={}){
 if(!Number.isInteger(res)||res<8||res>256||!Number.isFinite(size)||size<=0||size>1000)throw Error('Invalid heightfield.');
 if(!Number.isFinite(erosion)||erosion<0||erosion>1)throw Error('Erosion 0–1.');
 const data=new Float32Array(res*res);
 for(let y=0;y<res;y++)for(let x=0;x<res;x++){
  const u=x/(res-1),v=y/(res-1);
  let h=fractalNoise(u*2,v*2,0,{octaves,seed})*.5+.5;h=Math.pow(h,1+erosion)*height;
  data[y*res+x]=h;
 }
 if(erosion>0){const next=data.slice();for(let y=1;y<res-1;y++)for(let x=1;x<res-1;x++){const i=y*res+x;next[i]=(data[i]*2+data[i-1]+data[i+1]+data[i-res]+data[i+res])/6;}data.set(next);}
 const geo=new THREE.PlaneGeometry(size,size,res-1,res-1);geo.rotateX(-Math.PI/2);
 const pos=geo.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,data[i]);
 pos.needsUpdate=true;geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#5a7a4a',roughness:.95,flatShading:false}));
 mesh.name='Terrain';mesh.userData.fusion_terrain={res,size,seed,height,erosion,splat:createSplatMap(res)};return mesh;
}

export function createSplatMap(res=64){
 const layers=['grass','dirt','rock','snow'];const data={};
 for(const L of layers)data[L]=new Float32Array(res*res);
 for(let i=0;i<res*res;i++){data.grass[i]=.7;data.dirt[i]=.2;data.rock[i]=.1;data.snow[i]=0;}
 return {version:1,res,layers,data};
}

export function paintTerrainSplat(terrain,u,v,{layer='grass',radius=.05,strength=.5}={}){
 const splat=terrain.userData.fusion_terrain?.splat;if(!splat)throw Error('Terrain splat missing.');
 if(!splat.layers.includes(layer))throw Error('Unknown splat layer.');
 if([u,v,radius,strength].some(x=>!Number.isFinite(x))||u<0||u>1||v<0||v>1||radius<=0||radius>.5||strength<=0||strength>1)throw Error('Invalid splat stroke.');
 const res=splat.res,cx=Math.floor(u*(res-1)),cy=Math.floor(v*(res-1)),r=Math.max(1,Math.round(radius*res));
 for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
  if(x<0||y<0||x>=res||y>=res)continue;const d=Math.hypot(x-cx,y-cy)/r;if(d>1)continue;const w=(1-d)*strength,i=y*res+x;
  for(const L of splat.layers)splat.data[L][i]*=1-w;splat.data[layer][i]+=w;
 }
 return splat;
}

export function sculptTerrain(terrain,u,v,{amount=.2,radius=.08}={}){
 const t=terrain.userData.fusion_terrain;if(!t)throw Error('Not a terrain.');
 if(!Number.isFinite(amount)||Math.abs(amount)>5||!Number.isFinite(radius)||radius<=0||radius>.5)throw Error('Invalid sculpt.');
 const res=t.res,pos=terrain.geometry.attributes.position,cx=Math.floor(u*(res-1)),cy=Math.floor(v*(res-1)),r=Math.max(1,Math.round(radius*res));
 for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
  if(x<0||y<0||x>=res||y>=res)continue;const d=Math.hypot(x-cx,y-cy)/r;if(d>1)continue;const i=y*res+x;pos.setY(i,pos.getY(i)+amount*(1-d));
 }
 pos.needsUpdate=true;terrain.geometry.computeVertexNormals();return terrain;
}

export function getTerrainHeights(terrain){
 const t=terrain?.userData?.fusion_terrain;if(!t)throw Error('Not a terrain.');
 const pos=terrain.geometry.attributes.position,heights=new Float32Array(t.res*t.res);
 for(let i=0;i<heights.length;i++)heights[i]=pos.getY(i);
 return heights;
}

/**
 * Erode a terrain mesh with the verified kernels (src/terrain-erosion.js):
 * 'hydraulic' droplet erosion (returns the sediment audit), 'thermal'
 * talus relaxation, or 'both'. Writes heights back and recomputes normals.
 */
export function applyTerrainErosion(terrain,{method='hydraulic',droplets=1500,seed=5,talus=.08,iterations=120}={}){
 const t=terrain?.userData?.fusion_terrain;if(!t)throw Error('Not a terrain.');
 if(!['hydraulic','thermal','both'].includes(method))throw Error('Unknown erosion method.');
 const heights=getTerrainHeights(terrain);
 let audit={eroded:0,deposited:0,exported:0};
 if(method!=='thermal')audit=hydraulicErosion(heights,t.res,{droplets,seed});
 if(method!=='hydraulic')thermalErosion(heights,t.res,{talus,maxIterations:iterations});
 const pos=terrain.geometry.attributes.position;
 for(let i=0;i<heights.length;i++)pos.setY(i,heights[i]);
 pos.needsUpdate=true;terrain.geometry.computeVertexNormals();
 return {...audit,method};
}

export function generateTree({seed=1,trunkHeight=1.2,levels=3}={}){
 if(!Number.isInteger(levels)||levels<1||levels>5)throw Error('Tree levels 1–5.');
 const r=rnd(seed),group=new THREE.Group();group.name='Tree';
 const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,trunkHeight,6),new THREE.MeshStandardMaterial({color:'#5c4033'}));
 trunk.position.y=trunkHeight/2;group.add(trunk);
 for(let i=0;i<levels;i++){const s=.35+r()*.25-(i*.05),y=trunkHeight*(.45+i*.18);
  const canopy=new THREE.Mesh(new THREE.IcosahedronGeometry(s,0),new THREE.MeshStandardMaterial({color:'#3d7a45'}));canopy.position.set((r()-.5)*.2,y,(r()-.5)*.2);group.add(canopy);}
 group.userData.fusion_plant={kind:'tree',seed};return group;
}

export function scatterFoliage(terrain,{count=40,seed=2,prototype='tree'}={}){
 if(!terrain?.userData?.fusion_terrain)throw Error('Foliage needs terrain.');
 if(!Number.isInteger(count)||count<1||count>2000)throw Error('Count 1–2000.');
 const pts=scatterOnMesh(terrain,{count,seed}),group=new THREE.Group();group.name='Foliage';
 const r=rnd(seed);
 for(const p of pts.points){const plant=prototype==='rock'?generateRock({seed:seed+Math.floor(r()*1e6)}):generateTree({seed:seed+Math.floor(r()*1e6),trunkHeight:.6+r()*.8,levels:2+Math.floor(r()*2)});
  plant.position.fromArray(p);plant.scale.setScalar(.6+r()*.8);group.add(plant);}
 group.userData.fusion_foliage={count:group.children.length,seed,wind:0};return group;
}

export function applyVegetationWind(foliage,{strength=.15,time=0}={}){
 if(!foliage?.userData?.fusion_foliage)throw Error('Foliage group required.');
 if(!Number.isFinite(strength)||strength<0||strength>2||!Number.isFinite(time))throw Error('Invalid wind.');
 foliage.userData.fusion_foliage.wind=strength;
 foliage.children.forEach((c,i)=>{c.rotation.z=Math.sin(time*2+i)*.05*strength;c.rotation.x=Math.cos(time*1.7+i)*.03*strength;});
 return foliage;
}

export function generateRock({seed=4,size=.4}={}){
 const r=rnd(seed),geo=new THREE.IcosahedronGeometry(size,1);const pos=geo.attributes.position;
 for(let i=0;i<pos.count;i++){const n=1+(r()-.5)*.35;pos.setXYZ(i,pos.getX(i)*n,pos.getY(i)*n,pos.getZ(i)*n);}
 pos.needsUpdate=true;geo.computeVertexNormals();
 const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#7a7a72',roughness:.92}));mesh.name='Rock';mesh.userData.fusion_kitbash={kind:'rock',seed};return mesh;
}

export function scatterRocks(terrain,{count=20,seed=3}={}){
 const pts=scatterOnMesh(terrain,{count,seed}),group=new THREE.Group();group.name='Rocks';const r=rnd(seed);
 for(const p of pts.points){const rock=generateRock({seed:seed+Math.floor(r()*1e5),size:.2+r()*.4});rock.position.fromArray(p);rock.rotation.y=r()*Math.PI*2;group.add(rock);}
 return group;
}

export function createWaterBody({kind='lake',size=8}={}){
 if(!['lake','ocean','river'].includes(kind))throw Error('Unknown water kind.');
 if(!Number.isFinite(size)||size<=0||size>500)throw Error('Invalid size.');
 const geo=kind==='river'?new THREE.PlaneGeometry(size*.25,size,1,8):new THREE.PlaneGeometry(size,size,32,32);
 geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;
 if(kind==='ocean'||kind==='lake')for(let i=0;i<pos.count;i++)pos.setY(i,Math.sin(pos.getX(i)*.8)*.05+Math.cos(pos.getZ(i)*.6)*.04);
 pos.needsUpdate=true;geo.computeVertexNormals();
 const mat=new THREE.MeshPhysicalMaterial({color:kind==='ocean'?'#1a4a6a':'#2a6a7a',roughness:.15,metalness:.05,transmission:.55,thickness:.4,transparent:true,opacity:.9});
 const mesh=new THREE.Mesh(geo,mat);mesh.name=kind[0].toUpperCase()+kind.slice(1);mesh.userData.fusion_water={kind,size};return mesh;
}

export function createSkyAtmosphere({timeOfDay=15,cloudiness=.3,weather='clear',latitude=40,dayOfYear=172}={}){
 if(!Number.isFinite(timeOfDay)||timeOfDay<0||timeOfDay>24||!Number.isFinite(cloudiness)||cloudiness<0||cloudiness>1)throw Error('Invalid sky.');
 if(!['clear','cloudy','rain','fog','snow'].includes(weather))throw Error('Unknown weather.');
 if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isInteger(dayOfYear)||dayOfYear<1||dayOfYear>365)throw Error('Invalid latitude/day.');
 // Real solar position (src/solar.js): timeOfDay is local solar time.
 const solar=sunPosition({latitude,dayOfYear,solarTime:timeOfDay});
 const dl=daylightFactor(solar.elevation);
 const col=new THREE.Color().setHSL(.58,.35,.04+.5*dl);
 return {version:1,timeOfDay,cloudiness,weather,latitude,dayOfYear,sunElevation:solar.elevation,sunAzimuth:solar.azimuth,sunDirection:sunDirection(solar.elevation,solar.azimuth),daylight:dl,horizon:col.getHexString(),fogDensity:weather==='fog'?.04:weather==='rain'?.02:0};
}

export function setTimeOfDay(sky,hour){
 if(!sky||!Number.isFinite(hour)||hour<0||hour>24)throw Error('Hour 0–24.');
 return createSkyAtmosphere({...sky,timeOfDay:hour});
}

export function createModularKit({pieces=6,seed=1}={}){
 const r=rnd(seed),kit=[];
 for(let i=0;i<pieces;i++){const kind=i%3===0?'wall':i%3===1?'floor':'prop';
  const mesh=new THREE.Mesh(kind==='wall'?new THREE.BoxGeometry(2,2.4,.15):kind==='floor'?new THREE.BoxGeometry(2,.1,2):new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshStandardMaterial({color:kind==='prop'?'#a08060':'#9a9a9a'}));
  mesh.name=`${kind}_${i}`;mesh.userData.fusion_modular={kind,snap:[1,0,1],seed:seed+i};kit.push(mesh);}
 return {version:1,pieces:kit,snapGrid:1};
}

export function snapModular(piece,target,{grid=1}={}){
 if(!piece||!target)throw Error('Piece and target required.');
 if(!Number.isFinite(grid)||grid<=0)throw Error('Invalid grid.');
 const p=target.position;piece.position.set(Math.round(p.x/grid)*grid,p.y,Math.round(p.z/grid)*grid);return piece.position.toArray();
}

export function createPrefab(name,objects=[]){
 if(!name||typeof name!=='string')throw Error('Prefab name required.');
 if(!Array.isArray(objects)||objects.length>64)throw Error('Prefab objects 0–64.');
 return {version:1,kind:'prefab',name:String(name).slice(0,64),objects:objects.map(o=>({uuid:o.uuid,name:o.name,position:o.position.toArray()}))};
}

export function createHlods(roots,{keep=.25}={}){
 if(!Array.isArray(roots)||!roots.length)throw Error('HLOD roots required.');
 return roots.map((r,i)=>({id:`hlod_${i}`,source:r.uuid||r.name,keep,proxy:true}));
}

export function createWorldPartition({cellSize=32,extent=128}={}){
 if(!Number.isFinite(cellSize)||cellSize<=0||!Number.isFinite(extent)||extent<=0)throw Error('Invalid partition.');
 const n=Math.ceil(extent/cellSize),cells=[];
 for(let z=0;z<n;z++)for(let x=0;x<n;x++)cells.push({x,z,origin:[(x-n/2)*cellSize,0,(z-n/2)*cellSize],loaded:false,assets:[]});
 return {version:1,cellSize,extent,cells};
}

export function listEnvironmentAssets(){
 return [
  {id:'polyhaven_hdri',label:'Poly Haven HDRIs',source:'Poly Haven',kind:'hdri'},
  {id:'polyhaven_tex',label:'Poly Haven Textures',source:'Poly Haven',kind:'texture'},
  {id:'kitbash_rocks',label:'Rock kitbash pack',source:'Fusion',kind:'mesh'},
  {id:'trees_cc0',label:'CC0 tree pack',source:'Fusion',kind:'foliage'},
  {id:'photogrammetry_slot',label:'Photogrammetry imports',source:'Scan',kind:'scan'}
 ];
}

export function createBiomeRules(name='temperate',{seed=1}={}){
 const rules={
  temperate:{foliage:['tree','grass'],rocks:.2,water:'lake',height:[.5,2]},
  desert:{foliage:['rock'],rocks:.6,water:null,height:[.2,1]},
  alpine:{foliage:['tree'],rocks:.5,water:'lake',height:[1,4],snow:.6},
  swamp:{foliage:['tree'],rocks:.1,water:'lake',height:[.1,.8]}
 };
 if(!rules[name])throw Error('Unknown biome.');
 return {version:1,name,seed,...rules[name]};
}

export function applyBiome(terrain,biome){
 if(!terrain?.userData?.fusion_terrain||!biome)throw Error('Terrain and biome required.');
 terrain.userData.fusion_biome=biome;const splat=terrain.userData.fusion_terrain.splat,res=splat.res;
 for(let i=0;i<res*res;i++){const h=terrain.geometry.attributes.position.getY(i);
  if(biome.snow&&h>biome.height[1]*biome.snow){splat.data.snow[i]=.8;splat.data.grass[i]=.1;}
  else if(biome.name==='desert'){splat.data.dirt[i]=.7;splat.data.rock[i]=.3;splat.data.grass[i]=0;}}
 return {foliage:scatterFoliage(terrain,{count:30,seed:biome.seed}),rocks:scatterRocks(terrain,{count:Math.round(20*(biome.rocks||.2)),seed:biome.seed+1})};
}

export function scatterDetailDecals(surface,{count=16,seed=5}={}){
 const pts=scatterOnMesh(surface,{count,seed}),group=new THREE.Group();group.name='Detail Decals';
 for(const p of pts.points){const d=new THREE.Mesh(new THREE.CircleGeometry(.15,8),new THREE.MeshStandardMaterial({color:'#4a4030',roughness:1,side:THREE.DoubleSide}));d.position.fromArray(p);d.rotation.x=-Math.PI/2;group.add(d);}
 return group;
}

export function placeInteriorFurniture({seed=2}={}){
 const r=rnd(seed),group=new THREE.Group();group.name='Interior';
 const floor=new THREE.Mesh(new THREE.BoxGeometry(4,.1,4),new THREE.MeshStandardMaterial({color:'#cfc6b8'}));group.add(floor);
 for(const [name,sx,sy,sz,x,z] of [['table',1.2,.7,.8,0,0],['chair',.4,.8,.4,-1,.5],['chair',.4,.8,.4,1,.5],['lamp',.15,1.2,.15,1.5,-1]]){
  const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),new THREE.MeshStandardMaterial({color:name==='lamp'?'#eee8aa':'#8b6914'}));m.position.set(x,sy/2,z);m.name=name;group.add(m);}
 void r;return group;
}

export function floorPlanTo3D(plan,{wallHeight=2.4,thickness=.15}={}){
 if(!plan?.rooms||!Array.isArray(plan.rooms)||!plan.rooms.length)throw Error('Floor plan needs rooms [{x,z,w,d}].');
 const group=new THREE.Group();group.name='Floor Plan';
 for(const room of plan.rooms){
  const floor=new THREE.Mesh(new THREE.BoxGeometry(room.w,thickness,room.d),new THREE.MeshStandardMaterial({color:'#ddd'}));
  floor.position.set(room.x,0,room.z);group.add(floor);
  for(const [dx,dz,sx,sz] of [[0,room.d/2,room.w,thickness],[0,-room.d/2,room.w,thickness],[room.w/2,0,thickness,room.d],[-room.w/2,0,thickness,room.d]]){
   const wall=new THREE.Mesh(new THREE.BoxGeometry(sx,wallHeight,sz),new THREE.MeshStandardMaterial({color:'#e8e4dc'}));
   wall.position.set(room.x+dx,wallHeight/2,room.z+dz);group.add(wall);}
 }
 return group;
}

export function kitbashLibrary(){
 return [
  {id:'rock',make:()=>generateRock({})},
  {id:'tree',make:()=>generateTree({})},
  {id:'cube_grey',make:()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#888'}));m.name='Greybox';return m;}}
 ];
}

export function createGreyboxLevel({boxes=[[0,0,0,4,1,4],[0,0,-6,2,2,2]]}={}){
 const group=new THREE.Group();group.name='Greybox';
 for(const [x,y,z,w,h,d] of boxes){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:'#9a9a9a'}));m.position.set(x,y+h/2,z);group.add(m);}
 return group;
}

export function occlusionCullStats(objects,cameraPos=[0,2,10],{maxDist=50}={}){
 if(!Array.isArray(objects))throw Error('Objects required.');
 let visible=0,culled=0;const cam=new THREE.Vector3().fromArray(cameraPos);
 for(const o of objects){const p=new THREE.Vector3();o.getWorldPosition?.(p)||p.copy(o.position||new THREE.Vector3());
  if(p.distanceTo(cam)>maxDist){culled++;if(o.visible!==undefined)o.visible=false;}else{visible++;if(o.visible!==undefined)o.visible=true;}}
 return {visible,culled,maxDist};
}

export function applySeasonalVariation(terrain,season='summer'){
 if(!['spring','summer','autumn','winter'].includes(season))throw Error('Unknown season.');
 const splat=terrain?.userData?.fusion_terrain?.splat;if(!splat)throw Error('Terrain required.');
 const tint={spring:'#6a9a4a',summer:'#4a8a3a',autumn:'#a87838',winter:'#d8e0e8'}[season];
 if(terrain.material?.color)terrain.material.color.set(tint);
 terrain.userData.fusion_season=season;return season;
}

export {generateCityBlock,generateRoadSpline,instanceOnPoints,realizeInstances};

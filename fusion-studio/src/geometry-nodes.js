import * as THREE from 'three';

export const NODE_TYPES=[
  'mesh_in','curve_in','attribute_create','attribute_store','scatter_points','instance_on_points',
  'noise','voronoi','fractal','set_position','join','transform','curve_to_mesh','mesh_to_curve',
  'realize_instances','delete_geometry','separate_xyz','combine_xyz','math','random_value',
  'field_at_index','repeat_zone','simulation_zone','group_input','group_output','group_instance',
  'volume_cube','sdf_sphere','wrangle','set_material','set_uv','cache','city_block','lsystem','road_spline'
];

export function createGeoNodeTree({name='Geometry Nodes'}={}){
 return {version:1,name:String(name).slice(0,64),nodes:[],links:[],seed:1,frame:0,exposed:[],cache:null};
}

export function addGeoNode(tree,type,opts={}){
 if(!NODE_TYPES.includes(type))throw Error('Unknown geometry node: '+type);
 if(tree.nodes.length>=128)throw Error('At most 128 nodes.');
 const node={id:`n${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,type,x:opts.x||0,y:opts.y||0,params:{...(opts.params||{})},muted:!!opts.muted};
 tree.nodes.push(node);return node;
}

export function linkGeoNodes(tree,fromId,fromSocket,toId,toSocket){
 if(tree.links.length>=256)throw Error('At most 256 links.');
 if(!tree.nodes.some(n=>n.id===fromId)||!tree.nodes.some(n=>n.id===toId))throw Error('Link endpoints missing.');
 if(fromId===toId)throw Error('Cannot link a node to itself.');
 const link={from:fromId,fromSocket:String(fromSocket),to:toId,toSocket:String(toSocket)};
 tree.links.push(link);return link;
}

export function exposeParam(tree,nodeId,key,label){
 const node=tree.nodes.find(n=>n.id===nodeId);if(!node)throw Error('Node missing.');
 if(!(key in node.params)&&node.params[key]===undefined)node.params[key]=0;
 const exp={nodeId,key,label:String(label||key).slice(0,40)};
 tree.exposed.push(exp);return exp;
}

export function setTreeSeed(tree,seed){
 if(!Number.isInteger(seed)||seed<0)throw Error('Seed must be >= 0.');
 tree.seed=seed;return tree;
}

export function setTreeFrame(tree,frame){
 if(!Number.isInteger(frame)||frame<0||frame>100000)throw Error('Frame out of range.');
 tree.frame=frame;return tree;
}

function rng(seed){let s=seed>>>0||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

export function noise3(x,y,z,seed=1){
 const r=rng((seed^Math.floor(x*12.9898+y*78.233+z*37.719)*1000)>>>0);return r()*2-1;
}

export function fractalNoise(x,y,z,{octaves=4,lacunarity=2,gain=.5,seed=1}={}){
 let amp=1,freq=1,sum=0,norm=0;
 for(let i=0;i<octaves;i++){sum+=noise3(x*freq,y*freq,z*freq,seed+i)*amp;norm+=amp;amp*=gain;freq*=lacunarity;}
 return sum/(norm||1);
}

export function voronoi3(x,y,z,{scale=1,seed=1}={}){
 const gx=Math.floor(x*scale),gy=Math.floor(y*scale),gz=Math.floor(z*scale);let best=1e9;
 for(let oz=-1;oz<=1;oz++)for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
  const cx=gx+ox,cy=gy+oy,cz=gz+oz,r=rng((seed+cx*73856093+cy*19349663+cz*83492791)>>>0);
  const px=cx+r(),py=cy+r(),pz=cz+r(),d=Math.hypot(x*scale-px,y*scale-py,z*scale-pz);if(d<best)best=d;
 }
 return best;
}

export function createAttributeStore(){return {point:new Map(),vertex:new Map(),primitive:new Map(),detail:new Map()};}

export function setAttribute(store,domain,name,values){
 if(!['point','vertex','primitive','detail'].includes(domain))throw Error('Invalid attribute domain.');
 if(!/^[A-Za-z_][\w.]{0,39}$/.test(name))throw Error('Invalid attribute name.');
 if(!Array.isArray(values)&&typeof values!=='number'&&!ArrayBuffer.isView(values))throw Error('Attribute values required.');
 store[domain].set(name,Array.isArray(values)||ArrayBuffer.isView(values)?[...values]:[values]);return store;
}

export function getAttribute(store,domain,name){
 const v=store[domain]?.get(name);if(v===undefined)throw Error(`Missing ${domain}.${name}`);return v;
}

export function scatterOnMesh(mesh,{count=64,seed=1,densityAttr}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Scatter needs a mesh.');
 if(!Number.isInteger(count)||count<1||count>20000)throw Error('Count 1–20000.');
 const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,rnd=rng(seed),points=[];
 const tris=index?index.count/3:Math.floor(pos.count/3);
 mesh.updateWorldMatrix(true,false);const m=mesh.matrixWorld;
 for(let i=0;i<count;i++){
  const t=Math.floor(rnd()*tris),i0=index?index.getX(t*3):t*3,i1=index?index.getX(t*3+1):t*3+1,i2=index?index.getX(t*3+2):t*3+2;
  let u=rnd(),v=rnd();if(u+v>1){u=1-u;v=1-v;}const w=1-u-v;
  const a=new THREE.Vector3().fromBufferAttribute(pos,i0),b=new THREE.Vector3().fromBufferAttribute(pos,i1),c=new THREE.Vector3().fromBufferAttribute(pos,i2);
  const p=a.multiplyScalar(u).addScaledVector(b,v).addScaledVector(c,w).applyMatrix4(m);
  if(densityAttr&&densityAttr[t]!==undefined&&rnd()>densityAttr[t])continue;
  points.push(p.toArray());
 }
 return {kind:'points',points,seed,count:points.length};
}

export function instanceOnPoints(points,{prototype='cube',scale=1,seed=1}={}){
 if(!points?.points)throw Error('Points required.');
 if(!['cube','sphere','cone','cylinder'].includes(prototype))throw Error('Unknown prototype.');
 if(!Number.isFinite(scale)||scale<=0||scale>10)throw Error('Invalid scale.');
 const rnd=rng(seed),instances=[];
 for(const p of points.points)instances.push({position:p,scale:scale*(.7+rnd()*.6),rotation:[0,rnd()*Math.PI*2,0],prototype});
 return {kind:'instances',instances,prototype};
}

export function realizeInstances(instances){
 if(!instances?.instances)throw Error('Instances required.');
 const group=new THREE.Group();group.name='Realized Instances';
 for(const inst of instances.instances){
  const geo=inst.prototype==='sphere'?new THREE.SphereGeometry(.05*inst.scale,8,6)
   :inst.prototype==='cone'?new THREE.ConeGeometry(.04*inst.scale,.1*inst.scale,6)
   :inst.prototype==='cylinder'?new THREE.CylinderGeometry(.03*inst.scale,.03*inst.scale,.1*inst.scale,8)
   :new THREE.BoxGeometry(.08*inst.scale,.08*inst.scale,.08*inst.scale);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#6a9ccc'}));
  mesh.position.fromArray(inst.position);mesh.rotation.y=inst.rotation[1];group.add(mesh);
 }
 return group;
}

export function curveToMesh(curvePoints,{radius=.02,segments=8}={}){
 if(!Array.isArray(curvePoints)||curvePoints.length<2)throw Error('Curve needs 2+ points.');
 if(!Number.isFinite(radius)||radius<=0||radius>.5)throw Error('Invalid radius.');
 const curve=new THREE.CatmullRomCurve3(curvePoints.map(p=>new THREE.Vector3().fromArray(p)));
 const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(64,curvePoints.length*4),radius,segments,false),new THREE.MeshStandardMaterial({color:'#caa86a'}));
 mesh.name='Curve Mesh';return mesh;
}

export function meshToCurve(mesh,{maxPoints=32}={}){
 if(!mesh?.isMesh||!mesh.geometry?.attributes.position)throw Error('Mesh required.');
 if(!Number.isInteger(maxPoints)||maxPoints<2||maxPoints>512)throw Error('maxPoints 2–512.');
 const pos=mesh.geometry.attributes.position,step=Math.max(1,Math.floor(pos.count/maxPoints)),pts=[];
 mesh.updateWorldMatrix(true,false);
 for(let i=0;i<pos.count&&pts.length<maxPoints;i+=step){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);pts.push(v.toArray());}
 return {kind:'curve',points:pts};
}

export function evaluateWrangle(code,{attrs={},seed=1,index=0}={}){
 if(typeof code!=='string'||code.length>500)throw Error('Wrangle expression too long.');
 // Safe subset: math on @P / @pscale / i / seed only
 if(/[^0-9+\-*/%()\[\].,\sPpscaleiseednMath]/.test(code.replace(/@/g,'')))throw Error('Unsupported wrangle tokens.');
 const P=attrs.P||[0,0,0],pscale=attrs.pscale??1,i=index,n=seed;
 const fn=new Function('P','pscale','i','seed','Math',`"use strict";return (${code});`);
 return fn(P,pscale,i,n,Math);
}

export function volumeCube({size=[1,1,1],res=8}={}){
 if(size.some(v=>!Number.isFinite(v)||v<=0)||!Number.isInteger(res)||res<2||res>64)throw Error('Invalid volume.');
 const voxels=new Float32Array(res*res*res);
 for(let z=0;z<res;z++)for(let y=0;y<res;y++)for(let x=0;x<res;x++){
  const nx=x/(res-1)-.5,ny=y/(res-1)-.5,nz=z/(res-1)-.5;voxels[(z*res+y)*res+x]=1-Math.hypot(nx*2,ny*2,nz*2);
 }
 return {kind:'volume',size,res,voxels,format:'dense'};
}

export function sdfSphere(point,center=[0,0,0],radius=.5){
 return Math.hypot(point[0]-center[0],point[1]-center[1],point[2]-center[2])-radius;
}

export function generateLSystem({axiom='F',rules={F:'F[+F]F[-F]F'},iterations=3,angle=25,step=.1}={}){
 if(!Number.isInteger(iterations)||iterations<0||iterations>6)throw Error('Iterations 0–6.');
 let s=String(axiom);for(let i=0;i<iterations;i++){if(s.length>5000)throw Error('L-system too large.');s=s.replace(/./g,ch=>rules[ch]||ch);}
 const pts=[[0,0,0]],stack=[];let x=0,y=0,z=0,dir=[0,1,0],ang=angle*Math.PI/180;
 const rot=(d,a)=>{const c=Math.cos(a),s=Math.sin(a);return [d[0]*c-d[1]*s,d[0]*s+d[1]*c,d[2]];};
 for(const ch of s){
  if(ch==='F'){x+=dir[0]*step;y+=dir[1]*step;z+=dir[2]*step;pts.push([x,y,z]);}
  else if(ch==='+')dir=rot(dir,ang);else if(ch==='-')dir=rot(dir,-ang);
  else if(ch==='[')stack.push([[x,y,z],[...dir]]);else if(ch===']'&&stack.length){const [p,d]=stack.pop();x=p[0];y=p[1];z=p[2];dir=d;pts.push([x,y,z]);}
 }
 return {kind:'curve',points:pts,system:s.slice(0,200)};
}

export function generateCityBlock({blocks=4,size=2,seed=2}={}){
 if(!Number.isInteger(blocks)||blocks<1||blocks>16)throw Error('Blocks 1–16.');
 const rnd=rng(seed),group=new THREE.Group();group.name='City Block';
 for(let z=0;z<blocks;z++)for(let x=0;x<blocks;x++){
  const h=.3+rnd()*1.5,mesh=new THREE.Mesh(new THREE.BoxGeometry(size*.7,h,size*.7),new THREE.MeshStandardMaterial({color:'#8a9098'}));
  mesh.position.set((x-(blocks-1)/2)*size,h/2,(z-(blocks-1)/2)*size);group.add(mesh);
 }
 return group;
}

export function generateRoadSpline({points=[[-2,0,0],[0,0,1],[2,0,0]],width=.3}={}){
 const mesh=curveToMesh(points,{radius:width/2,segments:6});mesh.name='Road';mesh.material.color.set('#444851');return mesh;
}

export function runRepeatZone(fn,iterations=4){
 if(!Number.isInteger(iterations)||iterations<1||iterations>32)throw Error('Repeat 1–32.');
 if(typeof fn!=='function')throw Error('Repeat needs a function.');
 let state=null;for(let i=0;i<iterations;i++)state=fn(state,i);return state;
}

export function runSimulationZone(fn,{frames=8,seed=1}={}){
 if(!Number.isInteger(frames)||frames<1||frames>240)throw Error('Frames 1–240.');
 const cache=[];let state={seed,frame:0};for(let f=0;f<frames;f++){state=fn({...state,frame:f})||state;cache.push(structuredClone(state));}
 return {kind:'sim_cache',frames:cache};
}

export function cacheGeoNode(tree,payload){
 tree.cache={frame:tree.frame,seed:tree.seed,payload:payload&&typeof payload==='object'?{kind:payload.kind||'data',meta:payload.meta||null}:null,at:Date.now()};
 return tree.cache;
}

/** Evaluate a linear subset of the node tree into a result bundle (preview evaluator). */
export function evaluateGeoTree(tree,context={}){
 const byId=Object.fromEntries(tree.nodes.map(n=>[n.id,n]));
 const attrs=context.attrs||createAttributeStore();
 let geometry=context.mesh||null,points=null,curve=null,instances=null,volume=null,last=null;
 const rnd=rng(tree.seed+tree.frame);
 // Topological-ish: process in array order (authoring order)
 for(const node of tree.nodes){if(node.muted)continue;
  switch(node.type){
   case 'mesh_in':geometry=context.mesh||geometry;last=geometry;break;
   case 'curve_in':curve=context.curve||curve;last=curve;break;
   case 'attribute_create':setAttribute(attrs,node.params.domain||'point',node.params.name||'pscale',[node.params.value??1]);last=attrs;break;
   case 'attribute_store':if(geometry&&node.params.name){const n=geometry.geometry?.attributes.position?.count||1;setAttribute(attrs,'point',node.params.name,Array.from({length:n},()=>node.params.value??1));}last=attrs;break;
   case 'noise':case 'fractal':case 'voronoi':{
    const n=geometry?.geometry?.attributes.position?.count||8;const vals=[];
    for(let i=0;i<n;i++){const t=i/n;vals.push(node.type==='voronoi'?voronoi3(t,t*.3,t*.7,{seed:tree.seed}):fractalNoise(t,t*.2,t*.5,{seed:tree.seed}));}
    setAttribute(attrs,'point',node.params.name||'noise',vals);last=vals;break;}
   case 'scatter_points':if(!geometry)throw Error('scatter needs mesh_in');points=scatterOnMesh(geometry,{count:node.params.count||48,seed:tree.seed});last=points;break;
   case 'instance_on_points':if(!points)throw Error('instance needs points');instances=instanceOnPoints(points,{prototype:node.params.prototype||'cube',scale:node.params.scale||1,seed:tree.seed});last=instances;break;
   case 'realize_instances':last=instances?realizeInstances(instances):null;break;
   case 'curve_to_mesh':last=curve?curveToMesh(curve.points||curve,{radius:node.params.radius||.02}):null;break;
   case 'mesh_to_curve':if(!geometry)throw Error('mesh_to_curve needs mesh');curve=meshToCurve(geometry,{maxPoints:node.params.maxPoints||24});last=curve;break;
   case 'random_value':last=rnd()*(node.params.max??1)+(node.params.min??0);break;
   case 'math':{const a=node.params.a??0,b=node.params.b??0,op=node.params.op||'add';last=op==='mul'?a*b:op==='sub'?a-b:op==='div'?(b?a/b:0):a+b;break;}
   case 'wrangle':last=evaluateWrangle(node.params.code||'P[1]+0.01',{attrs:{P:[0,1,0],pscale:1},seed:tree.seed,index:0});break;
   case 'volume_cube':volume=volumeCube({res:node.params.res||8});last=volume;break;
   case 'sdf_sphere':last=sdfSphere(node.params.point||[0,0,0],node.params.center||[0,0,0],node.params.radius??.5);break;
   case 'lsystem':curve=generateLSystem(node.params);last=curve;break;
   case 'city_block':last=generateCityBlock({blocks:node.params.blocks||3,seed:tree.seed});break;
   case 'road_spline':last=generateRoadSpline(node.params);break;
   case 'set_uv':if(geometry?.geometry&&!geometry.geometry.attributes.uv){const n=geometry.geometry.attributes.position.count,uv=new Float32Array(n*2);for(let i=0;i<n;i++){uv[i*2]=i%2;uv[i*2+1]=Math.floor(i/2)%2;}geometry.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));}last=geometry;break;
   case 'set_material':if(geometry?.isMesh){geometry.material=new THREE.MeshStandardMaterial({color:node.params.color||'#8899aa'});}last=geometry;break;
   case 'cache':last=cacheGeoNode(tree,{kind:last?.kind||typeof last,meta:{node:node.id}});break;
   case 'repeat_zone':last=runRepeatZone((s,i)=>({i,sum:(s?.sum||0)+1}),node.params.iterations||4);break;
   case 'simulation_zone':last=runSimulationZone(s=>({...s,y:(s.y||0)+.1}),{frames:node.params.frames||6,seed:tree.seed});break;
   case 'group_input':last=context.groupInput??null;break;
   case 'group_output':tree._output=last;break;
   case 'group_instance':last={kind:'group',ref:node.params.asset||'local'};break;
   case 'join':case 'transform':case 'set_position':case 'delete_geometry':case 'separate_xyz':case 'combine_xyz':case 'field_at_index':last=last;break;
   default:break;
  }
 }
 return {geometry,points,curve,instances,volume,attrs,output:tree._output??last,frame:tree.frame,seed:tree.seed};
}

export function createDefaultScatterTree(mesh){
 const tree=createGeoNodeTree({name:'Scatter'});
 const a=addGeoNode(tree,'mesh_in'),b=addGeoNode(tree,'scatter_points',{params:{count:32}}),c=addGeoNode(tree,'instance_on_points',{params:{prototype:'cube',scale:.5}}),d=addGeoNode(tree,'realize_instances'),e=addGeoNode(tree,'group_output');
 linkGeoNodes(tree,a.id,'mesh',b.id,'mesh');linkGeoNodes(tree,b.id,'points',c.id,'points');linkGeoNodes(tree,c.id,'instances',d.id,'instances');linkGeoNodes(tree,d.id,'geometry',e.id,'geometry');
 setTreeSeed(tree,7);exposeParam(tree,b.id,'count','Point Count');
 return {tree,result:evaluateGeoTree(tree,{mesh})};
}

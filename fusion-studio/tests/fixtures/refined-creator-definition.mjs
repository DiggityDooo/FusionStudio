// Private benchmark fixture authoring, not a distributable topology family.
// Symmetric conforming edge refinement retains original IDs and UV seams.
import crypto from 'node:crypto';
const edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
export function refinedCreatorDefinition(original,target,{controls=16}={}){
 const d=structuredClone(original),s=d.source,positions=s.positions.slice(),parents=[],mirror=s.mirror.slice();
 let faces=Array.from({length:s.triangles.length/3},(_,i)=>({ids:s.triangles.slice(i*3,i*3+3),uv:s.cornerUV.slice(i*6,i*6+6)}));
 if(!Number.isInteger(target)||target<faces.length||target>200000)throw Error('Invalid benchmark body resolution');
 while(faces.length<target){
  const edges=new Map();for(const {ids}of faces)for(let i=0;i<3;i++){const a=ids[i],b=ids[(i+1)%3],key=edge(a,b);if(!edges.has(key))edges.set(key,{a,b,key,count:0,d:[0,1,2].reduce((v,k)=>v+(positions[a*3+k]-positions[b*3+k])**2,0)});edges.get(key).count++;}
  const chosen=new Map();let budget=target-faces.length;
  for(const item of [...edges.values()].sort((a,b)=>b.d-a.d||a.a-b.a||a.b-b.b)){
   if(chosen.has(item.key))continue;const reflected=edges.get(edge(mirror[item.a],mirror[item.b]));if(!reflected||chosen.has(reflected.key))continue;
   const cost=item.count+(reflected.key===item.key?0:reflected.count);if(cost>budget)continue;chosen.set(item.key,item);chosen.set(reflected.key,reflected);budget-=cost;if(!budget)break;
  }
  if(!chosen.size)throw Error('Cannot reach benchmark resolution with symmetric conforming refinement');
  const mids=new Map();for(const item of chosen.values()){const id=positions.length/3;mids.set(item.key,id);parents.push([id,item.a,item.b]);for(let k=0;k<3;k++)positions.push((positions[item.a*3+k]+positions[item.b*3+k])/2);}
  for(const item of chosen.values())mirror[mids.get(item.key)]=mids.get(edge(mirror[item.a],mirror[item.b]));
  const next=[];for(const face of faces){const t=face.ids,m=t.map((v,i)=>mids.get(edge(v,t[(i+1)%3]))),uv=face.uv,u=t.map((_,i)=>[uv[i*2],uv[i*2+1]]),mu=u.map((p,i)=>p.map((v,k)=>(v+u[(i+1)%3][k])/2)),count=m.filter(v=>v!==undefined).length;
   const add=(ids,coords)=>next.push({ids,uv:coords.flat()});
   if(!count)next.push(face);
   else if(count===3){add([t[0],m[0],m[2]],[u[0],mu[0],mu[2]]);add([m[0],t[1],m[1]],[mu[0],u[1],mu[1]]);add([m[2],m[1],t[2]],[mu[2],mu[1],u[2]]);add([m[0],m[1],m[2]],[mu[0],mu[1],mu[2]]);}
   else if(count===1){const i=m.findIndex(v=>v!==undefined),j=(i+1)%3,k=(i+2)%3;add([t[i],m[i],t[k]],[u[i],mu[i],u[k]]);add([m[i],t[j],t[k]],[mu[i],u[j],u[k]]);}
   else{const i=(m.findIndex(v=>v===undefined)+1)%3,j=(i+1)%3,k=(i+2)%3;add([t[j],m[j],m[i]],[u[j],mu[j],mu[i]]);add([t[i],m[i],m[j]],[u[i],mu[i],mu[j]]);add([t[i],m[j],t[k]],[u[i],mu[j],u[k]]);}
  }faces=next;
 }
 const skinIndex=s.skinIndex.slice(),skinWeight=s.skinWeight.slice();let prunedVertices=0;
 for(const [id,a,b]of parents){const influences=new Map();for(const v of [a,b])for(let k=0;k<4;k++){const bone=skinIndex[v*4+k],weight=skinWeight[v*4+k]*.5;influences.set(bone,(influences.get(bone)||0)+weight);}const rows=[...influences].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);if(rows.length>4)prunedVertices++;const kept=rows.slice(0,4),sum=kept.reduce((v,row)=>v+row[1],0);for(let k=0;k<4;k++){skinIndex[id*4+k]=kept[k]?.[0]||0;skinWeight[id*4+k]=(kept[k]?.[1]||0)/sum;}}
 const selected=[...d.controls.filter(c=>c.category==='Body').slice(0,Math.ceil(controls/2)),...d.controls.filter(c=>c.category==='Face').slice(0,Math.floor(controls/2))];
 d.controls=selected;const wanted=new Set(d.controls.flatMap(c=>[c.positive,c.negative]));
 for(const sex of ['female','male']){for(const ancestry of ['african','asian','caucasian'])wanted.add(`macrodetails/${ancestry}-${sex}-young`);wanted.add(`macrodetails/universal-${sex}-young-averagemuscle-averageweight`);}
 const targets={};for(const key of wanted){const data=s.targets[key];if(!data)throw Error('Missing benchmark target '+key);const values=new Float32Array(positions.length);for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++)values[data[i]*3+k]=data[i+k+1];for(const [id,a,b]of parents)for(let k=0;k<3;k++)values[id*3+k]=(values[a*3+k]+values[b*3+k])/2;const rows=[];for(let i=0;i<values.length;i+=3)if(values[i]||values[i+1]||values[i+2])rows.push(i/3,values[i],values[i+1],values[i+2]);targets[key]=rows;}
 s.positions=positions;s.triangles=faces.flatMap(f=>f.ids);s.cornerSource=s.triangles.slice();s.cornerUV=faces.flatMap(f=>f.uv);s.mirror=mirror;s.skinIndex=skinIndex;s.skinWeight=skinWeight;s.targets=targets;
 d.identity=crypto.createHash('sha256').update(original.identity+':benchmark-symmetric-linear-balanced-v1:'+target+':'+d.controls.map(c=>c.id).join(',')).digest('hex');
 d.benchmark={baseIdentity:original.identity,triangles:faces.length,vertices:positions.length/3,controls:d.controls.length,refinement:'symmetric conforming linear edges; per-corner UV interpolation',prunedSkinVertices:prunedVertices,limits:['Sampling density only; no new anatomical detail or supported new user family.','Default muscle/weight only; retained detail controls and adult sex/height remain active.','Interpolated skin uses four largest influences with normalization; this is fixture authoring, not lossless transfer of original posed midpoint skin.','Private temporary foundation registration is required before loading its saved projects in a fresh test process.']};return d;
}

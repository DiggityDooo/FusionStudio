// Original bounded endpoint-QEM reduction. Every output vertex retains one
// exact input vertex: all skin, UV and morph attributes have an explicit remap.
// Chart/material borders stay fixed. Link/normal tests preserve local topology;
// this is not a global self-intersection or Hausdorff-distance certificate.
import {LodCandidates} from './lod-candidates.js';
export const LOD_LIMITS={vertices:300000,triangles:200000,queue:2000000};
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>a.map((v,i)=>v-b[i]);
export function reduceLod(input,{keep=.5,maxNormalAngle=60}={}){
 const started=performance.now(),{positions,index,materials}=input||{},n=positions?.length/3,count=index?.length/3;
 if(!Number.isFinite(keep)||keep<=0||keep>1||!Number.isFinite(maxNormalAngle)||maxNormalAngle<1||maxNormalAngle>=90)throw Error('Invalid LOD reduction parameters.');
 if(!(positions instanceof Float64Array||positions instanceof Float32Array)||!(index instanceof Uint32Array)||!(materials instanceof Int32Array)||!Number.isInteger(n)||n<3||n>LOD_LIMITS.vertices||!Number.isInteger(count)||count<1||count>LOD_LIMITS.triangles||positions.some(v=>!Number.isFinite(v)||Math.abs(v)>1000000)||index.some(v=>v>=n)||materials.length!==count||materials.some(v=>v<0))throw Error('Malformed or oversized LOD input.');
 const p=Array.from({length:n},(_,i)=>Array.from(positions.slice(i*3,i*3+3))),faces=Array.from({length:count},(_,i)=>Array.from(index.slice(i*3,i*3+3))),adj=Array.from({length:n},()=>new Set()),quadrics=Array.from({length:n},()=>new Float64Array(10)),active=new Uint8Array(n).fill(1),alive=new Uint8Array(count).fill(1),revision=new Uint32Array(n),locked=new Uint8Array(n),radii=new Float64Array(n),edges=new Map(),faceKeys=new Map(),materialSets=Array.from({length:n},()=>new Set()),warnings=[];
 const parents=Uint32Array.from({length:n},(_,i)=>i),referenced=new Uint8Array(n),bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(const id of index)referenced[id]=1;for(let i=0;i<n;i++)if(referenced[i])for(let c=0;c<3;c++){bounds[0][c]=Math.min(bounds[0][c],p[i][c]);bounds[1][c]=Math.max(bounds[1][c],p[i][c]);}const maximumDisplacement=Math.hypot(...sub(bounds[1],bounds[0]))*.02;
 const normal=t=>cross(sub(p[t[1]],p[t[0]]),sub(p[t[2]],p[t[0]]));
 let degenerate=0,nonManifold=0,remaining=count,collapses=0,maxEndpointTravel=0;
 for(let f=0;f<count;f++){
  const t=faces[f],norm=normal(t),length=Math.hypot(...norm),key=[...t].sort((a,b)=>a-b).join(':');
  if(new Set(t).size<3||length<1e-18){degenerate++;for(const v of t)locked[v]=1;}
  if(faceKeys.has(key)){for(const v of t)locked[v]=1;for(const v of faces[faceKeys.get(key)])locked[v]=1;nonManifold++;}faceKeys.set(key,f);
  for(const v of t){adj[v].add(f);materialSets[v].add(materials[f]);}
  for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3],k=edgeKey(a,b),row=edges.get(k);if(row)row.faces.push(f);else edges.set(k,{a,b,faces:[f]});}
  if(length>1e-18){const a=norm[0]/length,b=norm[1]/length,c=norm[2]/length,d=-(a*p[t[0]][0]+b*p[t[0]][1]+c*p[t[0]][2]),q=[a*a,a*b,a*c,a*d,b*b,b*c,b*d,c*c,c*d,d*d];for(const v of t)for(let j=0;j<10;j++)quadrics[v][j]+=q[j];}
 }
 for(const v of materialSets.keys())if(materialSets[v].size>1)locked[v]=1;
 for(const edge of edges.values())if(edge.faces.length!==2){locked[edge.a]=locked[edge.b]=1;if(edge.faces.length>2)nonManifold++;}
 if(degenerate||nonManifold)warnings.push('Source has degenerate, duplicate or non-manifold regions; affected vertices are protected.');
 const heap=new LodCandidates(LOD_LIMITS.queue),target=Math.max(1,Math.ceil(count*keep)),cos=Math.cos(maxNormalAngle*Math.PI/180);
 const cost=(a,b,v)=>{const q=quadrics[a].map((x,i)=>x+quadrics[b][i]),[x,y,z]=p[v];return Math.max(0,q[0]*x*x+2*q[1]*x*y+2*q[2]*x*z+2*q[3]*x+q[4]*y*y+2*q[5]*y*z+2*q[6]*y+q[7]*z*z+2*q[8]*z+q[9]);};
 const schedule=(a,b)=>{if(a===b||!active[a]||!active[b]||locked[a]&&locked[b])return;const ca=cost(a,b,a),cb=cost(a,b,b),keep=locked[a]?a:locked[b]?b:ca<cb||ca===cb&&a<b?a:b,remove=keep===a?b:a;heap.push({keep,remove,cost:keep===a?ca:cb,ka:revision[keep],ra:revision[remove]});};
 if(keep<1)for(const {a,b}of edges.values())schedule(a,b);
 edges.clear();
 const neighbors=v=>{const out=new Set();for(const f of adj[v])for(const id of faces[f])if(id!==v)out.add(id);return out;};
 while(remaining>target&&heap.items.length){
  const row=heap.pop(),a=row.keep,b=row.remove;if(!active[a]||!active[b]||row.ka!==revision[a]||row.ra!==revision[b]||locked[b])continue;const travel=Math.hypot(...sub(p[a],p[b])),radius=Math.max(radii[a],radii[b]+travel);if(radius>maximumDisplacement)continue;
  const commonFaces=[...adj[a]].filter(f=>adj[b].has(f));if(commonFaces.length!==2||remaining-commonFaces.length<target)continue;
  const na=neighbors(a),nb=neighbors(b),opposite=new Set(commonFaces.flatMap(f=>faces[f].filter(v=>v!==a&&v!==b))),common=[...na].filter(v=>nb.has(v));
  if(opposite.size!==2||common.length!==2||common.some(v=>!opposite.has(v)))continue;
  const touched=new Set([...adj[a],...adj[b]]),patch=[],keys=new Set();let valid=true;
  for(const f of touched){
   const old=faces[f];if(old.includes(a)&&old.includes(b))continue;const t=old.map(v=>v===b?a:v),key=[...t].sort((x,y)=>x-y).join(':'),prior=faceKeys.get(key);
   if(keys.has(key)||prior!==undefined&&alive[prior]&&!touched.has(prior)){valid=false;break;}keys.add(key);
   const before=normal(old),after=normal(t),l=Math.hypot(...before),m=Math.hypot(...after);if(m<1e-18||l>1e-18&&dot(before,after)<cos*l*m){valid=false;break;}patch.push([f,t]);
  }
  if(!valid)continue;
  const affected=new Set([...na,...nb,a,b]);
  for(const other of nb)heap.delete(b,other);
  for(const f of touched){faceKeys.delete([...faces[f]].sort((x,y)=>x-y).join(':'));for(const v of faces[f])adj[v].delete(f);alive[f]=0;}
  for(const [f,t]of patch){faces[f]=t;alive[f]=1;faceKeys.set([...t].sort((x,y)=>x-y).join(':'),f);for(const v of t)adj[v].add(f);}
  remaining-=commonFaces.length;collapses++;active[b]=0;parents[b]=a;radii[a]=radius;maxEndpointTravel=Math.max(maxEndpointTravel,travel);for(let j=0;j<10;j++)quadrics[a][j]+=quadrics[b][j];
  for(const v of affected)revision[v]++;
  const scheduled=new Set();for(const v of affected)if(active[v])for(const other of neighbors(v)){const key=edgeKey(v,other);if(!scheduled.has(key)){scheduled.add(key);schedule(v,other);}}
 }
 const used=[],map=new Map(),out=[],sourceFaces=[];for(let f=0;f<count;f++)if(alive[f]){sourceFaces.push(f);for(const v of faces[f]){if(!map.has(v)){map.set(v,used.length);used.push(v);}out.push(map.get(v));}}
 const representatives=Uint32Array.from({length:n},(_,i)=>{let v=i;while(parents[v]!==v)v=parents[v];let at=i;while(parents[at]!==v){const next=parents[at];parents[at]=v;at=next;}return map.has(v)?v:0xffffffff;});
 if(remaining>target)warnings.push('Protected borders or topology/normal/displacement limits prevented the requested triangle count.');
 return {sources:Uint32Array.from(used),index:Uint32Array.from(out),faceSources:Uint32Array.from(sourceFaces),representatives,diagnostics:{version:1,method:'endpoint-qem',sourceVertices:n,sourceTriangles:count,outputVertices:used.length,outputTriangles:remaining,targetTriangles:target,achieved:remaining<=target,collapses,protectedVertices:locked.reduce((s,v)=>s+v,0),maxEndpointTravel,maxClusterDisplacementBound:radii.reduce((s,v)=>Math.max(s,v),0),maximumDisplacement,normalLimitDegrees:maxNormalAngle,candidateQueue:{version:1,method:'indexed-edges',peakEntries:heap.peak,limit:LOD_LIMITS.queue},milliseconds:performance.now()-started,warnings}};
}

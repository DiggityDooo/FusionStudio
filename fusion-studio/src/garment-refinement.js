// Original retained-source implementation of Loop's triangle masks.
// Mathematical reference: https://doi.org/10.5194/gmd-16-3565-2023, equation 2.
// UVs use linear face refinement; geometry and scalar attributes use the
// explicit source stencils. This is not Blender subdivision parity.
export const REFINEMENT_LIMITS={support:256,terms:1000000,vertices:60000,faces:60000};
const key=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function blend(terms){
 const weights=new Map();
 for(const [row,factor]of terms)for(const [i,w]of row){weights.set(i,(weights.get(i)||0)+w*factor);if(weights.size>REFINEMENT_LIMITS.support)throw Error('Refinement source support exceeds 256 vertices. Simplify high-valence vertices or sewing junctions.');}
 return [...weights].filter(([,w])=>w>0).sort((a,b)=>a[0]-b[0]);
}
function topology(faces,roots,count){
 const edges=new Map(),neighbours=Array.from({length:count},()=>new Set()),incident=Array.from({length:count},()=>[]);
 faces.forEach((raw,f)=>{const t=raw.map(i=>roots[i]);if(new Set(t).size!==3)throw Error('Refinement found a collapsed sewn face.');for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],id=key(a,b);if(!edges.has(id))edges.set(id,{a:Math.min(a,b),b:Math.max(a,b),faces:[],opposite:[]});const e=edges.get(id);e.faces.push(f);e.opposite.push(t[(k+2)%3]);if(e.faces.length>2)throw Error('Refinement needs manifold sewn edges.');neighbours[a].add(b);neighbours[b].add(a);incident[a].push(f);}});
 const boundary=Array.from({length:count},()=>[]);
 for(const e of edges.values())if(e.faces.length===1){boundary[e.a].push(e.b);boundary[e.b].push(e.a);}
 // A closed bow-tie vertex can pass edge/boundary checks. Its incident faces
 // must also form one fan before a smoothing stencil is meaningful.
 for(let v=0;v<count;v++){
  if(!incident[v].length)continue;
  if(neighbours[v].size>REFINEMENT_LIMITS.support-1||boundary[v].length!==0&&boundary[v].length!==2)throw Error('Refinement found an unsupported vertex fan. Repair the surface or keep refinement off.');
  const seen=new Set([incident[v][0]]),queue=[incident[v][0]];
  for(let at=0;at<queue.length;at++){const t=faces[queue[at]].map(i=>roots[i]);for(const u of t)if(u!==v)for(const f of edges.get(key(v,u)).faces)if(!seen.has(f)){seen.add(f);queue.push(f);}}
  if(seen.size!==incident[v].length)throw Error('Refinement found a disconnected vertex fan. Repair the surface or keep refinement off.');
 }
 return {edges,neighbours,boundary};
}
function positions(rows,source){return rows.map(row=>row.reduce((p,[i,w])=>p.map((v,k)=>v+source[i][k]*w),[0,0,0]));}

export function refineGarmentSurface(basis,settings){
 const source=basis.points,ids=[...basis.means.keys()],compact=new Map(ids.map((id,i)=>[id,i])),members=ids.map(()=>[]);
 let roots=basis.roots.map((r,i)=>{const v=compact.get(r);members[v].push(i);return v;}),rows=members.map(indices=>indices.map(i=>[i,1/indices.length])),linear=ids.map(id=>[...basis.means.get(id).position]),uvs=Array.from({length:source.length},(_,i)=>basis.uvs.slice(i*2,i*2+2)),faces=basis.oriented.map(t=>[...t]),sourceFaces=faces.map((_,i)=>i);
 if(rows.some(row=>row.length>REFINEMENT_LIMITS.support))throw Error('Refinement source support exceeds 256 vertices. Simplify sewing junctions.');
 let graph;
 for(let level=0;level<settings.refinement;level++){
  graph=topology(faces,roots,rows.length);
  const boundaryEdges=[...graph.edges.values()].filter(e=>e.faces.length===1).length,nextFaceCount=faces.length*4;
  if(nextFaceCount>REFINEMENT_LIMITS.faces||nextFaceCount*2+boundaryEdges*4>120000||roots.length+new Set(faces.flatMap(t=>t.map((a,k)=>key(a,t[(k+1)%3])))).size>REFINEMENT_LIMITS.vertices)throw Error('Refinement exceeds the retained surface or 120,000 finished-triangle limit. Use fewer refinement levels or a coarser simulation.');
  let termsUsed=0;const counted=row=>{termsUsed+=row.length;if(termsUsed>REFINEMENT_LIMITS.terms)throw Error('Refinement exceeds one million source weights. Use fewer levels or simpler sewing.');return row;};
  const nextRows=rows.map((row,v)=>{
   const boundary=graph.boundary[v],neighbours=[...graph.neighbours[v]],n=neighbours.length,s=settings.strength;
   if(boundary.length)return counted(settings.boundary==='preserve'?row:blend([[row,1-s*.25],...boundary.map(i=>[rows[i],s*.125])]));
   if(n<3)throw Error('Refinement needs at least three neighbours at interior vertices.');
   const beta=(5/8-(3/8+Math.cos(2*Math.PI/n)/4)**2)/n;
   return counted(blend([[row,1-s*n*beta],...neighbours.map(i=>[rows[i],s*beta])]));
  }),nextLinear=linear.map(p=>[...p]);
  const edgeVertices=new Map();
  for(const [id,e]of graph.edges){
   const v=nextRows.length,s=e.faces.length===2?settings.strength:0;
   nextRows.push(counted(blend([[rows[e.a],.5-s*.125],[rows[e.b],.5-s*.125],...e.opposite.map(i=>[rows[i],s*.125])])));
   nextLinear.push(linear[e.a].map((x,k)=>(x+linear[e.b][k])/2));edgeVertices.set(id,v);
  }
  const nextRoots=[...roots],nextUV=uvs.map(p=>[...p]),rawEdges=new Map(),mid=(a,b)=>{const id=key(a,b);if(!rawEdges.has(id)){rawEdges.set(id,nextRoots.length);nextRoots.push(edgeVertices.get(key(roots[a],roots[b])));nextUV.push(uvs[a].map((v,k)=>(v+uvs[b][k])/2));}return rawEdges.get(id);},nextFaces=[],nextSources=[];
  for(let f=0;f<faces.length;f++){const [a,b,c]=faces[f],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);nextFaces.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);nextSources.push(...Array(4).fill(sourceFaces[f]));}
  rows=nextRows;linear=nextLinear;roots=nextRoots;uvs=nextUV;faces=nextFaces;sourceFaces=nextSources;
 }
 const evaluated=positions(rows,source);graph=topology(faces,roots,rows.length);
 for(const t of faces){const p=t.map(i=>evaluated[roots[i]]),q=t.map(i=>linear[roots[i]]),a=cross(sub(p[1],p[0]),sub(p[2],p[0])),b=cross(sub(q[1],q[0]),sub(q[2],q[0]));if(a.reduce((sum,v,k)=>sum+v*b[k],0)<=0)throw Error('Refinement inverts a surface face. Reduce smoothing strength or retain the original surface.');}
 const offsets=[0],indices=[],weights=[];for(const row of rows){for(const [i,w]of row){indices.push(i);weights.push(w);}offsets.push(indices.length);}
 const edges=new Map();faces.forEach((t,f)=>{for(let k=0;k<3;k++){const a=roots[t[k]],b=roots[t[(k+1)%3]],id=key(a,b);if(!edges.has(id))edges.set(id,[]);edges.get(id).push({face:f,a,b});}});
 return {n:roots.length,roots,means:new Map(evaluated.map((position,i)=>[i,{position}])),oriented:faces,uvs:uvs.flat(),edges,sourceFaces,interpolation:{version:1,offsets,indices,weights},stencilVertex:roots,refinement:{version:1,levels:settings.refinement,strength:settings.strength,boundary:settings.boundary,vertices:roots.length,triangles:faces.length,stencilTerms:indices.length,maximumShiftM:Math.max(...evaluated.map((p,i)=>distance(p,linear[i])))}};
}

export function validateSourceInterpolation(map,sourceCount,vertexCount){
 const bad=()=>{throw Error('Invalid retained subdivision source weights. Reopen a prior version or re-drape.');};
 if(map?.version!==1||!Array.isArray(map.offsets)||map.offsets.length<2||map.offsets.length>REFINEMENT_LIMITS.vertices+1||!Array.isArray(map.indices)||map.indices.length>REFINEMENT_LIMITS.terms||!Array.isArray(map.weights)||map.weights.length!==map.indices.length||!Array.isArray(map.vertices)||map.vertices.length!==vertexCount||map.offsets[0]!==0||map.offsets.at(-1)!==map.indices.length)bad();
 const rows=map.offsets.length-1;
 if(map.vertices.some(i=>!Number.isSafeInteger(i)||i<0||i>=rows))bad();
 for(let row=0;row<rows;row++){const a=map.offsets[row],b=map.offsets[row+1];if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||b<=a||b-a>REFINEMENT_LIMITS.support||b>map.indices.length)bad();let sum=0,previous=-1;for(let j=a;j<b;j++){const i=map.indices[j],w=map.weights[j];if(!Number.isSafeInteger(i)||i<=previous||i>=sourceCount||!Number.isFinite(w)||w<=0||w>1+1e-10)bad();previous=i;sum+=w;}if(Math.abs(sum-1)>1e-8)bad();}
 return map;
}
export function interpolateSourceColors(source,map){
 const rows=Array.from({length:map.offsets.length-1},(_,row)=>{const color=[0,0,0];for(let j=map.offsets[row];j<map.offsets[row+1];j++)for(let k=0;k<3;k++)color[k]+=source[map.indices[j]*3+k]*map.weights[j];return color;});
 return map.vertices.flatMap(i=>rows[i]);
}

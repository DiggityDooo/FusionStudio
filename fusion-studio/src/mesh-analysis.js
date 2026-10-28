// Mesh analysis + advanced edit helpers (A2).

export function analyzeMesh(geometry){
  const pos=geometry?.attributes?.position;if(!pos)throw Error('geometry required');
  const index=geometry.index?geometry.index.array:null;
  const vertCount=pos.count;
  const faces=[];
  if(index){
    for(let i=0;i<index.length;i+=3)faces.push([index[i],index[i+1],index[i+2]]);
  }else{
    for(let i=0;i<vertCount;i+=3)faces.push([i,i+1,i+2]);
  }
  const edgeUse=new Map();
  const addEdge=(a,b,fi)=>{
    const key=a<b?`${a}_${b}`:`${b}_${a}`;
    const e=edgeUse.get(key)||{a,b,faces:[]};e.faces.push(fi);edgeUse.set(key,e);
  };
  for(let fi=0;fi<faces.length;fi++){
    const [a,b,c]=faces[fi];addEdge(a,b,fi);addEdge(b,c,fi);addEdge(c,a,fi);
  }
  let nonManifold=0,boundary=0;
  for(const e of edgeUse.values()){
    if(e.faces.length>2)nonManifold++;
    else if(e.faces.length===1)boundary++;
  }
  // Poles: valence ≠ 4 for interior verts (tri mesh approximation via edge degree).
  const valence=new Array(vertCount).fill(0);
  for(const e of edgeUse.values()){valence[e.a]++;valence[e.b]++;}
  let poles=0;for(let i=0;i<vertCount;i++)if(valence[i]>0&&valence[i]!==4&&valence[i]!==3)poles++;
  // Flipped normals: opposite winding on shared edge.
  let flipped=0;
  for(const e of edgeUse.values()){
    if(e.faces.length!==2)continue;
    const [f0,f1]=e.faces;
    const w0=winding(faces[f0],e.a,e.b),w1=winding(faces[f1],e.a,e.b);
    if(w0===w1)flipped++;
  }
  return {
    version:1,kind:'mesh_analysis',
    verts:vertCount,tris:faces.length,ngons:0,
    nonManifold,boundary,poles,flippedNormals:flipped,
    edges:edgeUse.size,
  };
}

function winding(face,a,b){
  const i=face.indexOf(a),j=face.indexOf(b);
  if(i<0||j<0)return 0;
  return (j-i+3)%3===1?1:-1;
}

export function edgeCreaseMap(geometry,{weight=.5,edges=[]}={}){
  const map={};for(const e of edges)map[e]=weight;
  geometry.userData.creaseWeights={...geometry.userData.creaseWeights,...map};
  return geometry.userData.creaseWeights;
}

export function proportionalFalloff(distance,radius,falloff='smooth'){
  if(radius<=0||distance>=radius)return 0;
  const t=1-distance/radius;
  if(falloff==='constant')return 1;
  if(falloff==='linear')return t;
  if(falloff==='root')return Math.sqrt(t);
  // smooth (smoothstep)
  return t*t*(3-2*t);
}

export function convertMeshRepresentation(mesh,{to='subdiv'}={}){
  if(!['mesh','curve','nurbs','subdiv'].includes(to))throw Error('rep');
  const verts=mesh?.geometry?.attributes?.position?.count||0;
  mesh.userData.representation={to,verts,at:Date.now()};
  return mesh.userData.representation;
}

export function loopCutPlan(geometry,{cuts=1}={}){
  const edges=geometry.index?geometry.index.count/2:geometry.attributes.position.count;
  return {version:1,kind:'loop_cut',cuts,candidateEdges:Math.max(1,edges|0)};
}

export function knifePlan(geometry,{segments=2}={}){
  return {version:1,kind:'knife',segments,hits:segments+1,verts:geometry?.attributes?.position?.count||0};
}

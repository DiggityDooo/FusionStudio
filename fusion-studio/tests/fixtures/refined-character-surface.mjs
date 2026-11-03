// Test-only conforming refinement. Adds sampling density, not anatomical detail
// or a supported new character family. Original vertices retain their indices.
export function refineCharacterSurface(positions,triangles,target){
 const points=Array.from(positions),parents=[];let faces=Array.from({length:triangles.length/3},(_,i)=>Array.from(triangles.slice(i*3,i*3+3)));
 const edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
 while(faces.length<target){
  const edges=new Map();for(const t of faces)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],key=edge(a,b);if(!edges.has(key))edges.set(key,{a,b,key,count:0,d:[0,1,2].reduce((sum,k)=>sum+(points[a*3+k]-points[b*3+k])**2,0)});edges.get(key).count++;}
  const chosen=[],mids=new Map();let budget=target-faces.length;
  for(const candidate of [...edges.values()].sort((a,b)=>b.d-a.d||a.a-b.a||a.b-b.b))if(candidate.count<=budget){chosen.push(candidate);budget-=candidate.count;if(!budget)break;}
  if(!chosen.length)throw Error('Refinement cannot reach the requested triangle count without changing boundary topology.');
  for(const {a,b,key} of chosen){const id=points.length/3;mids.set(key,id);parents.push([id,a,b]);for(let k=0;k<3;k++)points.push((points[a*3+k]+points[b*3+k])/2);}
  const next=[];for(const t of faces){const m=t.map((v,i)=>mids.get(edge(v,t[(i+1)%3]))),count=m.filter(v=>v!==undefined).length;
   if(!count)next.push(t);
   else if(count===3)next.push([t[0],m[0],m[2]],[m[0],t[1],m[1]],[m[2],m[1],t[2]],[m[0],m[1],m[2]]);
   else if(count===1){const i=m.findIndex(v=>v!==undefined),a=t[i],b=t[(i+1)%3],c=t[(i+2)%3];next.push([a,m[i],c],[m[i],b,c]);}
   else{const i=(m.findIndex(v=>v===undefined)+1)%3,a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],p=m[i],q=m[(i+1)%3];next.push([b,q,p],[a,p,q],[a,q,c]);}
  }faces=next;
 }
 return {positions:Float32Array.from(points),index:Uint32Array.from(faces.flat()),parents};
}
export function interpolateSparseTarget(data,fixture,scale=1){
 const values=new Float32Array(fixture.positions.length);
 for(let i=0;i<data.length;i+=4)for(let k=0;k<3;k++)values[data[i]*3+k]=data[i+k+1]*scale;
 for(const [id,a,b]of fixture.parents)for(let k=0;k<3;k++)values[id*3+k]=(values[a*3+k]+values[b*3+k])/2;
 const rows=[];for(let i=0;i<values.length;i+=3)if(values[i]||values[i+1]||values[i+2])rows.push([i/3,values[i],values[i+1],values[i+2]]);return rows;
}

// Original constrained interior sampling and local Delaunay edge legalization.
// Persistent boundaries and internal lines are never moved or flipped.
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function seedPatternInterior(points,tris,constraints,h,maxTriangles=200000,contours=[],options={}){
 const bin=p=>p.map(v=>Math.floor(v/h)),key=(x,y)=>x+':'+y,vertices=new Map(),segments=new Map(),adjacency=new Map(),vertexFaces=[],epsilon=1e-12;
 const edgeKey=(a,b)=>a<b?key(a,b):key(b,a),orient=t=>cross(...t.map(i=>points[i]))>0?t:[t[0],t[2],t[1]];
 const addVertex=i=>{const k=key(...bin(points[i]));if(!vertices.has(k))vertices.set(k,[]);vertices.get(k).push(i);vertexFaces[i]=new Set();};
 const addFace=i=>{const t=tris[i];for(let j=0;j<3;j++){vertexFaces[t[j]].add(i);const k=edgeKey(t[j],t[(j+1)%3]);if(!adjacency.has(k))adjacency.set(k,new Set());adjacency.get(k).add(i);}};
 const removeFace=i=>{const t=tris[i];for(let j=0;j<3;j++){vertexFaces[t[j]].delete(i);adjacency.get(edgeKey(t[j],t[(j+1)%3])).delete(i);}};
 const work={edgeChecks:0,edgeFlips:0,queueCompactions:0,discardedQueuedChecks:0,maximumLocalChecks:0,maximumLocalCheckBudget:10000};
 const legalize=queue=>{let budget=10000,expanded=false,checks=0,pending=null;while(queue.length){if(--budget<0){
  if(expanded)throw Error('Panel local edge-flip budget exceeded. Simplify the panel.');
  // Preserve the ordinary path. Only a formerly exhausted queue is compacted;
  // retain the most recently queued occurrence of each still-relevant edge.
  // Suppress duplicate pending checks after compaction; long initial boundary
  // fans otherwise consume the guard on redundant queue entries.
  const unique=[],seen=new Set(),before=queue.length;for(let i=queue.length-1;i>=0;i--){const k=queue[i];if(!seen.has(k)&&!constraints.has(k)&&adjacency.get(k)?.size===2){seen.add(k);unique.push(k);}}
  queue.length=0;for(let i=unique.length-1;i>=0;i--)queue.push(unique[i]);pending=new Set(queue);work.queueCompactions++;work.discardedQueuedChecks+=before-queue.length;
  const extra=Math.min(100000,Math.max(10000,tris.length*64));work.maximumLocalCheckBudget=Math.max(work.maximumLocalCheckBudget,10000+extra);budget=extra-1;expanded=true;if(!queue.length)break;
 }checks++;work.edgeChecks++;work.maximumLocalChecks=Math.max(work.maximumLocalChecks,checks);const k=queue.pop();pending?.delete(k);const fs=adjacency.get(k);if(fs?.size!==2||constraints.has(k))continue;const [f,g]=fs,[u,v]=k.split(':').map(Number),x=tris[f].find(i=>i!==u&&i!==v),y=tris[g].find(i=>i!==u&&i!==v);if(x===y||(options.qualityOnly&&distance(points[x],points[y])>h*1.001)||adjacency.get(edgeKey(x,y))?.size||cross(points[x],points[y],points[u])*cross(points[x],points[y],points[v])>=-1e-20)continue;const t=orient([u,v,x]),a=points[t[0]].map((n,i)=>n-points[y][i]),b=points[t[1]].map((n,i)=>n-points[y][i]),c=points[t[2]].map((n,i)=>n-points[y][i]),sq=p=>p[0]*p[0]+p[1]*p[1],det=sq(a)*cross([0,0],b,c)-sq(b)*cross([0,0],a,c)+sq(c)*cross([0,0],a,b);if(det<=1e-18)continue;work.edgeFlips++;removeFace(f);removeFace(g);tris[f]=orient([x,y,u]);tris[g]=orient([y,x,v]);addFace(f);addFace(g);for(const fi of [f,g])for(let j=0;j<3;j++){const next=edgeKey(tris[fi][j],tris[fi][(j+1)%3]);if(!pending?.has(next)){queue.push(next);pending?.add(next);}else work.discardedQueuedChecks++;}}};
 points.forEach((_,i)=>addVertex(i));tris.forEach((_,i)=>addFace(i));
 for(const pair of constraints){const ids=pair.split(':').map(Number),p=ids.map(i=>points[i]),a=bin([Math.min(p[0][0],p[1][0]),Math.min(p[0][1],p[1][1])]),b=bin([Math.max(p[0][0],p[1][0]),Math.max(p[0][1],p[1][1])]);for(let x=a[0];x<=b[0];x++)for(let y=a[1];y<=b[1];y++){const k=key(x,y);if(!segments.has(k))segments.set(k,[]);segments.get(k).push(ids);}}
 const inside=pt=>{let yes=false;for(const ring of contours)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=points[ring[i]],b=points[ring[j]];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return !contours.length||yes;};
 let lastFace=0,walks=0;
 const locate=(pt,start)=>{let fi=start;const visited=new Set();while(!visited.has(fi)){if(++walks>40000000)throw Error('Panel point-location budget exceeded. Increase particle distance.');visited.add(fi);const t=tris[fi];let next=null;for(let j=0;j<3;j++)if(cross(points[t[j]],points[t[(j+1)%3]],pt)<-epsilon){const edge=adjacency.get(edgeKey(t[j],t[(j+1)%3]));next=[...edge].find(i=>i!==fi);break;}if(next===null){const affected=[fi];for(let j=0;j<3;j++)if(Math.abs(cross(points[t[j]],points[t[(j+1)%3]],pt))<=epsilon)for(const other of adjacency.get(edgeKey(t[j],t[(j+1)%3])))if(other!==fi&&!affected.includes(other))affected.push(other);return affected;}if(next===undefined)break;fi=next;}
  // A straight walk can meet a hole or concavity. The bounded fallback only
  // runs for points proven inside the authored domain.
  const hits=[];for(let i=0;i<tris.length;i++){if(++walks>40000000)throw Error('Panel point-location budget exceeded. Increase particle distance.');if(tris[i].every((a,j)=>cross(points[a],points[tris[i][(j+1)%3]],pt)>=-epsilon))hits.push(i);}return hits;
 };
 const initial=points.length,lo=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],hi=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],spacing=h*.78,dy=spacing*Math.sqrt(3)/2,rows=Math.ceil((hi[1]-lo[1])/dy),cols=Math.ceil((hi[0]-lo[0])/spacing);
 if(rows*cols>250000)throw Error('Panel interior sampling exceeds the work budget. Increase particle distance.');
 if(!options.qualityOnly)for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
  const pt=[lo[0]+(col+(row%2)*.5)*spacing,lo[1]+row*dy];if(!inside(pt))continue;const [x,y]=bin(pt);let available=true,start=lastFace,nearest=Infinity;
  for(let dx=-1;dx<=1&&available;dx++)for(let dy=-1;dy<=1&&available;dy++){const k=key(x+dx,y+dy);for(const i of vertices.get(k)||[]){const d=distance(points[i],pt);if(d<h*.42){available=false;break;}if(d<nearest&&vertexFaces[i].size){nearest=d;start=vertexFaces[i].values().next().value;}}for(const [a,b] of segments.get(k)||[]){const u=points[a],v=points[b],d=v.map((n,i)=>n-u[i]),t=Math.max(0,Math.min(1,((pt[0]-u[0])*d[0]+(pt[1]-u[1])*d[1])/(d[0]*d[0]+d[1]*d[1])));if(distance(pt,u.map((n,i)=>n+d[i]*t))<h*.32){available=false;break;}}}
  if(!available)continue;const affected=locate(pt,start);if(!affected.length)throw Error('Interior sample escaped its constrained domain. Simplify the panel.');
  const id=points.length,replacements=[];for(const fi of affected){const t=tris[fi];for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3];if(cross(points[a],points[b],pt)>epsilon)replacements.push([a,b,id]);}}
  if(replacements.length<=affected.length)continue;if(tris.length+replacements.length-affected.length>maxTriangles)throw Error('Pattern mesh exceeds 200,000 triangles. Increase particle distance.');
  affected.forEach(removeFace);points.push(pt);addVertex(id);const queue=[];replacements.forEach((t,i)=>{const fi=i<affected.length?affected[i]:tris.length;tris[fi]=t;addFace(fi);for(let j=0;j<3;j++)queue.push(edgeKey(t[j],t[(j+1)%3]));});legalize(queue);lastFace=vertexFaces[id].values().next().value;
 }

 // Interior refinement is optional and bounded. Refuse constraint encroachment
 // rather than splitting an authored/sewn boundary independently. Unresolved
 // acute corners and exhausted budgets retain the measured quality warning.
 const quality={insertions:0,candidates:0,faceChecks:0,blocked:0,limitReached:false,insertionBudget:64,faceCheckBudget:2000000};
 if(options.qualityOnly){
  const blocked=new Set(),threshold=Math.sin(20*Math.PI/180)**2;
  while(quality.insertions<quality.insertionBudget){
   let worst=null;
   for(let f=0;f<tris.length;f++){
    if(++quality.faceChecks>quality.faceCheckBudget){quality.faceChecks=quality.faceCheckBudget;quality.limitReached=true;break;}
    const t=tris[f],identity=t.slice().sort((a,b)=>a-b).join(':');if(blocked.has(identity))continue;
    const [a,b,c]=t.map(i=>points[i]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),w=c.map((v,k)=>v-b[k]),area=u[0]*v[1]-u[1]*v[0],uu=u[0]**2+u[1]**2,vv=v[0]**2+v[1]**2,ww=w[0]**2+w[1]**2,score=area*area/Math.max(uu*vv,uu*ww,vv*ww);
    if(score<threshold&&(!worst||score<worst.score))worst={f,t,identity,a,u,v,area,uu,vv,score};
   }
   if(quality.limitReached||!worst)break;
   quality.candidates++;const {f,t,identity,a,u,v,area,uu,vv}=worst;
   const pt=[a[0]+(uu*v[1]-vv*u[1])/(2*area),a[1]+(u[0]*vv-v[0]*uu)/(2*area)];
   let available=pt.every(Number.isFinite)&&inside(pt)&&t.every(i=>distance(pt,points[i])<=h*1.001);
   if(available){const [x,y]=bin(pt);for(let dx=-1;dx<=1&&available;dx++)for(let dy=-1;dy<=1&&available;dy++){
    for(const i of vertices.get(key(x+dx,y+dy))||[])if(distance(pt,points[i])<Math.max(h*1e-5,1e-8)){available=false;break;}
    for(const [i,j] of segments.get(key(x+dx,y+dy))||[]){const p=points[i],q=points[j],mid=p.map((v,k)=>(v+q[k])/2);if(distance(pt,mid)<distance(p,q)/2*(1-1e-9)){available=false;break;}}
   }}
   if(!available){blocked.add(identity);quality.blocked++;continue;}
   const affected=locate(pt,f);if(!affected.length){blocked.add(identity);quality.blocked++;continue;}
   const id=points.length,replacements=[];for(const fi of affected){const old=tris[fi];for(let j=0;j<3;j++){const x=old[j],y=old[(j+1)%3];if(cross(points[x],points[y],pt)>epsilon)replacements.push([x,y,id]);}}
   if(replacements.length<=affected.length){blocked.add(identity);quality.blocked++;continue;}
   if(tris.length+replacements.length-affected.length>maxTriangles){quality.limitReached=true;break;}
   affected.forEach(removeFace);points.push(pt);addVertex(id);const queue=[];replacements.forEach((t,i)=>{const fi=i<affected.length?affected[i]:tris.length;tris[fi]=t;addFace(fi);for(let j=0;j<3;j++)queue.push(edgeKey(t[j],t[(j+1)%3]));});legalize(queue);quality.insertions++;
  }
  if(quality.insertions>=quality.insertionBudget)quality.limitReached=true;
 }
 return {seededVertices:points.length-initial,work,...(options.qualityOnly?{quality:{...quality,edgeWork:work}}:{})};
}

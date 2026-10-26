import test from 'node:test';
import assert from 'node:assert/strict';
import {improvePatternAngles} from '../src/pattern-quality.js';
import {hasPoorPatternAngles} from '../src/pattern-quality.js';
import {seedPatternInterior} from '../src/pattern-meshing.js';

function grid(distorted=true){
 const n=50,points=[],triangles=[],constraints=new Set(),key=(a,b)=>`${Math.min(a,b)}:${Math.max(a,b)}`;
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)points.push([x*.01,y*.01]);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const a=y*(n+1)+x;triangles.push([a,a+1,a+n+2],[a,a+n+2,a+n+1]);
  if(y===0||y===10)constraints.add(key(a,a+1));if(x===0)constraints.add(key(a,a+n+1));
  if(y===n-1)constraints.add(key(a+n+1,a+n+2));if(x===n-1)constraints.add(key(a+1,a+n+2));
 }
 if(distorted)points[25*51+25][0]+=.009;
 return {points,triangles,constraints};
}
function measure(points,triangles){
 let minimum=180,maxEdge=0;
 for(const t of triangles)for(let k=0;k<3;k++){
  const a=points[t[k]],b=points[t[(k+1)%3]],c=points[t[(k+2)%3]],u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),area=u[0]*v[1]-u[1]*v[0];
  assert.ok(area>2e-14,'no inverted or collapsed faces');minimum=Math.min(minimum,Math.atan2(area,u[0]*v[0]+u[1]*v[1])*180/Math.PI);maxEdge=Math.max(maxEdge,Math.hypot(...u));
 }
 return {minimum,maxEdge};
}
test('5,000-triangle quality smoothing improves the minimum angle while preserving exact boundaries, internal lines and connectivity',()=>{
 const q=grid(),before=structuredClone(q.points),triangles=structuredClone(q.triangles),fixed=new Set([...q.constraints].flatMap(k=>k.split(':').map(Number))),old=measure(q.points,q.triangles);
 const report=improvePatternAngles(q.points,q.triangles,q.constraints,.02),next=measure(q.points,q.triangles);
 assert.equal(q.triangles.length,5000);assert.ok(old.minimum<4);assert.ok(next.minimum>=20);assert.ok(next.maxEdge<=.02*1.001);
 for(const i of fixed)assert.deepEqual(q.points[i],before[i]);assert.deepEqual(q.triangles,triangles);assert.equal(report.complete,true);assert.ok(report.vertexMoves>0);
 const repeated=grid(),again=improvePatternAngles(repeated.points,repeated.triangles,repeated.constraints,.02);assert.deepEqual(repeated.points,q.points);assert.deepEqual(again,report);
});
test('quality smoothing leaves an already adequate detailed mesh byte-equivalent',()=>{
 const q=grid(false),before=JSON.stringify(q.points),report=improvePatternAngles(q.points,q.triangles,q.constraints,.02);
 assert.equal(report.vertexMoves,0);assert.equal(JSON.stringify(q.points),before);assert.ok(measure(q.points,q.triangles).minimum>40);
});
test('angle evaluation budget stops without leaving a tentative vertex move',()=>{
 const q=grid(),before=JSON.stringify(q.points),report=improvePatternAngles(q.points,q.triangles,q.constraints,.02,{maxEvaluations:1});
 assert.equal(report.complete,false);assert.equal(report.faceEvaluations,1);assert.equal(JSON.stringify(q.points),before);
});

test('constrained refinement repairs a short boundary interval in a detailed panel without moving or splitting authored constraints',()=>{
 const q=grid(false),n=50,id=q.points.length;q.points.push([.253,0]);q.triangles.splice(50,1,[25,id,77],[id,26,77]);
 q.constraints.delete('25:26');q.constraints.add(`25:${id}`);q.constraints.add(`26:${id}`);
 const before=structuredClone(q.points),constraints=[...q.constraints],boundary=Array.from({length:51},(_,i)=>i).flatMap(i=>i===25?[i,id]:[i]).concat(Array.from({length:50},(_,i)=>(i+1)*51+50),Array.from({length:50},(_,i)=>50*51+49-i),Array.from({length:49},(_,i)=>(49-i)*51));
 assert.equal(hasPoorPatternAngles(q.points,q.triangles),true);
 const report=seedPatternInterior(q.points,q.triangles,q.constraints,.0142,200000,[boundary],{qualityOnly:true});
 assert.ok(report.quality.insertions>0);assert.equal(report.quality.limitReached,false);assert.ok(q.triangles.length>=5000);assert.equal(hasPoorPatternAngles(q.points,q.triangles),false);
 assert.deepEqual(q.points.slice(0,before.length),before);assert.deepEqual([...q.constraints],constraints);
 const edges=new Set(q.triangles.flatMap(t=>t.map((a,i)=>`${Math.min(a,t[(i+1)%3])}:${Math.max(a,t[(i+1)%3])}`)));for(const edge of constraints)assert.ok(edges.has(edge));
 const measured=measure(q.points,q.triangles);assert.ok(measured.minimum>=20);assert.ok(measured.maxEdge<=.0142*1.001);
 const area=q.triangles.reduce((sum,t)=>{const [a,b,c]=t.map(i=>q.points[i]);return sum+((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);assert.ok(Math.abs(area-.25)<1e-12);
});

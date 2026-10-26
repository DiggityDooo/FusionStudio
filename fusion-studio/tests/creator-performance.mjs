// Numerical scaling probe on conformingly refined copies of the actual adult
// cage. Refinement adds sampling density, not scanned anatomical detail. This
// does not measure worker transfer, history, attachment fitting, or orbit FPS.
import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {computeCreator,creatorInputs,defaultRecipe} from '../src/creator-data.js';
const definition=JSON.parse(zlib.gunzipSync(fs.readFileSync('public/characters/makehuman-v1.json.gz'))),source=definition.source;
const initial=computeCreator(creatorInputs(definition,defaultRecipe('male'))).positions;
function refine(target){
 const positions=Array.from(initial),parents=[];let faces=Array.from({length:source.triangles.length/3},(_,i)=>source.triangles.slice(i*3,i*3+3));
 const edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
 while(faces.length<target-1){const edges=new Map();for(const t of faces)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],key=edge(a,b);if(!edges.has(key))edges.set(key,{a,b,key,d:[0,1,2].reduce((n,k)=>n+(positions[a*3+k]-positions[b*3+k])**2,0)});}
  const chosen=[...edges.values()].sort((a,b)=>b.d-a.d||a.a-b.a||a.b-b.b).slice(0,Math.max(1,Math.floor((target-faces.length)/2))),mids=new Map();for(const {a,b,key} of chosen){const id=positions.length/3;mids.set(key,id);parents.push([id,a,b]);for(let k=0;k<3;k++)positions.push((positions[a*3+k]+positions[b*3+k])/2);}
  const next=[];for(const t of faces){const m=t.map((v,i)=>mids.get(edge(v,t[(i+1)%3]))),count=m.filter(v=>v!==undefined).length;if(!count)next.push(t);else if(count===3)next.push([t[0],m[0],m[2]],[m[0],t[1],m[1]],[m[2],m[1],t[2]],[m[0],m[1],m[2]]);else if(count===1){const i=m.findIndex(v=>v!==undefined),a=t[i],b=t[(i+1)%3],c=t[(i+2)%3];next.push([a,m[i],c],[m[i],b,c]);}else{const i=(m.findIndex(v=>v===undefined)+1)%3,a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],p=m[i],q=m[(i+1)%3];next.push([b,q,p],[a,p,q],[a,q,c]);}}faces=next;
 }
 return {positions,parents,faces,bodyIds:[...new Set(faces.flat())]};
}
const selected=definition.controls.slice(0,64).map(c=>source.targets[c.positive]),results=[];
for(const requested of [50000,100000,200000]){const fixture=refine(requested),targets=selected.map(data=>{const values=new Float32Array(fixture.positions.length);for(let i=0;i<data.length;i+=4)values.set(data.slice(i+1,i+4),data[i]*3);for(const [id,a,b]of fixture.parents)for(let k=0;k<3;k++)values[id*3+k]=(values[a*3+k]+values[b*3+k])/2;const sparse=[];for(let i=0;i<values.length;i+=3)if(values[i]||values[i+1]||values[i+2])sparse.push(i/3,values[i],values[i+1],values[i+2]);return {data:sparse,value:.05};});
 for(const controls of [0,16,64]){const input={positions:fixture.positions,bodyIds:fixture.bodyIds,height:1.8,targets:targets.slice(0,controls)};computeCreator(input);const times=[];let result;for(let i=0;i<7;i++){const start=performance.now();result=computeCreator(input);times.push(performance.now()-start);}assert.ok(result.positions.every(Number.isFinite));times.sort((a,b)=>a-b);results.push({requestedTriangles:requested,triangles:fixture.faces.length,vertices:fixture.positions.length/3,activeDetailControls:controls,sparseDeltas:result.sparseDeltas,medianMs:times[3],maximumMs:times.at(-1),algorithmWithin100ms:times[3]<=100});}
}
const report={measuredAt:new Date().toISOString(),foundation:definition.identity,method:'conforming edge-midpoint refinement of detailed HM08 male; positive sparse targets linearly interpolated onto refined vertices',scope:'warm synchronous sparse evaluator only; not end-to-end interactive acceptance',limits:['No new scan detail is introduced by tessellation.','History, workers, normals, rig refit, hair, garments and viewport FPS are excluded.','The <=100 ms end-to-end preview and >=30 fps viewport targets remain unverified by this numerical probe.'],results};fs.writeFileSync('test-output/creator-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

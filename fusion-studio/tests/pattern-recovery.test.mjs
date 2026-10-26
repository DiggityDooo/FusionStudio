import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {starterPattern,migratePattern,buildPattern} from '../src/patterns.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');
const edge=(a,b)=>`${Math.min(a,b)}:${Math.max(a,b)}`;
function fixture(lines,distance=.02){
 const doc=migratePattern(starterPattern());doc.particleDistance=distance;
 doc.panels[0].holes=[{id:'opening',points:[[-.06,.2],[.06,.2],[.06,.34],[-.06,.34]],segments:[0,1,2,3].map(i=>({id:'opening_'+i,type:'line'}))}];
 doc.panels[0].internalLines=lines.map((points,i)=>({id:'line_'+i,points}));
 doc.seams=[{id:'partial',a:{panel:'front',segment:'front_s1',start:.17,end:.83},b:{panel:'back',segment:'back_s3',start:.09,end:.91},reverse:true}];return doc;
}
test('detailed holed panels recover vertical, reversed, slanted and bent internal chains without cycling or disturbing partial seams',()=>{
 const cases=[[[[[-.2,.1],[-.2,.5]]],.011],[[[[-.2,.5],[-.2,.1]]],.011],[[[[-.2,.1],[-.2,.5]]],.005],[[[[-.24,.08],[-.13,.55]]],.02],[[[[-.2,.12],[-.2,.48],[-.1,.5]],[[-.22,.55],[.22,.55]]],.02]];
 for(const [lines,distance] of cases){
  const doc=fixture(lines,distance),before=JSON.stringify(doc),mesh=buildPattern(doc),edges=new Set(mesh.faces.flatMap(t=>t.map((a,i)=>edge(a,t[(i+1)%3]))));assert.ok(mesh.faces.length>=5000);assert.equal(JSON.stringify(doc),before);if(distance===.005){assert.ok(mesh.faces.length>100000);assert.ok(mesh.quality.minAngleDegrees>=20);const w=mesh.quality.triangulationWork.back;assert.ok(w.queueCompactions>0);assert.ok(w.discardedQueuedChecks>1000);assert.ok(w.maximumLocalChecks<=w.maximumLocalCheckBudget);assert.ok(w.maximumLocalCheckBudget<=110000);}
  for(const chain of [...Object.values(mesh.internalChains),...Object.values(mesh.segmentChains).map(c=>c.indices)])for(let i=1;i<chain.length;i++)assert.ok(edges.has(edge(chain[i-1],chain[i])));
  const topology=JSON.parse(native.analyzeMesh(JSON.stringify({positions:Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(i*3,i*3+3)),faces:mesh.faces})));assert.equal(topology.components,2);assert.equal(topology.boundaryEdges,Object.values(mesh.segmentChains).reduce((n,c)=>n+c.indices.length-1,0));
  let area=0;for(const t of mesh.faces){const [a,b,c]=t.map(i=>mesh.uvs.slice(i*2,i*2+2)),cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert.ok(cross>0);area+=cross/2;}assert.ok(Math.abs(area-(.56*.65*2-.12*.14))<1e-10);
  const a=mesh.segmentChains['front:front_s1'],b=mesh.segmentChains['back:back_s3'];for(const [x,y] of mesh.seamCorrespondence[0].pairs){const u=(a.parameters[a.indices.indexOf(x)]-.17)/.66,v=1-(b.parameters[b.indices.indexOf(y)]-.09)/.82;assert.ok(Math.abs(u-v)<1e-8);}
 }
});
test('invalid crossing internals are rejected without altering the source pattern',()=>{
 const doc=fixture([[[-.23,.1],[-.13,.5]],[[-.13,.1],[-.23,.5]]]),before=JSON.stringify(doc);assert.throws(()=>buildPattern(doc),/Internal lines cannot cross/);assert.equal(JSON.stringify(doc),before);
});

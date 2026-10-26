import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {starterPattern,migratePattern,measurePatternSeams,buildPattern} from '../src/patterns.js';

// x=t, y=t² is represented exactly by this cubic; its arc length is analytic.
const primitive=t=>t*Math.sqrt(1+4*t*t)/2+Math.asinh(2*t)/4;
function curved(){
 const doc=migratePattern(starterPattern());doc.particleDistance=.012;
 for(const p of doc.panels){p.points=[[0,0],[1,1],[0,1]];p.segments=p.segments.slice(0,3);p.segments[0]={id:p.id+'_s0',type:'cubic',controls:[[1/3,0],[2/3,1/3]]};}
 doc.seams=[{id:'curved-partial',a:{panel:'front',segment:'front_s0',start:.13,end:.91},b:{panel:'back',segment:'back_s0',start:.17,end:.87},reverse:true}];
 return doc;
}

test('legacy seam measurements use deterministic migration IDs without mutating the project',()=>{
 const doc=starterPattern(),before=structuredClone(doc),legacy=measurePatternSeams(doc),migrated=measurePatternSeams(migratePattern(doc));
 assert.deepEqual(doc,before);assert.deepEqual(legacy,migrated);assert.deepEqual(measurePatternSeams(doc),legacy);
 assert.deepEqual(legacy.seams.map(s=>s.id),['seam_0','seam_1']);assert.equal(legacy.seams[0].a.segment,'front_s1');
 assert.equal(legacy.seams[0].lengthA,.65);assert.equal(legacy.maxMismatchRatio,0);assert.equal(legacy.meanLengthRatio,1);
 assert.equal(legacy.seams[0].orientation,'reversed');assert.deepEqual(legacy.seams[0].endpoints.b,[legacy.seams[0].b.endPoint,legacy.seams[0].b.startPoint]);
 assert.ok(!Object.hasOwn(legacy.seams[0],'pairs'),'measurement stores authored ranges rather than mesh pairs');
});

test('adaptive partial cubic arc lengths match an analytic reference with bounded error',()=>{
 const doc=curved(),report=measurePatternSeams(doc,{tolerance:1e-7}),s=report.seams[0];
 for(const [side,start,end] of [['a',.13,.91],['b',.17,.87]]){const exact=primitive(end)-primitive(start);assert.ok(Math.abs(s[side].length-exact)<=s[side].errorBound+2e-14);assert.ok(s[side].errorBound<=report.tolerance);assert.equal(s[side].converged,true);}
 const exactA=primitive(.91)-primitive(.13),exactB=primitive(.87)-primitive(.17);
 assert.ok(Math.abs(s.deltaLength-(exactA-exactB))<2e-7);assert.ok(Math.abs(s.easePercent-100*(exactA-exactB)/exactB)<3e-5);
 assert.equal(s.a.start,.13);assert.equal(s.a.end,.91);assert.equal(report.maxMismatchRatio,s.mismatchRatio);assert.equal(report.meanMismatchRatio,s.mismatchRatio);
});

test('authored seam diagnostics remain identical after detailed triangulation and resolution changes',()=>{
 const doc=curved(),before=structuredClone(doc),report=measurePatternSeams(doc),start=performance.now(),fine=buildPattern(doc);
 assert.ok(fine.faces.length>20000,`detailed fixture contains ${fine.faces.length} triangles`);assert.deepEqual(doc,before);assert.deepEqual(measurePatternSeams(doc),report);
 doc.particleDistance=.04;const coarse=buildPattern(doc);assert.ok(coarse.faces.length<fine.faces.length);assert.deepEqual(measurePatternSeams(doc),report);
 console.log(JSON.stringify({fixture:'seam-arc-length',fineTriangles:fine.faces.length,coarseTriangles:coarse.faces.length,ms:performance.now()-start,lengthA:report.seams[0].lengthA,lengthB:report.seams[0].lengthB}));
});

test('signed ease, mismatch warnings and reversed direction have explicit meanings',()=>{
 const doc=starterPattern();doc.panels[1].points=doc.panels[1].points.map(([x,y])=>[x*.5,y*.5]);const report=measurePatternSeams(doc),s=report.seams[0];
 assert.equal(s.deltaLength,.325);assert.equal(s.easePercent,100);assert.equal(s.mismatchRatio,.5);assert.equal(s.lengthRatio,2);assert.equal(report.maxLengthRatio,2);assert.equal(report.meanLengthRatio,2);
 assert.match(s.warnings[0],/side A.*325\.0 mm.*50\.0% mismatch/);
 const reversed=structuredClone(doc);reversed.seams[0].reverse=false;const same=measurePatternSeams(reversed).seams[0];assert.equal(same.lengthA,s.lengthA);assert.equal(same.orientation,'same');assert.deepEqual(same.endpoints.b,[same.b.startPoint,same.b.endPoint]);
 const swap=structuredClone(doc);[swap.seams[0].a,swap.seams[0].b]=[swap.seams[0].b,swap.seams[0].a];assert.equal(measurePatternSeams(swap).seams[0].easePercent,-50);
});

test('hole boundaries are resolved by stable segment ID',()=>{
 const doc=migratePattern(starterPattern()),points=[[-.1,.2],[.1,.2],[.1,.4],[-.1,.4]];doc.panels[0].holes=[{id:'hole',points,segments:points.map((_,i)=>({id:'hole_s'+i,type:'line'}))}];
 doc.seams=[{id:'hole-seam',a:{panel:'front',segment:'hole_s0',start:.25,end:.75},b:{panel:'back',segment:'back_s0',start:0,end:1},reverse:false}];
 const s=measurePatternSeams(doc).seams[0];assert.equal(s.a.segment,'hole_s0');assert.ok(Math.abs(s.lengthA-.1)<1e-12);assert.deepEqual(s.a.startPoint,[-.05,.2]);
});

test('malformed ranges and missing references fail with actionable reports',()=>{
 const doc=curved();doc.seams[0].a.segment='missing';assert.throws(()=>measurePatternSeams(doc),/missing segment/);
 doc.seams[0].a.segment='front_s0';doc.seams[0].a.panel='missing';assert.throws(()=>measurePatternSeams(doc),/missing panel/);
 doc.seams[0].a.panel='front';doc.seams[0].a.start=.95;assert.throws(()=>measurePatternSeams(doc),/Seam ranges/);
 assert.throws(()=>measurePatternSeams(curved(),{tolerance:0}),/tolerance/);assert.throws(()=>measurePatternSeams(curved(),{tolerance:NaN}),/tolerance/);
 const empty=curved();empty.seams=[];assert.equal(measurePatternSeams(empty).meanMismatchRatio,0);assert.equal(measurePatternSeams(empty).maxLengthRatio,1);
});

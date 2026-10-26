// Private detailed character fixture; neither source assets nor native binaries
// are checked into the public test code or copied into application packages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {GeometryEngine}=require('../electron/geometry.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const baseline=path.join(output,'cloth-performance-baseline.node');assert.equal(hash(baseline),'29b99735f4b8b3bc87ef4aa4ade70d33247ee850e2802be37a3e31f6ff002015');
 const fixture=JSON.parse(fs.readFileSync(path.join(output,'physical-sparse-probe.json'))),request=fixture.request,rows=[];
 for(const [label,binary] of [['baseline',baseline],['current',path.join(root,'native/fusion_geometry.node')]]){
  const engine=new GeometryEngine(binary);try{const result=await engine.run('drapeGarment',request),m=result.metrics,p=m.physicalFabric;
   for(const key of ['bodyFaceIntersections','bodyInsideVertices','triangleClearanceViolations','pinDrift'])assert.equal(m[key],0,key);
   assert.ok(p.maximumSpeedMps<.02);assert.ok(m.maxStrain<=.5&&m.seamGapAfter<=.005);assert.ok(p.lastLinearRelativeResidual<=request.fabricMaterial.linearTolerance||p.lastLinearAbsoluteResidualN<=request.fabricMaterial.linearAbsoluteToleranceN);assert.equal(p.unconvergedContactSets,0);assert.equal(p.stalledProjections,0);
   rows.push({label,sha256:hash(binary),result});console.log(label,JSON.stringify({milliseconds:m.milliseconds,linearSolves:p.linearIterations,phases:p.phaseMilliseconds,warmStarts:p.supportWarmStarts,coldRestarts:p.supportColdRestarts}));
  }finally{await engine.close();}
 }
 let maximumPositionDifferenceM=0;for(let i=0;i<rows[0].result.positions.length;i++)maximumPositionDifferenceM=Math.max(maximumPositionDifferenceM,Math.hypot(...rows[0].result.positions[i].map((v,a)=>v-rows[1].result.positions[i][a])));
 assert.ok(maximumPositionDifferenceM<1e-5,'Detailed physical solutions differ by more than 10 micrometres');
 const ratio=rows[1].result.metrics.milliseconds/rows[0].result.metrics.milliseconds;
 fs.writeFileSync(path.join(output,'physical-performance-results.json'),JSON.stringify({passed:true,scope:'Sequential single-run native timings on the same owned detailed Genesis/cloth inputs, same settings and unchanged numerical gates. Not a general speedup guarantee or an interactive frame-rate claim.',bodyTriangles:request.triangleCollider.triangles.length,clothTriangles:request.faces.length,maximumPositionDifferenceM,currentToBaselineTimeRatio:ratio,rows},null,2));
 console.log('Physical performance fixture PASS',JSON.stringify({maximumPositionDifferenceM,currentToBaselineTimeRatio:ratio}));
})().catch(error=>{console.error(error);process.exitCode=1;});

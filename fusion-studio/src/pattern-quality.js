// Bounded max-min angle smoothing. Authored boundaries and internal constraints
// stay fixed. Connectivity, UV seam identities and sewing samples never change.
export function hasPoorPatternAngles(points,triangles,targetDegrees=20){
 const threshold=Math.sin(targetDegrees*Math.PI/180)**2;
 return triangles.some(t=>{
  const [a,b,c]=t.map(i=>points[i]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),w=c.map((v,k)=>v-b[k]),area=u[0]*v[1]-u[1]*v[0];
  const aa=u[0]**2+u[1]**2,bb=v[0]**2+v[1]**2,cc=w[0]**2+w[1]**2;
  return area<=2e-14||area*area/Math.max(aa*bb,aa*cc,bb*cc)<threshold;
 });
}
export function improvePatternAngles(points,triangles,constraints,h,{targetDegrees=20,maxPasses=8,maxEvaluations=2000000}={}){
 const fixed=new Set([...constraints].flatMap(k=>k.split(':').map(Number)));
 const incident=Array.from({length:points.length},()=>[]),neighbours=Array.from({length:points.length},()=>new Set());
 for(let f=0;f<triangles.length;f++)for(let k=0;k<3;k++){const i=triangles[f][k];incident[i].push(f);neighbours[i].add(triangles[f][(k+1)%3]);neighbours[i].add(triangles[f][(k+2)%3]);}
 const report={vertexMoves:0,passes:0,faceEvaluations:0,faceEvaluationBudget:maxEvaluations,passBudget:maxPasses,complete:true},target=Math.sin(targetDegrees*Math.PI/180)**2,maxEdge2=(h*1.001)**2;
 const faceScore=f=>{
  if(report.faceEvaluations>=maxEvaluations){report.complete=false;return -Infinity;}
  report.faceEvaluations++;const [a,b,c]=triangles[f].map(i=>points[i]),ab=[b[0]-a[0],b[1]-a[1]],ac=[c[0]-a[0],c[1]-a[1]],bc=[c[0]-b[0],c[1]-b[1]],area=ab[0]*ac[1]-ab[1]*ac[0];
  const lengths=[ab[0]**2+ab[1]**2,ac[0]**2+ac[1]**2,bc[0]**2+bc[1]**2];
  if(area<=2e-14||lengths.some(v=>v>maxEdge2))return -Infinity;
  // The smallest sine of a triangle's angles belongs to a smallest angle.
  return area*area/Math.max(lengths[0]*lengths[1],lengths[0]*lengths[2],lengths[1]*lengths[2]);
 };
 const vertexScore=i=>{let score=Infinity;for(const f of incident[i])score=Math.min(score,faceScore(f));return score;};
 const directions=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
 const supportTarget=Math.sin(Math.min(35,targetDegrees+10)*Math.PI/180)**2;
 for(let pass=0;pass<maxPasses;pass++){
  const scores=new Map(),bad=[];for(let i=0;i<points.length;i++)if(!fixed.has(i)&&incident[i].length){const score=vertexScore(i);if(!report.complete)return report;scores.set(i,score);if(score<target)bad.push(i);}
  if(!bad.length)break;
  // Give an under-resolved boundary triangle room to improve: its well-shaped
  // neighbours may otherwise pin the feasible region at the maximum edge size.
  // Every accepted support move still improves its own minimum incident angle.
  const active=new Set(bad);for(const i of bad)for(const j of neighbours[i])if(scores.has(j))active.add(j);
  const ranked=[...active].map(i=>({i,score:scores.get(i)}));ranked.sort((a,b)=>a.score-b.score||a.i-b.i);report.passes++;let moved=0;
  for(const {i} of ranked){
   let bestScore=vertexScore(i);if(!report.complete)return report;if(bestScore>=supportTarget)continue;
   const old=points[i],nearest=Math.min(...[...neighbours[i]].map(j=>Math.hypot(points[j][0]-old[0],points[j][1]-old[1])));let best=old;
   for(const scale of [.2,.1,.05,.025,.0125])for(const direction of directions){
    const candidate=old.map((v,k)=>v+direction[k]*nearest*scale);points[i]=candidate;const score=vertexScore(i);points[i]=old;
    if(!report.complete)return report;if(score>bestScore+1e-12){bestScore=score;best=candidate;}
   }
   if(best!==old){points[i]=best;moved++;report.vertexMoves++;}
  }
  if(!moved)break;
 }
 return report;
}

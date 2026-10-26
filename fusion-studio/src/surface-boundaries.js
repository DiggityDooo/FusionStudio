// Original bounded approximation of a parameterized UV polyline. The reported
// bound uses Bezier convex hulls, rather than a finite set of visual samples.
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function splitBoundaryCurve(p,t){const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t),d=mix(a,b,t),e=mix(b,c,t),f=mix(d,e,t);return [[p[0],a,d,f],[f,e,c,p[3]]];}
export function boundaryCurveInterval(p,start,end){if(start<0||end>1||end<=start)throw Error('Invalid boundary curve interval.');let curve=p;if(end<1)curve=splitBoundaryCurve(curve,end)[0];if(start>0)curve=splitBoundaryCurve(curve,start/end)[1];return curve;}
function leastSquares(points,ts){
 const a=points[0],b=points.at(-1);let aa=0,ab=0,bb=0,r1=[0,0],r2=[0,0];
 for(let i=0;i<points.length;i++){const t=ts[i],u=1-t,b0=u**3,b1=3*u*u*t,b2=3*u*t*t,b3=t**3;aa+=b1*b1;ab+=b1*b2;bb+=b2*b2;for(let k=0;k<2;k++){const rhs=points[i][k]-b0*a[k]-b3*b[k];r1[k]+=b1*rhs;r2[k]+=b2*rhs;}}
 const det=aa*bb-ab*ab;if(det<1e-14)return [a,mix(a,b,1/3),mix(a,b,2/3),b];
 return [a,r1.map((v,k)=>(v*bb-r2[k]*ab)/det),r2.map((v,k)=>(v*aa-r1[k]*ab)/det),b];
}
function errorBound(curve,points,ts){let bound=0,worst=0;for(let i=0;i<points.length-1;i++){const part=boundaryCurveInterval(curve,ts[i],ts[i+1]),line=[points[i],mix(points[i],points[i+1],1/3),mix(points[i],points[i+1],2/3),points[i+1]],error=Math.max(...part.map((p,j)=>distance(p,line[j])));if(error>bound){bound=error;worst=i;}}return {bound,worst};}

export function fitBoundaryChain(points,parameters,{tolerance=.0005,maxPieces=128}={}){
 if(!Array.isArray(points)||points.length<2||points.length>10000||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>20))||!Array.isArray(parameters)||parameters.length!==points.length||parameters.some((v,i)=>!Number.isFinite(v)||v<0||v>1||(i&&v<=parameters[i-1])))throw Error('Invalid source boundary samples or parameters.');
 if(!Number.isFinite(tolerance)||tolerance<1e-6||tolerance>.005||!Number.isInteger(maxPieces)||maxPieces<1||maxPieces>1024)throw Error('Boundary tolerance must be 0.001–5 mm within a bounded piece budget.');
 const pieces=[],stack=[[0,points.length-1]];
 while(stack.length){const [first,last]=stack.pop(),start=parameters[first],end=parameters[last],samples=points.slice(first,last+1),ts=parameters.slice(first,last+1).map(t=>(t-start)/(end-start)),curve=leastSquares(samples,ts),error=errorBound(curve,samples,ts);
  if(error.bound<=tolerance||last-first===1){pieces.push({start,end,curve,errorBound:error.bound});if(pieces.length+stack.length>maxPieces)throw Error('Boundary curvature exceeds the piece budget. Increase tolerance or split a working copy into more panels.');}
  else {const split=first+Math.max(1,Math.min(last-first-1,error.worst+1));stack.push([split,last],[first,split]);if(pieces.length+stack.length>maxPieces)throw Error('Boundary curvature exceeds the piece budget. Increase tolerance or split a working copy into more panels.');}
 }
 return {pieces,errorBound:Math.max(...pieces.map(p=>p.errorBound)),tolerance};
}

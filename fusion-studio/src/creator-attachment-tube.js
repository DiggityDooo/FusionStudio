import {CatmullRomCurve3,TubeGeometry,Vector3} from 'three';

// Cubic arithmetic adapted from Three.js r186 (MIT); full notice in
// docs/native-dependencies/three-attachment-curves-NOTICE.txt.
// Compile only during this synchronous geometry build. The returned path keeps
// Three's normal mutable-curve behavior; no cross-edit coefficient cache exists.
function compiledSampler(points){
 const segments=points.length-1,coefficients=new Float64Array(segments*12);
 const first=new Vector3().subVectors(points[0],points[1]).add(points[0]);
 const last=new Vector3().subVectors(points[segments],points[segments-1]).add(points[segments]);
 for(let i=0;i<segments;i++){
  const p0=i?points[i-1]:first,p1=points[i],p2=points[i+1],p3=i+2<=segments?points[i+2]:last;
  let dt0=Math.pow(p0.distanceToSquared(p1),.25),dt1=Math.pow(p1.distanceToSquared(p2),.25),dt2=Math.pow(p2.distanceToSquared(p3),.25);
  if(dt1<1e-4)dt1=1;if(dt0<1e-4)dt0=dt1;if(dt2<1e-4)dt2=dt1;
  for(let axis=0;axis<3;axis++){
   const key=axis===0?'x':axis===1?'y':'z',x0=p0[key],x1=p1[key],x2=p2[key],x3=p3[key];
   let t1=(x1-x0)/dt0-(x2-x0)/(dt0+dt1)+(x2-x1)/dt1;
   let t2=(x2-x1)/dt1-(x3-x1)/(dt1+dt2)+(x3-x2)/dt2;
   t1*=dt1;t2*=dt1;
   const at=i*12+axis*4;
   coefficients[at]=x1;coefficients[at+1]=t1;
   coefficients[at+2]=-3*x1+3*x2-2*t1-t2;
   coefficients[at+3]=2*x1-2*x2+t1+t2;
  }
 }
 return function getPoint(t,target=new Vector3()){
  if(!(t>=0&&t<=1))return CatmullRomCurve3.prototype.getPoint.call(this,t,target);
  const p=segments*t;let index=Math.floor(p),weight=p-index;
  if(weight===0&&index===segments){index=segments-1;weight=1;}
  const at=index*12,t2=weight*weight,t3=t2*weight,c=coefficients;
  return target.set(c[at]+c[at+1]*weight+c[at+2]*t2+c[at+3]*t3,
   c[at+4]+c[at+5]*weight+c[at+6]*t2+c[at+7]*t3,
   c[at+8]+c[at+9]*weight+c[at+10]*t2+c[at+11]*t3);
 };
}

/** Same detailed, tapered attachment tube as the original Three implementation. */
export function createAttachmentTube(points,radius){
 if(!Array.isArray(points)||points.length<2||points.some(p=>!p?.isVector3||![p.x,p.y,p.z].every(Number.isFinite))||!Number.isFinite(radius)||radius<=0)throw Error('Invalid attachment curve. Supply at least two finite 3D points and a positive radius.');
 const curve=new CatmullRomCurve3(points);
 curve.getPoint=compiledSampler(points);
 let geometry;
 try{
  geometry=new TubeGeometry(curve,Math.min(48,Math.max(12,points.length*2)),radius,3,false);
  const position=geometry.attributes.position,uv=geometry.attributes.uv,center=new Vector3(),point=new Vector3();
  let previousT=NaN;
  for(let i=0;i<position.count;i++){
   const t=uv.getX(i);
   // Radial vertices share the stored float32 UV, including its rounding.
   if(t!==previousT){curve.getPointAt(t,center);previousT=t;}
   point.fromBufferAttribute(position,i).sub(center).multiplyScalar(1-.9*t*t).add(center);
   position.setXYZ(i,point.x,point.y,point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
 }catch(error){geometry?.dispose();throw error;}
 finally{delete curve.getPoint;}
}

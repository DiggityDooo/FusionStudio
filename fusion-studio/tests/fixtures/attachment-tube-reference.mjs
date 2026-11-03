// Independent prior numeric loop. Keep original per-vertex arc samples/taper.
import * as THREE from 'three';
export function referenceAttachmentTube(points,radius){
 const curve=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(curve,Math.min(48,Math.max(12,points.length*2)),radius,3,false),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const t=g.attributes.uv.getX(i),center=curve.getPointAt(t),point=new THREE.Vector3().fromBufferAttribute(p,i);
  point.sub(center).multiplyScalar(1-.9*t*t).add(center);p.setXYZ(i,...point.toArray());
 }
 g.computeVertexNormals();return g;
}

import * as THREE from 'three';

// Versioned derived eye surfaces. The editable character cage is never changed.
// Aqueous fluid, accommodation and retinal optics are not simulated by this model.
export function eyeDimensions(radius){
 if(!Number.isFinite(radius)||radius<.002||radius>.04)throw Error('Eye radius is outside supported adult character dimensions.');
 const aperture=.55*radius,curvature=.75*radius,thickness=.035*radius,limbus=Math.sqrt(radius*radius-aperture*aperture),center=limbus-Math.sqrt(curvature*curvature-aperture*aperture);
 return {radius,aperture,curvature,thickness,limbus,center,irisRadius:.5*radius,irisOuter:.64*radius,pupilRadius:.22*radius,irisDepth:.75*radius,pupilDepth:.728*radius};
}

function corneaGeometry(d,segments=64,rings=16){
 const positions=[],normals=[],uv=[],indices=[],row=segments+1,stride=(rings+1)*row;
 for(let side=0;side<2;side++){
  const radius=d.curvature-(side?d.thickness:0),angle=Math.asin(d.aperture/radius),sign=side?-1:1;
  for(let r=0;r<=rings;r++)for(let s=0;s<=segments;s++){
   const theta=r/rings*angle,phi=s/segments*Math.PI*2,x=Math.sin(theta)*Math.cos(phi),y=Math.sin(theta)*Math.sin(phi),z=Math.cos(theta);
   positions.push(radius*x,radius*y,d.center+radius*z);normals.push(sign*x,sign*y,sign*z);uv.push(.5+x*radius/d.aperture*.5,.5+y*radius/d.aperture*.5);
  }
  for(let r=0;r<rings;r++)for(let s=0;s<segments;s++){
   const a=side*stride+r*row+s,b=a+row,c=b+1,e=a+1;
   indices.push(...(side?[a,c,b]:[a,b,c]));if(r)indices.push(...(side?[a,e,c]:[a,c,e]));
  }
 }
 for(let s=0;s<segments;s++){const a=rings*row+s,b=a+1,c=a+stride,e=b+stride;indices.push(a,c,b,b,c,e);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();return g;
}

function irisGeometry(d,segments=96,rings=10){
 const positions=[],uv=[],indices=[],row=segments+1;
 for(let r=0;r<=rings;r++)for(let s=0;s<=segments;s++){
  const radius=d.pupilRadius+(d.irisOuter-d.pupilRadius)*r/rings,angle=s/segments*Math.PI*2,x=radius*Math.cos(angle),y=radius*Math.sin(angle),depth=d.irisDepth-Math.max(0,1-radius/d.irisRadius)*.018*d.radius;
  positions.push(x,y,depth);uv.push(.5+x/d.irisRadius*.5,.5+y/d.irisRadius*.5);
 }
 for(let r=0;r<rings;r++)for(let s=0;s<segments;s++){const a=r*row+s,b=a+row;indices.push(a,b,a+1,a+1,b,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export function createEyeSurfaces(radius){
 const dimensions=eyeDimensions(radius),opening=Math.asin(dimensions.aperture/radius),sclera=new THREE.SphereGeometry(radius,64,40,0,Math.PI*2,opening,Math.PI-opening);sclera.rotateX(Math.PI/2);
 const pupil=new THREE.CircleGeometry(dimensions.pupilRadius*1.015,64);pupil.translate(0,0,dimensions.pupilDepth);
 return {version:2,dimensions,sclera,iris:irisGeometry(dimensions),pupil,cornea:corneaGeometry(dimensions)};
}

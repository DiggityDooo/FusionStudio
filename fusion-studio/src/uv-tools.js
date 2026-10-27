import * as THREE from 'three';

// UV sets present on a geometry, in glTF order (uv, uv1, uv2, uv3).
export const uvSets=geometry=>['uv','uv1','uv2','uv3'].filter(name=>geometry.attributes[name]);

// Texel density (pixels per metre at `textureSize`) and UV coverage, using world-space triangle areas.
export function uvStats(geometry,matrixWorld=new THREE.Matrix4(),{set='uv',textureSize=2048}={}){
  const uv=geometry.attributes[set],pos=geometry.attributes.position;if(!uv)return null;
  const index=geometry.index?.array,count=index?index.length:pos.count,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let area3d=0,areaUV=0;
  for(let i=0;i<count;i+=3){const [i0,i1,i2]=index?[index[i],index[i+1],index[i+2]]:[i,i+1,i+2];
    a.fromBufferAttribute(pos,i0).applyMatrix4(matrixWorld);b.fromBufferAttribute(pos,i1).applyMatrix4(matrixWorld);c.fromBufferAttribute(pos,i2).applyMatrix4(matrixWorld);
    area3d+=b.sub(a).cross(c.sub(a)).length()/2;
    const u0=uv.getX(i0),v0=uv.getY(i0);areaUV+=Math.abs((uv.getX(i1)-u0)*(uv.getY(i2)-v0)-(uv.getX(i2)-u0)*(uv.getY(i1)-v0))/2;}
  return {area3d,areaUV,coverage:areaUV,density:area3d>0?Math.sqrt(areaUV/area3d)*textureSize:0,textureSize};
}

// Numbered colour grid (like a UV test grid): stretching shows as non-square cells, flips as mirrored labels.
export function checkerTexture(size=1024,cells=8){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),step=size/cells;
  for(let x=0;x<cells;x++)for(let y=0;y<cells;y++){ctx.fillStyle=`hsl(${(x*cells+y)*360/(cells*cells)},55%,${(x+y)%2?58:42}%)`;ctx.fillRect(x*step,y*step,step,step);
    ctx.fillStyle='#fff';ctx.font=`${step*.32}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String.fromCharCode(65+x)+(cells-y),x*step+step/2,y*step+step/2);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;return texture;
}

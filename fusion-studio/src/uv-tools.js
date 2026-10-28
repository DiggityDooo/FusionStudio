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

function ensureUv(geometry,set='uv'){
  let uv=geometry.attributes[set];
  if(!uv){const n=geometry.attributes.position.count;uv=new THREE.BufferAttribute(new Float32Array(n*2),2);geometry.setAttribute(set,uv);}
  return uv;
}

export function markSeams(geometry,edgeKeys=[]){
  geometry.userData.uvSeams=[...new Set(edgeKeys.map(String))];
  return geometry.userData.uvSeams;
}

export function stitchSeams(geometry,{set='uv',pairs=[]}={}){
  const uv=ensureUv(geometry,set);
  for(const [a,b] of pairs){
    const ux=(uv.getX(a)+uv.getX(b))/2,uy=(uv.getY(a)+uv.getY(b))/2;
    uv.setXY(a,ux,uy);uv.setXY(b,ux,uy);
  }
  uv.needsUpdate=true;
  return pairs.length;
}

export function uvRelax(geometry,{set='uv',iterations=8,pin=new Set()}={}){
  const uv=ensureUv(geometry,set),n=uv.count;
  const index=geometry.index?.array;
  for(let it=0;it<iterations;it++){
    const next=new Float32Array(n*2);
    const w=new Float32Array(n);
    for(let i=0;i<n;i++){next[i*2]=uv.getX(i);next[i*2+1]=uv.getY(i);w[i]=1;}
    if(index){
      for(let i=0;i<index.length;i+=3){
        const ids=[index[i],index[i+1],index[i+2]];
        for(let e=0;e<3;e++){
          const a=ids[e],b=ids[(e+1)%3];
          if(pin.has(a)||pin.has(b))continue;
          const mx=(uv.getX(a)+uv.getX(b))/2,my=(uv.getY(a)+uv.getY(b))/2;
          next[a*2]+=mx;next[a*2+1]+=my;w[a]++;
          next[b*2]+=mx;next[b*2+1]+=my;w[b]++;
        }
      }
    }
    for(let i=0;i<n;i++){if(pin.has(i))continue;uv.setXY(i,next[i*2]/w[i],next[i*2+1]/w[i]);}
  }
  uv.needsUpdate=true;return {iterations,pinned:pin.size};
}

export function uvStraighten(geometry,{set='uv',axis='u',indices=[]}={}){
  const uv=ensureUv(geometry,set);if(!indices.length)return 0;
  let sum=0;for(const i of indices)sum+=axis==='u'?uv.getX(i):uv.getY(i);
  const avg=sum/indices.length;
  for(const i of indices){if(axis==='u')uv.setX(i,avg);else uv.setY(i,avg);}
  uv.needsUpdate=true;return indices.length;
}

export function uvAlignOrient(geometry,{set='uv',rotateDeg=0,align='min'}={}){
  const uv=ensureUv(geometry,set),n=uv.count;
  let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
  for(let i=0;i<n;i++){const u=uv.getX(i),v=uv.getY(i);minU=Math.min(minU,u);minV=Math.min(minV,v);maxU=Math.max(maxU,u);maxV=Math.max(maxV,v);}
  const cx=(minU+maxU)/2,cy=(minV+maxV)/2,rad=rotateDeg*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  for(let i=0;i<n;i++){
    let u=uv.getX(i)-cx,v=uv.getY(i)-cy;
    const ru=u*c-v*s,rv=u*s+v*c;
    uv.setXY(i,ru+cx,rv+cy);
  }
  if(align==='min'){minU=Infinity;minV=Infinity;for(let i=0;i<n;i++){minU=Math.min(minU,uv.getX(i));minV=Math.min(minV,uv.getY(i));}for(let i=0;i<n;i++)uv.setXY(i,uv.getX(i)-minU,uv.getY(i)-minV);}
  uv.needsUpdate=true;return {rotateDeg,align};
}

export function createUdimLayout({tiles=4,tileSize=1}={}){
  if(tiles<1||tiles>64)throw Error('UDIM tiles 1–64');
  return {version:1,kind:'udim',tiles:Array.from({length:tiles},(_,i)=>({udim:1001+i,u:i%10,v:Math.floor(i/10),size:tileSize}))};
}

export function assignUdimTile(geometry,{set='uv',udim=1001}={}){
  const uv=ensureUv(geometry,set),tile=udim-1001,ou=tile%10,ov=Math.floor(tile/10);
  let minU=Infinity,minV=Infinity;
  for(let i=0;i<uv.count;i++){minU=Math.min(minU,uv.getX(i));minV=Math.min(minV,uv.getY(i));}
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)-minU+ou,uv.getY(i)-minV+ov);
  uv.needsUpdate=true;geometry.userData.udim=udim;return udim;
}

export function transferUVs(sourceGeo,targetGeo,{set='uv'}={}){
  const src=sourceGeo.attributes[set];if(!src)throw Error('source UV missing');
  const dst=ensureUv(targetGeo,set),n=Math.min(src.count,dst.count);
  for(let i=0;i<n;i++)dst.setXY(i,src.getX(i),src.getY(i));
  dst.needsUpdate=true;return n;
}

export function createAtlasTrim({sheets=1,size=2048,padding=4}={}){
  return {version:1,kind:'atlas',sheets,size,padding,slots:[]};
}

export function packAtlas(atlas,islands=[]){
  let x=atlas.padding,y=atlas.padding,rowH=0,max=atlas.size-atlas.padding;
  for(const isl of islands){
    const w=isl.w||64,h=isl.h||64;
    if(x+w>max){x=atlas.padding;y+=rowH+atlas.padding;rowH=0;}
    atlas.slots.push({id:isl.id,x,y,w,h});x+=w+atlas.padding;rowH=Math.max(rowH,h);
  }
  return atlas;
}

export function liveUnwrapState(mesh,{enabled=true}={}){
  mesh.userData.liveUv={enabled:!!enabled,updatedAt:Date.now()};
  return mesh.userData.liveUv;
}

export function proceduralUv(geometry,{mode='triplanar',set='uv',scale=1}={}){
  if(!['triplanar','box','world'].includes(mode))throw Error('uv mode');
  const pos=geometry.attributes.position,uv=ensureUv(geometry,set),n=pos.count;
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  const nor=geometry.attributes.normal;
  for(let i=0;i<n;i++){
    const x=pos.getX(i)*scale,y=pos.getY(i)*scale,z=pos.getZ(i)*scale;
    if(mode==='box'||mode==='world'){uv.setXY(i,((x%1)+1)%1,((z%1)+1)%1);continue;}
    const ax=Math.abs(nor.getX(i)),ay=Math.abs(nor.getY(i)),az=Math.abs(nor.getZ(i));
    if(ay>=ax&&ay>=az)uv.setXY(i,((x%1)+1)%1,((z%1)+1)%1);
    else if(ax>=az)uv.setXY(i,((z%1)+1)%1,((y%1)+1)%1);
    else uv.setXY(i,((x%1)+1)%1,((y%1)+1)%1);
  }
  uv.needsUpdate=true;return {mode,set,count:n};
}

export function uvDistortionReport(geometry,{set='uv'}={}){
  const stats=uvStats(geometry,new THREE.Matrix4(),{set});
  if(!stats)return {stretch:0,coverage:0};
  const stretch=stats.area3d>0?stats.areaUV/Math.max(stats.area3d,1e-8):0;
  return {stretch,coverage:stats.coverage,density:stats.density};
}

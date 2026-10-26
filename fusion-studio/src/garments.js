import * as THREE from 'three';
export const GARMENT_DEFAULTS={type:'skirt',width:.42,length:.65,flare:.24,ease:.04,segments:48,rows:28,color:'#48677c'};
export function createGarment(settings={},characterHeight=1.8){
  const p={...GARMENT_DEFAULTS,...settings};const s=characterHeight/1.8;
  const group=new THREE.Group();group.name=p.type[0].toUpperCase()+p.type.slice(1);group.userData={fusion_kind:'garment',fusion_id:THREE.MathUtils.generateUUID(),garment:p,source:'Fusion pattern',characterHeight};
  const positions=[],uvs=[],indices=[],pins=[];const n=p.segments,r=p.rows;
  for(let row=0;row<=r;row++){
    const t=row/r;
    for(let col=0;col<=n;col++){
      const u=col/n;let x,y,z;
      if(p.type==='cape'){
        x=(u-.5)*(p.width+(.4+p.flare)*t);y=1.43-t*p.length;z=-.19-p.ease-.10*t;
      }else{
        const a=u*Math.PI*2;
        const radius=p.width*.5+p.ease+p.flare*t;
        x=Math.sin(a)*radius;y=(p.type==='tunic'?1.42:.99)-t*p.length;
        z=Math.cos(a)*radius*(p.type==='tunic'?.73:.8);
      }
      positions.push(x*s,y*s,z*s);uvs.push(u,t);
      if(row===0)pins.push(row*(n+1)+col);
      if(row<r&&col<n){const a=row*(n+1)+col,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:p.color,roughness:.85,side:THREE.DoubleSide}));mesh.name=group.name+' pattern';mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={fusion_cloth:true,fusion_id:group.userData.fusion_id,source:'Fusion garment',fusion_pin:pins};group.add(mesh);
  return group;
}
export function patternSVG(settings={}){
  const p={...GARMENT_DEFAULTS,...settings};const wide=p.type==='cape'?p.width:Math.PI*p.width;
  const w=240,h=155,top=wide/(wide+Math.max(p.flare*2,.15))*160;
  return `<svg viewBox="0 0 ${w} ${h}" class="pattern-svg" aria-label="Flat garment pattern"><defs><pattern id="pattern-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#454545" stroke-width=".5"/></pattern></defs><rect width="240" height="155" fill="url(#pattern-grid)"/><path d="M ${120-top/2} 24 L ${120+top/2} 24 L 215 125 L 25 125 Z" fill="#ff930026" stroke="#e99538" stroke-width="1.5"/><path d="M ${120-top/2} 24 L ${120+top/2} 24" stroke="#82b9e6" stroke-width="3"/><text x="120" y="15" text-anchor="middle" fill="#aeb9c7" font-size="8">PINNED WAIST / SHOULDER EDGE</text><text x="120" y="146" text-anchor="middle" fill="#aeb9c7" font-size="9">${Math.round(wide*100)} cm × ${Math.round(p.length*100)} cm</text></svg>`;
}

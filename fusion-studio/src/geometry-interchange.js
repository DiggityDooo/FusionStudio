import * as THREE from 'three';
// glTF primitives may reference one shared accessor containing the entire mesh.
// Store only vertices used by this primitive, including every deformation channel.
export function compactPrimitive(geometry){
 if(!geometry.index)return geometry;
 const used=[],mapping=new Map(),indices=new Uint32Array(geometry.index.count);
 for(let i=0;i<indices.length;i++){const old=geometry.index.getX(i);if(!mapping.has(old)){mapping.set(old,used.length);used.push(old);}indices[i]=mapping.get(old);}
 if(used.length===geometry.attributes.position.count)return geometry;
 const next=new THREE.BufferGeometry();next.name=geometry.name;next.userData=structuredClone(geometry.userData);next.setIndex(new THREE.BufferAttribute(indices,1));
 const copy=attribute=>{const array=new attribute.array.constructor(used.length*attribute.itemSize);for(let i=0;i<used.length;i++)for(let c=0;c<attribute.itemSize;c++)array[i*attribute.itemSize+c]=attribute.array[attribute.isInterleavedBufferAttribute?used[i]*attribute.data.stride+attribute.offset+c:used[i]*attribute.itemSize+c];return new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized);};
 for(const [key,attribute] of Object.entries(geometry.attributes))next.setAttribute(key,copy(attribute));
 for(const [key,attributes] of Object.entries(geometry.morphAttributes))next.morphAttributes[key]=attributes.map(copy);
 next.morphTargetsRelative=geometry.morphTargetsRelative;for(const group of geometry.groups)next.addGroup(group.start,group.count,group.materialIndex);next.setDrawRange(geometry.drawRange.start,geometry.drawRange.count);return next;
}

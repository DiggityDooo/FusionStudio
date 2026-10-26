export const TANGENT_CORNER_LIMIT=600000;
export function validateTangentInput(input){
 const {positions,normals,uvs}=input||{},count=positions?.length/3;
 if(![positions,normals,uvs].every(a=>a instanceof Float32Array)||!Number.isInteger(count)||count<3||count%3||count>TANGENT_CORNER_LIMIT||normals?.length!==count*3||uvs?.length!==count*2)throw Error('MikkTSpace requires Float32 triangle corners with positions, normals and UV0, up to 200,000 triangles per mesh.');
 for(const [name,array]of [['position',positions],['normal',normals],['UV',uvs]])for(const n of array)if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('Invalid '+name+' in tangent input.');
 for(let i=0;i<normals.length;i+=3)if(Math.abs(Math.hypot(normals[i],normals[i+1],normals[i+2])-1)>.001)throw Error('Tangent generation requires unit normals. Recalculate normals on a working copy first.');
 let mirrored=0;for(let i=0;i<uvs.length;i+=6){const a=(uvs[i+2]-uvs[i])*(uvs[i+5]-uvs[i+1])-(uvs[i+3]-uvs[i+1])*(uvs[i+4]-uvs[i]);if(Math.abs(a)<1e-14)throw Error('Tangent generation found a collapsed UV triangle. Repair UV0 on a working copy first.');if(a<0)mirrored++;}
 return {corners:count,triangles:count/3,mirroredUVTriangles:mirrored};
}
export function validateTangents(tangents,input){
 const {corners}=validateTangentInput(input);if(!(tangents instanceof Float32Array)||tangents.length!==corners*4)throw Error('Invalid MikkTSpace tangent result.');
 for(let i=0;i<corners;i++){const t=tangents.subarray(i*4,i*4+4),n=input.normals.subarray(i*3,i*3+3);if(t.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(t[0],t[1],t[2])-1)>.001||Math.abs(t[0]*n[0]+t[1]*n[1]+t[2]*n[2])>.001||Math.abs(t[3])!==1)throw Error('MikkTSpace returned an invalid tangent frame.');}return tangents;
}

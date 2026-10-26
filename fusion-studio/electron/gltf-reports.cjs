function tangentReport(t){
 const bad=()=>{throw Error('Invalid tangent-generation metadata.');};if(t?.version!==1||t.algorithm!=='MikkTSpace'||!Array.isArray(t.generated)||t.generated.length>512||!Number.isSafeInteger(t.preservedAuthored)||t.preservedAuthored<0||t.preservedAuthored>5000)bad();
 const generated=t.generated.map(r=>{if(typeof r.mesh!=='string'||['sourceVertices','corners','triangles','mirroredUVTriangles'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0||r[k]>600000)||r.corners!==r.triangles*3||r.mirroredUVTriangles>r.triangles||r.milliseconds!==null&&(!Number.isFinite(r.milliseconds)||r.milliseconds<0))bad();return {mesh:r.mesh.slice(0,200),sourceVertices:r.sourceVertices,corners:r.corners,triangles:r.triangles,mirroredUVTriangles:r.mirroredUVTriangles,milliseconds:r.milliseconds};});
 return {version:1,algorithm:'MikkTSpace',threeVersion:String(t.threeVersion).slice(0,20),preservedAuthored:t.preservedAuthored,generated};
}
module.exports={tangentReport};

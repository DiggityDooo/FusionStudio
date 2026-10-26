function validatePatternPayload(p){
 if(!p||!Array.isArray(p.vertices)||p.vertices.length<3||p.vertices.length>65000)throw Error('Invalid pattern vertex count.');
 if(p.vertices.some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>100)))throw Error('Invalid pattern vertex.');
 const indices=(list,size,max)=>Array.isArray(list)&&list.length<=max&&list.every(row=>Array.isArray(row)&&row.length===size&&new Set(row).size===size&&row.every(i=>Number.isInteger(i)&&i>=0&&i<p.vertices.length));
 if(!indices(p.faces,3,60000)||p.faces.length<1||!indices(p.sewing,2,10000))throw Error('Invalid pattern faces or seam indices.');
 if(!Array.isArray(p.pins)||p.pins.length>p.vertices.length||p.pins.some(i=>!Number.isInteger(i)||i<0||i>=p.vertices.length))throw Error('Invalid pin indices.');
 if(!Array.isArray(p.uvs)||p.uvs.length!==p.vertices.length*2||p.uvs.some(x=>!Number.isFinite(x)||Math.abs(x)>10))throw Error('Invalid pattern UVs.');
 if(!/^#[0-9a-f]{6}$/i.test(p.color)||![p.stiffness,p.mass,p.bending].every(Number.isFinite)||p.stiffness<1||p.stiffness>80||p.mass<.05||p.mass>2||p.bending<.001||p.bending>10)throw Error('Invalid fabric settings.');
 if(!Number.isFinite(p.sewingForce)||p.sewingForce<.1||p.sewingForce>200||!Number.isFinite(p.collisionDistance)||p.collisionDistance<.0005||p.collisionDistance>.02)throw Error('Invalid sewing or collision settings.');
 return {vertices:p.vertices,faces:p.faces,sewing:p.sewing,pins:p.pins,uvs:p.uvs,color:p.color,stiffness:p.stiffness,mass:p.mass,bending:p.bending,sewingForce:p.sewingForce,collisionDistance:p.collisionDistance};
}
module.exports={validatePatternPayload};

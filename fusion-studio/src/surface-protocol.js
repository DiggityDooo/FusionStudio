export const SURFACE_PROTOCOL_VERSION=1;
const fields=['projectId','objectId','revision','requestId','inputHash'];
export function validSurfaceContext(c){
 return !!c&&typeof c==='object'&&Object.keys(c).length===fields.length&&fields.every(k=>Object.hasOwn(c,k))&&['projectId','objectId'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=200)&&Number.isSafeInteger(c.revision)&&c.revision>=0&&Number.isSafeInteger(c.requestId)&&c.requestId>0&&typeof c.inputHash==='string'&&/^[a-f0-9]{64}$/.test(c.inputHash);
}
export function matchingSurfaceContext(expected,actual){
 if(expected===undefined)return actual===undefined;
 return validSurfaceContext(expected)&&validSurfaceContext(actual)&&fields.every(k=>expected[k]===actual[k]);
}

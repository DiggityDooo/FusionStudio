const crypto=require('node:crypto');
function validateNativeScene(scene){
 if(!scene||scene.version!==1||typeof scene.data!=='string'||scene.data.length>180000000||!/^[-A-Za-z0-9+/=]+$/.test(scene.data)||!Array.isArray(scene.matrix)||scene.matrix.length!==16||scene.matrix.some(v=>!Number.isFinite(v)||Math.abs(v)>100000))throw Error('Invalid preserved Blender scene.');
 const bytes=Buffer.from(scene.data,'base64');
 if(bytes.length<12||!bytes.subarray(0,7).equals(Buffer.from('BLENDER'))&&!(bytes[0]===0x28&&bytes[1]===0xb5&&bytes[2]===0x2f&&bytes[3]===0xfd)&&!(bytes[0]===0x1f&&bytes[1]===0x8b))throw Error('Invalid Blender scene data.');
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==scene.sha256)throw Error('Preserved Blender scene checksum does not match.');
 return bytes;
}
module.exports={validateNativeScene};

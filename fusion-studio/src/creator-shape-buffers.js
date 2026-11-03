// Numeric source-to-viewport expansion only. Scene/recipe/rig policy stays with
// the caller. Reverse incidence is rebuilt so mutable source maps cannot stale.
export function expandCreatorShapes(sourceIds,sourceCount,shapes,scale){
 const fail=()=>{throw Error('Invalid creator shape-buffer input.');};
 if(!(Array.isArray(sourceIds)||ArrayBuffer.isView(sourceIds))||!Number.isInteger(sourceIds.length)||sourceIds.length>1200000||!Number.isInteger(sourceCount)||sourceCount<1||sourceCount>200000||!Array.isArray(shapes)||shapes.length>64||!Number.isFinite(scale))fail();
 if(!shapes.length)return [];
 const first=new Int32Array(sourceCount).fill(-1),next=new Int32Array(sourceIds.length);
 for(let i=0;i<sourceIds.length;i++){const id=sourceIds[i];if(!Number.isInteger(id)||id<0||id>=sourceCount)fail();next[i]=first[id];first[id]=i;}
 return shapes.map(shape=>{
  const data=shape?.deltas;if(!Array.isArray(data)||data.length%4||data.length>sourceCount*4)fail();
  const values=new Float32Array(sourceIds.length*3);
  for(let i=0;i<data.length;i+=4){const id=data[i],dx=data[i+1],dy=data[i+2],dz=data[i+3];if(!Number.isInteger(id)||id<0||id>=sourceCount||!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(dz))fail();
   const x=Math.fround(dx*scale),y=Math.fround(dy*scale),z=Math.fround(dz*scale);if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))throw Error('Creator shape-buffer overflow.');
   for(let vertex=first[id];vertex!==-1;vertex=next[vertex]){const at=vertex*3;values[at]=x;values[at+1]=y;values[at+2]=z;}
  }
  return values;
 });
}

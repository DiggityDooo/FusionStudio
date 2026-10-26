// Preserved resources are embedded once on the imported root and saved in .fusion.
export function fingerprint(root){
 let hash=2166136261;
 const feed=value=>{for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}};
 root.traverse(n=>{
  feed(n.type);feed(String(n.visible));
  if(n!==root){n.updateMatrix();feed(JSON.stringify(n.matrix.toArray().map(v=>Math.round(v*1e6)/1e6)));}
  if(n.geometry){const g=n.geometry;for(const a of [g.index,...Object.values(g.attributes),...Object.values(g.morphAttributes).flat()])if(a){const packed=new Float64Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)packed[i*a.itemSize+c]=a.array[a.isInterleavedBufferAttribute?i*a.data.stride+a.offset+c:i*a.itemSize+c];for(let j=0;j<packed.length;j++)if(Object.is(packed[j],-0))packed[j]=0;const bytes=new Uint8Array(packed.buffer);for(const byte of bytes){hash^=byte;hash=Math.imul(hash,16777619);}}feed(JSON.stringify(g.groups));}
  if(n.material)for(const m of [].concat(n.material)){const j=m.toJSON();delete j.uuid;feed(JSON.stringify(j));}
 });return (hash>>>0).toString(16);
}
export function attachNativeScene(group,resource){
 group.userData.nativeBlend=resource;
 group.userData.nativeBlend.baseline=fingerprint(group);
 group.userData.source='Preserved Blender scene';
}
export function nativeRenderState(editor){
 const roots=editor.root.children.filter(n=>n.visible&&n.userData.nativeBlend);
 if(roots.length>1)throw Error('Render one preserved Blender scene at a time. Hide the others or make converted working copies.');
 if(!roots.length)return null;
 const owner=roots[0],resource=owner.userData.nativeBlend;
 if(fingerprint(owner)!==resource.baseline)throw Error('This Blender viewport mesh or material has changed. Make a converted working copy to render those edits with Fusion materials, or undo them to retain the native shaders.');
 owner.updateWorldMatrix(true,true);
 return {owner,resource:{version:1,data:resource.data,sha256:resource.sha256,matrix:owner.matrixWorld.clone().scale(owner.scale.clone().setScalar(resource.scale||1)).toArray(),ordinary:editor.root.children.some(n=>n.visible&&n!==owner)}};
}

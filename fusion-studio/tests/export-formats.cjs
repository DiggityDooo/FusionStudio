const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../electron/core.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-output');
global.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
// Every interchange export is written by Blender and read back through the import path.
(async()=>{
 const THREE=await import('three'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.5,2,4,1),new THREE.MeshStandardMaterial({color:0x5588cc}));mesh.name='Block';scene.add(mesh);
 const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})).toString('base64');
 const engine=new Engine(path.join(output,'export-formats-'+Date.now()),path.join(root,'scripts/blender_worker.py')),results={};
 try{
  const base=await engine.run({action:'glb',data,name:'Formats'});
  const magic={usd:'PXR-USDC',usdz:'PK',abc:'Ogawa'};
  for(const action of ['stl','ply','usd','usdz','abc','obj','fbx']){
   const r=await engine.run({action,data,name:'Formats'}),bytes=fs.readFileSync(r.output);assert.equal(path.extname(r.output),'.'+({usd:'usdc'}[action]||action));
   if(magic[action])assert.equal(bytes.subarray(0,magic[action].length).toString('latin1'),magic[action],action+' signature');
   if(action==='stl'){const triangles=bytes.readUInt32LE(80);assert.equal(bytes.length,84+50*triangles);assert.equal(triangles,base.metadata.polygons,'binary STL holds every (glTF-triangulated) face');
    let max=-Infinity,min=Infinity;for(let i=0;i<triangles;i++)for(let v=0;v<3;v++){const z=bytes.readFloatLE(84+i*50+12+v*12+8);max=Math.max(max,z);min=Math.min(min,z);}assert.ok(Math.abs(max-min-2000)<1e-2,'STL is in millimetres: '+(max-min));}
   if(action==='ply')assert.match(bytes.subarray(0,400).toString('latin1'),/^ply\nformat binary_little_endian[\s\S]*element vertex \d+[\s\S]*element face \d+/);
   const back=await engine.run({action:'convert',source:r.output,name:'Reimport '+action});
   assert.ok(back.metadata.mesh_count>=1&&back.metadata.polygons>0,action+' re-imports');
   // World-space height of the re-imported block: accessor bounds transformed by the mesh node's TRS.
   const glb=Buffer.from(back.data,'base64'),doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString()),node=doc.nodes.find(n=>n.mesh!==undefined),a=doc.accessors[doc.meshes[node.mesh].primitives[0].attributes.POSITION];
   const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
   const height=new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max)).applyMatrix4(matrix).getSize(new THREE.Vector3()).y;assert.ok(Math.abs(height-2)<1e-3,`${action} round trip keeps metric size and up axis: ${height}`);results[action]={bytes:bytes.length,reimportedPolygons:back.metadata.polygons};
  }
  fs.writeFileSync(path.join(output,'export-formats-results.json'),JSON.stringify({passed:true,results},null,2));console.log('Export formats PASS',JSON.stringify(results));
 }finally{engine.dispose?.();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(),100));

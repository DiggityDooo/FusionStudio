import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRequire} from 'node:module';
import {geometryRequest,remapGeometry} from '../src/component-edit.js';
import {createSculptLayers,captureSculptLayerEdit,finishSculptLayerEdit,validateSculptLayers} from '../src/sculpt-layers.js';
const native=createRequire(import.meta.url)('../native/fusion_geometry.node');

test('native component transforms retain unused vertices, order, identity maps and layer correspondence',t=>{
 const geometry=new THREE.SphereGeometry(.5,256,200),p=geometry.attributes.position,n=p.count;
 geometry.setAttribute('_fusion_source_vertex',new THREE.Float32BufferAttribute(Array.from({length:n},(_,i)=>i),1));
 geometry.setAttribute('color',new THREE.Uint8BufferAttribute(Array.from({length:n*3},(_,i)=>i%256),3,true));geometry.clearGroups();geometry.addGroup(0,geometry.index.count/2,0);geometry.addGroup(geometry.index.count/2,geometry.index.count/2,1);
 const used=new Set(geometry.index.array),unused=Array.from({length:n},(_,i)=>i).find(i=>!used.has(i));assert.ok(unused!==undefined,'fixture has an unused source vertex');
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());createSculptLayers(mesh);const edit=captureSculptLayerEdit(mesh),before=geometry.attributes.position.clone(),selected=[...new Set([unused,12345,n-1])].sort((a,b)=>a-b),matrix=new THREE.Matrix4().makeTranslation(0,.01,0).toArray(),start=performance.now();
 const result=JSON.parse(native.editMesh(JSON.stringify({...geometryRequest(geometry),operation:'transform',vertices:selected,matrix})));
 assert.equal(result.positions.length,n);assert.equal(result.vertexSources.length,n);assert.deepEqual(result.faces.flat(),Array.from(geometry.index.array));
 for(let i=0;i<n;i++){assert.deepEqual(result.vertexSources[i],[[i,1]]);for(let c=0;c<3;c++){const expected=before.getComponent(i,c)+(selected.includes(i)&&c===1?.01:0);assert.ok(Math.abs(result.positions[i][c]-expected)<1e-12);}}
 mesh.geometry=remapGeometry(geometry,result);finishSculptLayerEdit(edit);validateSculptLayers(mesh);
 assert.equal(mesh.geometry.attributes.position.count,n);assert.deepEqual(mesh.geometry.attributes.uv.array,geometry.attributes.uv.array);assert.deepEqual(mesh.geometry.attributes.color.array,geometry.attributes.color.array);assert.deepEqual(mesh.geometry.attributes._fusion_source_vertex.array,geometry.attributes._fusion_source_vertex.array);assert.deepEqual(mesh.geometry.groups,geometry.groups);
 assert.deepEqual(mesh.userData.fusion_sculpt_layers.layers[0].deltas.indices,selected);
 t.diagnostic(`${geometry.index.count/3} triangles / ${n} retained vertices: native transform, attribute remapping and layer recording ${(performance.now()-start).toFixed(1)} ms.`);
});

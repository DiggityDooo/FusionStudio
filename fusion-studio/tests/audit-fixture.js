import * as THREE from 'three';
import {Editor} from '../src/editor.js';
import {sculptGeometry} from '../src/mesh-tools.js';
import {inspectObject,checkCompatibility} from '../src/compatibility.js';

// Test-only harness: real editor/render loop, no production UI rebuild/autosave.
const editor=new Editor(document.querySelector('#viewport'),()=>{});
window.auditEditor=editor;
const timed=fn=>{const start=performance.now();const value=fn();return {ms:performance.now()-start,value};};
const sample=fn=>Array.from({length:3},()=>timed(fn).ms);
window.audit={
  synthetic(triangles){
    editor.template('blank');
    const width=triangles===100000?250:triangles===500000?500:1000;
    const height=triangles===100000?201:501;
    const built=timed(()=>new THREE.SphereGeometry(1,width,height));
    const mesh=editor.mesh('Audit '+triangles,built.value,'#bfc8c7',[0,1.1,0]);
    mesh.userData.fusion_id='audit-target';editor.root.add(mesh);editor.select(mesh);editor.frame(mesh);
    document.querySelector('#label').textContent=triangles.toLocaleString()+' triangles';
    return {buildMs:built.ms,triangles:mesh.geometry.index.count/3,vertices:mesh.geometry.attributes.position.count};
  },
  commit(){
    editor.history=[];editor.historyAt=-1;
    const samples=[];for(let i=0;i<3;i++){editor.selected.position.x=i*.01;samples.push(timed(()=>editor.commit()).ms);}
    const chars=editor.journal.snapshotCharacters;
    return {samplesMs:samples,states:editor.history.length,characters:chars,estimatedStringBytes:{oneByte:chars,twoByte:chars*2},snapshotChars:editor.journal.baseline.length};
  },
  async load(){
    const doc=editor.document('Audit load');const raw=JSON.stringify(doc);const start=performance.now();
    await editor.load(JSON.parse(raw));editor.select(editor.root.children[0]);
    return {parseRestoreCommitMs:performance.now()-start,compactJsonBytes:new TextEncoder().encode(raw).byteLength};
  },
  async orbit(){
    // Frame-interval sampling includes actual WebGL render loop but is display/GPU scheduling dependent.
    for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);
    const times=[];let prior=performance.now();
    for(let i=0;i<120;i++){
      const t=await new Promise(requestAnimationFrame);times.push(t-prior);prior=t;
      editor.camera.position.sub(editor.orbit.target).applyAxisAngle(new THREE.Vector3(0,1,0),.008).add(editor.orbit.target);
    }
    const sorted=[...times].sort((a,b)=>a-b),mean=times.reduce((a,b)=>a+b,0)/times.length;
    const gl=editor.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {samples:times.length,meanFrameMs:mean,p95FrameMs:sorted[Math.floor(sorted.length*.95)],fps:1000/mean,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[editor.renderer.domElement.width,editor.renderer.domElement.height]};
  },
  sculpt(){
    const mesh=editor.selected;
    const stats=inspectObject(mesh),gate=checkCompatibility('sculpt',stats);
    const point=new THREE.Vector3(0,2.1,0);
    const inflate=sample(()=>sculptGeometry(mesh,point,.15,.002,'inflate'));
    const smooth=sample(()=>sculptGeometry(mesh,point,.15,.002,'smooth'));
    return {inflateMs:inflate,smoothMs:smooth,uiBlocked:gate.blocked,method:'Direct brush dab on synthetic mesh; excludes raycast/UI/history. Dense input measured even when UI gate blocks.'};
  },
  async save(){const start=performance.now();const result=await window.auditHost.save(editor.document('Architecture baseline'));return {ms:performance.now()-start,...result};},
  async boolean(){
    const cutter=editor.mesh('Audit cutter',new THREE.SphereGeometry(.65,32,24),'#d47843',[.75,1.1,0]);cutter.userData.fusion_id='audit-cutter';editor.root.add(cutter);
    const start=performance.now(),data=await editor.glb(false,{includeAnimations:false}),serializeMs=performance.now()-start;
    try {const result=await window.auditHost.boolean(data);return {serializeMs,...result};}
    finally {editor.root.remove(cutter);cutter.geometry.dispose();cutter.material.dispose();}
  },
  async genesis(data){
    editor.template('blank');document.querySelector('#label').textContent='Genesis 9 · supported base resolution only';
    const start=performance.now();await editor.importGLB(data,'Genesis 9 audit');
    return {viewportImportCommitMs:performance.now()-start,stats:inspectObject(editor.selected)};
  }
};

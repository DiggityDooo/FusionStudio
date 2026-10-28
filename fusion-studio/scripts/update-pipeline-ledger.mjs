import fs from 'node:fs';
const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));
const ev={
  A22:['tests/pipeline-domains.test.mjs','src/virtual-production.js','src/pipeline-ui.js'],
  A23:['tests/pipeline-domains.test.mjs','src/realtime-engine.js','src/pipeline-ui.js'],
  A24:['tests/pipeline-domains.test.mjs','src/print-cam.js','src/pipeline-ui.js'],
  A25:['tests/pipeline-domains.test.mjs','src/scanning.js','src/pipeline-ui.js'],
  A30:['tests/pipeline-domains.test.mjs','src/mograph.js','src/pipeline-ui.js'],
  A31:['tests/pipeline-domains.test.mjs','src/ai-tools.js','src/pipeline-ui.js'],
  A32:['tests/pipeline-domains.test.mjs','src/collab.js','src/pipeline-ui.js'],
};
const notes={
  'A22 Live link to game engines':'Unreal/Unity/Godot live-link session + transform push; no native engine plugin.',
  'A22 Optical, inertial and webcam-based mocap support':'Mocap source kinds + streaming skeleton sample; no device drivers.',
  'A22 Facial performance capture':'Blendshape sample stream; no webcam face solver.',
  'A22 Virtual camera and virtual scouting':'VCam + scout path + takes; not Unreal VCam app.',
  'A22 Real-time retargeting':'Bone-map pose retarget preview.',
  'A22 LED volume/in-camera VFX workflows (nDisplay-style)':'LED volume + frustum sync flag; not nDisplay.',
  'A22 Timecode and genlock synchronization':'Timecode + genlock flag.',
  'A22 Real-time previs and sequencer':'Previs clip tracks.',
  'A22 Live compositing and keying':'Live keyer alpha sample.',
  'A22 VR/AR modeling, sculpting and scene review':'XR session modes + tools list; no WebXR runtime.',
  'A22 Object and body tracking':'Tracker pose updates.',
  'A22 Stage/blocking previz tools':'Stage marks + actor placement.',
};
let n=0;
for(const [k,v] of Object.entries(L.items)){
  const m=k.match(/^(A22|A23|A24|A25|A30|A31|A32) /);
  if(!m)continue;
  const sec=m[1];
  L.items[k]={
    status:'partial',
    evidence:[...new Set([...(v.evidence||[]),...ev[sec]])],
    note:notes[k]||((v.note?v.note+' ':'')+'Preview toolkit — not production DCC/engine parity.'),
  };
  n++;
}
fs.writeFileSync(path,JSON.stringify(L,null,1)+'\n');
const c={done:0,partial:0,open:0};
for(const v of Object.values(L.items))c[v.status]++;
console.log('updated',n,JSON.stringify(c));

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateGltfReport(r,context){
 if(r?.schema!==1||typeof r.complete!=='boolean'||typeof r.blocked!=='boolean'||!/^[a-f0-9]{64}$/.test(r.sha256||'')||!/^[a-f0-9]{64}$/.test(r.assetHash||'')||!r.summary||!Array.isArray(r.summary.extensions)||!Array.isArray(r.summary.fields)||!r.validator?.issues||!Array.isArray(r.validator.issues.messages)||!Array.isArray(r.reasons)||!Number.isInteger(r.validator.issues.numErrors)||r.validator.issues.numErrors<0)throw Error('Invalid glTF inspection report. Inspect again.');
 if(context&&['projectId','objectId','revision','inputHash','requestId'].some(k=>r.context?.[k]!==context[k]))throw Error('glTF inspection reply belongs to a different scene request. Inspect again.');
 return r;
}
export function gltfReportHTML(report){
 const r=validateGltfReport(report),s=r.summary,i=r.validator.issues;
 const fields=s.fields.map(f=>`<tr><td>${escape(f.field)}</td><td>${escape(f.outcome)}<br>${escape(f.detail)}</td></tr>`).join('');
 return `<section id="gltf-validation-report"><p><strong>${r.blocked?'glTF operation blocked':r.complete?'glTF inspection complete':'glTF inspection incomplete'}</strong> · ${i.numErrors} errors · ${i.numWarnings} warnings</p><p class="description">${escape(r.validator.version)} · glTF ${escape(s.assetVersion)} · ${s.primitives.toLocaleString()} primitives · ${s.morphTargets.toLocaleString()} morph targets · ${(r.totalBytes/1048576).toFixed(2)} MiB</p><p class="description">${Object.entries(s.counts).map(([key,value])=>`${value.toLocaleString()} ${escape(key)}`).join(' · ')}</p>${r.reasons.map(reason=>`<p class="notice">${escape(reason)}</p>`).join('')}<table class="coverage-table"><tr><th>Field</th><th>Fusion conversion</th></tr>${fields}</table>${s.extensions.length?`<details open><summary>Extensions (${s.extensions.length})</summary>${s.extensions.map(e=>`<p><strong>${escape(e.name)}</strong> · ${e.required?'required':'optional'} · ${escape(e.outcome)}<br>${escape(e.detail)}</p>`).join('')}</details>`:''}<details ${i.numErrors?'open':''}><summary>Validation messages (${i.messages.length}${i.truncated?' · truncated':''})</summary>${i.messages.slice(0,100).map(m=>`<p class="microcopy"><strong>${escape(m.code)}</strong> · ${['error','warning','information','hint'][m.severity]||'unknown'}<br>${escape(m.message)}<br>${escape(m.pointer)}</p>`).join('')||'<p>No specification messages.</p>'}${i.messages.length>100?'<p>Showing 100 messages; the full artifact contains the report.</p>':''}</details><p class="microcopy">Source SHA-256: ${escape(r.sha256)}<br>Specification checks do not prove mesh quality, vendor fidelity or identical appearance. ${r.validator.unsupportedExtensions.length?'The validator cannot fully inspect: '+escape(r.validator.unsupportedExtensions.join(', ')):''}</p></section>`;
}
export function showGltfReport({report,modal,close,api,title='glTF Inspection'}){
 modal(title,gltfReportHTML(report),`${report.reportPath?'<button id="gltf-report-file" class="button subtle">Show report file</button>':''}<button id="gltf-report-close" class="button accent">Close</button>`);
 document.querySelector('#gltf-report-close').onclick=close;
 document.querySelector('#gltf-report-file')?.addEventListener('click',()=>api.reveal(report.reportPath));
}
export function registerGltfInspection({operators,editor,api,setBusy,modal,close}){
 operators.register({id:'interchange.inspect_gltf',label:'Inspect scene glTF / GLB compatibility',undo:'none',execute:async(_,p,signal)=>{
  setBusy(true,'Inspecting scene GLB…');const scene=editor.root;
  try{
   const result=await editor.evaluation.run(scene,{inspection:'gltf-v1',scene:editor.serialize()},async(context,evaluationSignal)=>{
    const combined=AbortSignal.any([signal,evaluationSignal]),cancel=()=>api.cancel().catch(()=>{});if(combined.aborted)throw Error('glTF inspection cancelled.');combined.addEventListener('abort',cancel,{once:true});
    try{const data=await editor.glb();if(combined.aborted)throw Error('glTF inspection cancelled.');const report=await api.validateGltf(data,context);if(combined.aborted)throw Error('glTF inspection cancelled.');return validateGltfReport(report,context);}finally{combined.removeEventListener('abort',cancel);}
   });
   showGltfReport({report:result,modal,close,api});return result;
  }finally{setBusy(false);}
 }});
}

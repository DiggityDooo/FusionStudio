import {TORSO_LEVELS,neutralCharacterMesh,validateMeasurementSnapshot} from './body-measurements.js';
const names=['hips','waist','chest'],colors={hips:'#f0ae72',waist:'#85d9a6',chest:'#8ac9ff'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=n=>n[0].toUpperCase()+n.slice(1);
function supported(root){let skin=false;root?.traverse(n=>{if(n.isSkinnedMesh)skin=true;});return skin&&!root?.userData.character;}
function table(report){return `<table class="coverage-table"><tr><th>Section</th><th>Source height</th><th>Girth</th><th>Width × depth</th></tr>${names.map(n=>{const s=report.sections[n];return `<tr><td style="color:${colors[n]}">${label(n)} · ${(s.fraction*100).toFixed(1)}%</td><td>${(s.height*1000).toFixed(0)} mm</td><td>${s.valid?`${(s.circumference*1000).toFixed(1)} mm`:'Unavailable'}</td><td>${s.valid?`${(s.width*1000).toFixed(1)} × ${(s.depth*1000).toFixed(1)} mm`:esc(s.issue)}</td></tr>`;}).join('')}</table>`;}
export function bodyMeasurementsPanel(root){
  if(!supported(root))return '';let saved=root.userData.fusion_body_measurements,body='';
  try{if(saved){validateMeasurementSnapshot(saved);body=`<p class="microcopy">Saved source snapshot · refresh after shaping.</p>${names.map(n=>{const s=saved.report.sections[n];return `<div>${label(n)}: ${s.valid?`${(s.circumference*1000).toFixed(1)} mm`:'unavailable'}</div>`;}).join('')}`;}}catch{body='<p class="microcopy">Saved measurements are invalid. Measure this body again.</p>';}
  return `<section class="library-section" id="body-measurements"><div class="section-heading">BODY MEASUREMENTS · INSPIRED</div>${body}<button id="body-measure-open" class="full-button">Inspect torso cross-sections…</button><p class="microcopy">Measure the resolved source shape before bone posing. Review section levels and contours. Measurements do not change the current garment grading.</p></section>`;
}

export function wireBodyMeasurements({editor,run,modal,close,refresh,notify}){
  if(!editor.operators.definitions.has('character.measurements'))editor.operators.register({id:'character.measurements',label:'Save reviewed body measurements',hidden:true,undo:'delta',execute:(_,p)=>{
    const target=editor.root.getObjectByProperty('uuid',p.targetId);if(!supported(target)||!p.ticket||!editor.evaluation.current(p.ticket))throw Error('The body changed during measurement. Inspect the current shape again.');
    validateMeasurementSnapshot(p.snapshot);if(p.snapshot.report.sourceId!==(target.userData.fusion_id||target.uuid))throw Error('Measurements belong to a different character.');
    editor.ensureHistory();const before=target.userData.fusion_body_measurements||null;target.userData.fusion_body_measurements=structuredClone(p.snapshot);editor.journal.metadata(target.uuid,'fusion_body_measurements',before,p.snapshot,'Save body measurements');editor.evaluation.invalidate();editor.change('scene');return p.snapshot;
  }});
  const button=document.querySelector('#body-measure-open');if(!button)return;
  button.onclick=()=>run(async()=>{
    const owner=editor.selected,scene=editor.root;if(!supported(owner))throw Error('Select an imported skinned character.');editor.timeline.playing=false;
    const preparationStart=performance.now(),mesh=neutralCharacterMesh(owner),preparationMs=performance.now()-preparationStart;
    let levels={...TORSO_LEVELS};try{const saved=owner.userData.fusion_body_measurements;if(saved){validateMeasurementSnapshot(saved);levels={...saved.levels};}}catch{}
    const ticket=await editor.evaluation.ticket(owner,mesh);
    modal('Body measurement inspection',`<p>Neutral source sections · Inspired. Bone posing is excluded. Current resolved morphs, including pose correctives, are included.</p><div class="measurement-levels">${names.map(n=>`<label>${label(n)} height (% of source)<input id="measurement-${n}" aria-label="${label(n)} measurement height" type="number" min="45" max="85" step=".1" value="${levels[n]*100}"></label>`).join('')}</div><p id="measurement-status" role="status">Measuring…</p><div id="measurement-results"></div><canvas id="measurement-canvas" width="860" height="360" aria-label="Torso contour top view"></canvas><p class="microcopy">Top view in source X/Z. Orange: hips · green: waist · blue: chest. The contour follows the actual surface rather than a convex hull; separate limb contours are excluded. These are geometric sections at chosen levels, not medical or anatomical measurements. Source-local metres; world scale is reported separately. Saving records a snapshot without editing the body or garment.</p>`,`<button id="measurement-cancel" class="button subtle">Cancel</button><button id="measurement-save" class="button accent" disabled>Save measurement snapshot</button>`);
    const $=s=>document.querySelector(s),canvas=$('#measurement-canvas');let revision=0,worker=null,timer=null,result=null,timeout=null;
    const clear=()=>{clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;revision++;};
    const observer=new MutationObserver(()=>{if(!canvas.isConnected){clear();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
    const current=()=>canvas.isConnected&&editor.root===scene&&editor.selected===owner&&editor.evaluation.current(ticket);
    const draw=report=>{
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,860,360);ctx.fillStyle='#25282c';ctx.fillRect(0,0,860,360);const points=names.flatMap(n=>report.sections[n].outline||[]);if(!points.length)return;
      const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),min=[Math.min(...xs),Math.min(...zs)],max=[Math.max(...xs),Math.max(...zs)],cx=(min[0]+max[0])/2,cz=(min[1]+max[1])/2,scale=Math.min(760/Math.max(.001,max[0]-min[0]),280/Math.max(.001,max[1]-min[1]));
      ctx.strokeStyle='#3f454c';ctx.lineWidth=1;for(let x=30;x<860;x+=40){ctx.beginPath();ctx.moveTo(x,20);ctx.lineTo(x,340);ctx.stroke();}for(let y=20;y<360;y+=40){ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(830,y);ctx.stroke();}
      for(const n of names){const outline=report.sections[n].outline;if(!outline)continue;ctx.strokeStyle=colors[n];ctx.lineWidth=2;ctx.beginPath();outline.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](430+(p[0]-cx)*scale,180-(p[1]-cz)*scale));ctx.closePath();ctx.stroke();}
      ctx.fillStyle='#d7dce3';ctx.font='14px sans-serif';ctx.fillText('Source X →     +Z ↑',40,340);
    };
    const queue=()=>{
      clear();result=null;$('#measurement-save').disabled=true;$('#measurement-results').replaceChildren();canvas.getContext('2d').clearRect(0,0,860,360);$('#measurement-status').textContent='Measuring…';const id=revision;
      levels=Object.fromEntries(names.map(n=>[n,Number($(`#measurement-${n}`).value)/100]));
      timer=setTimeout(()=>{
        if(!current()){$('#measurement-status').textContent='The scene changed. Close and inspect the current body again.';return;}
        const started=performance.now(),activeWorker=new Worker(new URL('./body-measurement-worker.js',import.meta.url),{type:'module'});worker=activeWorker;
        const finish=()=>{clearTimeout(workerTimeout);activeWorker.terminate();if(worker===activeWorker)worker=null;if(timeout===workerTimeout)timeout=null;};
        const workerTimeout=setTimeout(()=>{finish();if(current()&&id===revision)$('#measurement-status').textContent='Measurement exceeded 10 seconds. Isolate or simplify the body mesh and try again.';},10000);timeout=workerTimeout;
        activeWorker.onerror=event=>{finish();if(current()&&id===revision)$('#measurement-status').textContent='Measurement failed: '+event.message;};
        activeWorker.onmessage=({data})=>{finish();if(id!==revision||data.id!==id||!canvas.isConnected)return;if(!current()){$('#measurement-status').textContent='The body or scene changed. Close and inspect the current shape again.';return;}if(data.error){$('#measurement-status').textContent=data.error;return;}
          const snapshot={version:1,levels:{...levels},report:data.report};try{validateMeasurementSnapshot(snapshot);}catch(error){$('#measurement-status').textContent=error.message;return;}
          result=snapshot;const r=snapshot.report;$('#measurement-results').innerHTML=table(r);$('#measurement-status').textContent=`${r.valid?'Closed torso sections verified':'Sections need repair'} · ${r.sourceTriangles.toLocaleString()} source triangles · ${(r.height*1000).toFixed(1)} mm source height · world scale ${r.worldScale.toFixed(3)} · ${Math.round(performance.now()-started)} ms preview (${preparationMs.toFixed(0)} ms source preparation). ${r.warnings.join(' ')}`;draw(r);$('#measurement-save').disabled=!r.valid;
        };
        activeWorker.postMessage({id,mesh,levels});
      },180);
    };
    for(const n of names)$(`#measurement-${n}`).oninput=queue;
    $('#measurement-cancel').onclick=()=>{clear();close();};
    $('#measurement-save').onclick=()=>{if(!result||!current())return notify('The body changed. Inspect it again before saving.',true);const snapshot=result;clear();close();run(async()=>{try{await editor.operators.run('character.measurements',{targetId:owner.uuid,snapshot,ticket});notify('Body measurement snapshot saved.');}finally{refresh();}});};
    queue();
  });
}

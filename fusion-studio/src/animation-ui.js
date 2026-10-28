import {dopeSheet,fcurves,INTERP_MODES,LOOP_MODES,addNlaTrack,addNlaClip,nlaState,motionPath,onionFrames,addAnimEvent,eventsAt,setFollowPath,captureAnimClip,applyAnimClip,planAnimClip,mergeAnimationKeys,libraryClips} from './animation.js';
import {hybridTransaction} from './hybrid.js';
import {retargetPose,cleanupMocapKeys} from './retarget.js';
import {importBvhToScene} from './mocap-bvh.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function animationPanel(editor){
 const t=editor.timeline,keys=t.keys(),dope=dopeSheet(keys),nla=nlaState(editor.root),sel=editor.selected,curve=sel?fcurves(keys,sel.uuid,{property:'position',index:0}):[],w=280,h=64;
 const path=curve.length?curve.map((p,i)=>`${i?'L':'M'}${(p.frame-1)/Math.max(1,t.end-1)*w},${h-(p.value+1)/2*h}`).join(' '):'';
 const onion=t.onion.enabled?onionFrames(t.frame,t.onion):[];
 return `<section class="library-section"><div class="section-heading"><span>ANIMATION</span></div>
<button id="add-key-panel" class="button import-button">Insert transform / pose key</button>
<label class="check-row"><input id="anim-autokey" type="checkbox" ${t.autoKey?'checked':''}> Auto-key</label>
<label class="field-label">Interpolation<select id="anim-interp">${INTERP_MODES.map(m=>`<option value="${m}" ${t.defaultInterp===m?'selected':''}>${m}</option>`).join('')}</select></label>
<label class="field-label">Loop<select id="anim-loop">${LOOP_MODES.map(m=>`<option value="${m}" ${t.loopMode===m?'selected':''}>${m}</option>`).join('')}</select></label>
<label class="field-label">Time scale<input id="anim-timescale" type="number" min=".1" max="10" step=".1" value="${t.timeScale}"></label>
<label class="field-label">Frame rate<select id="fps">${[24,30,60].map(n=>`<option value="${n}" ${t.fps===n?'selected':''}>${n} fps</option>`).join('')}</select></label>
<div class="pose-grid"><button id="anim-reduce" class="text-button">Reduce keys</button><button id="anim-retime" class="text-button">Retime ×2</button><button id="anim-stretch" class="text-button">Stretch 1–${t.end}→${t.end*2}</button></div>
<label class="check-row"><input id="anim-onion" type="checkbox" ${t.onion.enabled?'checked':''}> Onion skin (${onion.filter(f=>f!==t.frame).join(', ')||'off'})</label>
<p class="microcopy">${keys.length} keyed frames · ${dope.length} channels · pose-to-pose: key extremes then in-betweens; straight-ahead: auto-key while dragging.</p></section>
<section class="library-section"><div class="section-heading"><span>DOPE SHEET</span></div>
${dope.length?`<table class="coverage-table"><tr><th>Channel</th><th>Keys</th></tr>${dope.slice(0,24).map(r=>`<tr><td>${esc(editor.root.getObjectByProperty('uuid',r.id)?.name||r.id.slice(0,8))}</td><td>${r.frames.map(f=>`<button data-dope-frame="${f.frame}" class="text-button">${f.frame}</button>`).join(' ')}</td></tr>`).join('')}</table>`:'<p class="microcopy">No keys yet.</p>'}
</section>
<section class="library-section"><div class="section-heading"><span>GRAPH · position.X</span></div>
<svg id="anim-graph" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-label="F-curve">${path?`<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5"/>`:''}${curve.map(p=>`<circle cx="${(p.frame-1)/Math.max(1,t.end-1)*w}" cy="${h-(p.value+1)/2*h}" r="2.5" fill="currentColor"/>`).join('')}</svg>
<p class="microcopy">Select an object with position keys. Bezier/spline ease the segment; stepped holds.</p></section>
<section class="library-section"><div class="section-heading"><span>NLA / CLIPS</span></div>
<button id="nla-add-track" class="full-button">Add NLA track</button>
${nla.tracks.map(tr=>`<div class="microcopy"><strong>${esc(tr.name)}</strong> · ${tr.clips.length} clips <button data-nla-clip="${tr.id}" class="text-button">Add clip @${t.frame}</button></div>`).join('')||'<p class="microcopy">No NLA tracks.</p>'}
<button id="anim-lib-capture" class="full-button">Save keys to animation library</button>
<button id="anim-lib-apply" class="full-button" ${libraryClips(editor.root).length?'':'disabled'}>Apply last library clip</button>
</section>
<section class="library-section"><div class="section-heading"><span>PATH · EVENTS · MOTION</span></div>
<button id="anim-motion-path" class="full-button">Motion path for selection</button>
<button id="anim-follow-path" class="full-button">Follow demo path (circle)</button>
<label class="field-label">Event name<input id="anim-event-name" maxlength="40" placeholder="footstep"></label>
<button id="anim-event-add" class="text-button">Add event @${t.frame}</button>
<p class="microcopy">${eventsAt(editor.root,t.frame).map(e=>esc(e.name)).join(', ')||'No events on this frame.'}</p></section>
<section class="library-section"><div class="section-heading"><span>RETARGET · MOCAP</span></div>
<label class="field-label">Source armature<select id="retarget-source"><option value="">—</option>${editor.root.children.filter(c=>c.userData?.fusion_armature||c.userData?.fusion_kind==='character'||c.userData?.character).map(c=>`<option value="${c.uuid}">${esc(c.name)}</option>`).join('')}</select></label>
<button id="anim-retarget" class="full-button">Retarget source → selection</button>
<label class="field-label">BVH source units<select id="anim-bvh-units"><option value="unspecified">Unspecified — retain coordinates</option><option value="m">Meters</option><option value="cm">Centimeters → meters</option><option value="mm">Millimeters → meters</option></select></label>
<button id="anim-bvh-import" class="full-button">Import BVH text…</button>
<button id="anim-mocap-clean" class="text-button">Cleanup mocap spikes</button>
<p class="microcopy">BVH does not declare length units: review the source scale before fitting. Import resamples into this timeline's frame rate and retains existing tracks. Retarget maps joints by aliases; FBX/C3D mocap remain pending.</p></section>`;
}

export function bindAnimationPanel({editor,attempt,notify,refresh}){
 const $=s=>document.querySelector(s),t=editor.timeline;
 $('#add-key-panel')?.addEventListener('click',()=>attempt(()=>t.insert()));
 $('#anim-autokey')?.addEventListener('change',e=>{t.autoKey=e.target.checked;});
 $('#anim-interp')?.addEventListener('change',e=>attempt(()=>t.setInterp(e.target.value)));
 $('#anim-loop')?.addEventListener('change',e=>t.setLoopMode(e.target.value));
 $('#anim-timescale')?.addEventListener('change',e=>attempt(()=>t.setTimeScale(Number(e.target.value))));
 $('#fps')?.addEventListener('change',e=>{t.fps=Number(e.target.value);});
 $('#anim-reduce')?.addEventListener('click',()=>attempt(()=>{const n=t.reduce(.01);notify(`Reduced to ${n} keys`);refresh();}));
 $('#anim-retime')?.addEventListener('click',()=>attempt(()=>{t.retime(2,1);t.end=Math.max(t.end,Math.max(0,...t.keys().map(k=>k.frame)));refresh();}));
 $('#anim-stretch')?.addEventListener('click',()=>attempt(()=>{const end=t.end;t.stretch(1,end,end*2);t.end=end*2;refresh();}));
 $('#anim-onion')?.addEventListener('change',e=>{t.onion.enabled=e.target.checked;refresh();});
 document.querySelectorAll('[data-dope-frame]').forEach(b=>b.onclick=()=>t.evaluate(Number(b.dataset.dopeFrame)));
 $('#nla-add-track')?.addEventListener('click',()=>attempt(()=>{addNlaTrack(editor.root);editor.commit();refresh();}));
 document.querySelectorAll('[data-nla-clip]').forEach(b=>b.onclick=()=>attempt(()=>{
  const track=nlaState(editor.root).tracks.find(tr=>tr.id===b.dataset.nlaClip);if(!track)throw Error('NLA track missing.');
  const start=t.frame,end=Math.min(t.end,start+23);addNlaClip(track,{name:'Clip',start,end,sourceStart:1,sourceEnd:Math.min(24,t.end)});editor.commit();refresh();
 }));
 $('#anim-lib-capture')?.addEventListener('click',()=>attempt(()=>{captureAnimClip(editor.root,t.keys(),{name:'Clip '+t.frame});editor.commit();notify('Clip saved');refresh();}));
 $('#anim-lib-apply')?.addEventListener('click',()=>attempt(async()=>{
  const clip=libraryClips(editor.root).at(-1);if(!clip)throw Error('No library clips.');
  const at=t.frame,input=JSON.stringify(t.keys()),plan=planAnimClip(editor.root,clip,{at});
  if(plan.conflicts.length&&!await reviewClipReplacement(plan))return;
  await editor.operators.run('anim.clip_apply',{clip,at,conflict:plan.conflicts.length?'replace':'error',input});refresh();
 }));
 $('#anim-motion-path')?.addEventListener('click',()=>attempt(()=>{
  if(!editor.selected)throw Error('Select an object.');const line=t.samplePose(()=>motionPath(f=>t.evaluate(f,{notify:false,strict:true}),{start:t.start,end:t.end,object:editor.selected}));
  editor.root.add(line);editor.commit();notify('Motion path added');
 }));
 $('#anim-follow-path')?.addEventListener('click',()=>attempt(()=>{
  if(!editor.selected)throw Error('Select an object.');setFollowPath(editor.selected,[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]],{start:t.start,end:t.end,align:true});t.evaluate(t.frame);editor.commit();notify('Follow path saved for playback');
 }));
 $('#anim-event-add')?.addEventListener('click',()=>attempt(()=>{addAnimEvent(editor.root,{frame:t.frame,name:$('#anim-event-name').value||'event'});editor.commit();refresh();}));
 $('#anim-retarget')?.addEventListener('click',()=>attempt(()=>editor.operators.run('anim.retarget',{sourceId:$('#retarget-source').value})));
 $('#anim-bvh-import')?.addEventListener('click',()=>attempt(async()=>{
  const units=$('#anim-bvh-units').value,scale={m:1,cm:.01,mm:.001,unspecified:1}[units];
  const text=await new Promise((resolve,reject)=>{
   const input=document.createElement('input');input.type='file';input.accept='.bvh,text/plain';input.oncancel=()=>reject(Error('BVH import cancelled.'));input.onchange=async()=>{try{const f=input.files?.[0];if(!f)return reject(Error('No BVH file chosen.'));if(f.size>5_000_000)return reject(Error('BVH file exceeds 5 MB.'));resolve(await f.text());}catch(e){reject(e);}};input.click();
  });
  const result=await editor.operators.run('anim.bvh_import',{text,units,scale});
  notify(result.warnings.length?result.warnings.join(' '):`Imported ${result.frames} BVH frames; existing animation retained.`);return result;
 }));
 $('#anim-mocap-clean')?.addEventListener('click',()=>attempt(()=>editor.operators.run('anim.mocap_clean',{})));
}

export function registerAnimationTools(registry,editor){
 registry.register({id:'anim.clip_apply',label:'Apply animation clip',undo:'snapshot',execute:(_,p,signal)=>hybridTransaction(editor,()=>{
  if(p.input!==undefined&&p.input!==JSON.stringify(editor.timeline.keys()))throw Error('Timeline changed during clip review. Review the replacement again.');
  for(const key of p.clip?.keys||[])for(const id of Object.keys(key.tracks||{}))if(!editor.root.getObjectByProperty('uuid',id))throw Error('Clip target '+id+' is missing. Relink its objects before applying the clip.');
  const count=applyAnimClip(editor.root,p.clip,p);editor.timeline.end=Math.max(editor.timeline.end,...editor.timeline.keys().map(k=>k.frame));editor.timeline.evaluate(editor.timeline.frame,{strict:true,events:false});return count;
 },{signal})});
 registry.register({id:'anim.reduce',label:'Reduce keyframes',undo:'snapshot',execute:(_,p)=>{editor.timeline.reduce(p?.tolerance??.01);}});
 registry.register({id:'anim.retime',label:'Retime keys',undo:'snapshot',execute:(_,p)=>{editor.timeline.retime(p?.scale??2,p?.origin??1);}});
 registry.register({id:'anim.retarget',label:'Retarget pose',undo:'snapshot',execute:(_,p)=>{
  const target=editor.selected;if(!target)throw Error('Select the target armature or character.');
  const source=editor.root.getObjectByProperty('uuid',p.sourceId);if(!source||source===target)throw Error('Choose a different source armature.');
  const report=retargetPose(source,target);editor.commit();return report;
 }});
 registry.register({id:'anim.bvh_import',label:'Import BVH',undo:'snapshot',execute:(_,p)=>{
  const staging=new editor.root.constructor(),{armature,keys,frames,warnings}=importBvhToScene(p.text,staging,{asKeys:true,fps:editor.timeline.fps,scale:p.scale??1,units:p.units??'unspecified',startFrame:p.startFrame??editor.timeline.frame});
  const merged=mergeAnimationKeys(editor.timeline.keys(),keys);
  editor.root.add(armature);if(keys.length){editor.root.userData.fusion_timeline=merged;editor.timeline.end=Math.max(editor.timeline.end,keys.at(-1).frame);}
  editor.select(armature);editor.commit();return {frames,keys:keys.length,warnings};
 }});
 registry.register({id:'anim.mocap_clean',label:'Cleanup mocap keys',undo:'snapshot',execute:()=>{
  editor.root.userData.fusion_timeline=cleanupMocapKeys(editor.timeline.keys(),{maxDelta:.5});editor.commit();return editor.timeline.keys().length;
 }});
}

function reviewClipReplacement(plan){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='anim-clip-review';dialog.className='animation-clip-review';
  const title=document.createElement('h3');title.textContent='Replace overlapping animation keys?';
  const detail=document.createElement('p');detail.textContent=`This clip replaces ${plan.conflicts.length} keys on its target objects between frames ${plan.start} and ${plan.end}. Other objects and keys outside that range are retained. Cancel keeps the current animation.`;
  const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.id='anim-clip-cancel';
  const apply=document.createElement('button');apply.textContent='Replace reviewed keys';apply.id='anim-clip-replace';
  let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};
  cancel.onclick=()=>finish(false);apply.onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.onclose=()=>finish(false);
  dialog.append(title,detail,cancel,apply);document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}

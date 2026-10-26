import {starterPattern,tshirtPattern,validatePattern,migratePattern,patternSegmentPoint,addPatternDart,measurePatternSeams} from './patterns.js';

import './pattern-designer.css';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openPatternDesigner({editor,modal,close,onApply}){

 const source=editor.selected?.userData.patternProject?editor.selected:null,doc=structuredClone(source?.userData.liveGarment?.basePattern||source?.userData.patternProject||starterPattern());

 const fitted=!!source?.userData.liveGarment?.fittedSurface;
 let active=doc.panels[0].id,drag=null,drawing=false,newPoints=[],drawKind='panel',inspectedSeam=null,preview=null,previewTimer=null,previewWorker=null,previewRevision=0,view={x:0,y:.3,scale:400};

 const panel=()=>doc.panels.find(p=>p.id===active),$=s=>document.querySelector(s);

 modal('Pattern & Sewing Editor',`<div class="pattern-designer"><aside><label>Panel<select id="pattern-panel"></select></label><div class="pattern-buttons"><button id="pattern-add">Draw panel</button><button id="pattern-duplicate">Duplicate</button><button id="pattern-delete">Delete</button></div><label>Name<input id="pattern-name" maxlength="80"></label><div id="pattern-placement"></div><label><input id="pattern-flip" type="checkbox"> Back-facing panel</label><label>Fabric<select id="pattern-fabric"><option>cotton</option><option>silk</option><option>denim</option></select></label><label>Color<input id="pattern-color" type="color"></label><label>Mesh subdivisions<select id="pattern-resolution">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label><div class="pattern-buttons"><button id="pattern-fit">Fit outline</button><button id="pattern-finish" hidden>Finish outline</button><button id="pattern-discard" hidden>Cancel drawing</button></div><p>Drag vertices to reshape. Edge numbers identify sewing and pinned edges. Drawing snaps to 1 cm. Coordinates are meters.</p></aside><div><canvas id="pattern-canvas" width="540" height="420" aria-label="2D garment pattern editor"></canvas><div id="pattern-points"></div></div><aside><strong>PINNED EDGES</strong><div id="pattern-pins"></div><strong>SEW EDGES</strong><label>First edge<select id="seam-a"></select></label><label>Second edge<select id="seam-b"></select></label><label><input id="seam-reverse" type="checkbox" checked> Reverse second edge</label><button id="seam-add">Add seam</button><div id="seam-list"></div></aside></div><p id="pattern-message" role="status"></p><p class="microcopy">Editable patterns with sewing and pins. Enable curves, holes and darts for segment-based editing. Fabric presets are approximations. ${source?.userData.simulationApplied?'Applying edits keeps the draped object and creates a new flat-pattern copy.':'Edits enter the scene together when you apply.'}</p>`,`<button id="pattern-cancel" class="button subtle">Cancel</button><button id="pattern-apply" class="button accent">Apply Pattern</button>`);

 $('.modal').classList.add('pattern-modal');if(fitted)for(const id of ['pattern-add','pattern-duplicate','pattern-delete','pattern-flip'])document.getElementById(id).disabled=true;

 if(source?.userData.liveGarment){$('.modal-body > p.microcopy').textContent=fitted?'Editing physical panels at the measured source size. Apply grades from retained neutral surface changes and re-drapes offline (up to 120 seconds) in one undo step. Placement, flips and panel identities are fixed by the fitting surface; make a flat working copy to redesign them. Boundary edits may extend at most 50 mm beyond the source UV surface. Fabric and contact are preview approximations.':'Editing original panels at the 1.8 m reference size. Apply re-grades for the linked body and replaces its drape in one undo step. Collision and fabric are preview approximations.';$('#pattern-apply').textContent='Apply & Re-drape';}

 const template=document.createElement('button');template.id='pattern-tshirt';template.disabled=fitted;template.textContent='Start T-shirt pattern';$('.pattern-buttons').prepend(template);

 const physics=document.createElement('div');physics.innerHTML='<label>Sewing force<input id="pattern-force" type="number" min=".1" max="200" step="1"></label><label>Collision distance (m)<input id="pattern-collision" type="number" min=".0005" max=".02" step=".0005"></label>';$('#seam-list').after(physics);

 if(source?.userData.liveGarment?.settings?.fabricResponse){$('#pattern-fabric').disabled=true;$('#pattern-fabric').title='Physical parameters are set in Fabric response. Switch to Existing preview to use this preset.';}
 if(source?.userData.liveGarment){$('#pattern-force').disabled=true;$('#pattern-force').title='The native preview currently uses a fixed seam compliance.';$('#pattern-collision').disabled=true;$('#pattern-collision').title='The native preview currently uses a fixed 3 mm clearance.';}

 const advanced=document.createElement('section');advanced.className='pattern-advanced';advanced.innerHTML=`<button id="pattern-upgrade">Enable curves, holes &amp; darts</button><div id="pattern-v2" hidden><label>Particle distance (m)<input id="pattern-distance" type="number" min=".005" max=".2" step=".005"></label><label><input id="pattern-preview" type="checkbox"> Live mesh preview</label><label>Boundary segment<select id="pattern-segment"></select></label><label>Segment shape<select id="pattern-curve"><option value="line">Straight</option><option value="cubic">Cubic Bézier</option></select></label><div id="pattern-controls"></div><div class="pattern-buttons"><button id="pattern-hole">Draw hole</button><button id="pattern-line">Draw internal line</button></div><div id="pattern-details"></div><label>Dart width (m)<input id="dart-width" type="number" value=".04" min=".003" step=".01"></label><label>Dart depth (m)<input id="dart-depth" type="number" value=".12" min=".003" step=".01"></label><button id="pattern-dart">Cut &amp; sew dart</button></div>`;$('#pattern-placement').before(advanced);

 const ranges=document.createElement('div');ranges.id='pattern-ranges';ranges.hidden=true;ranges.innerHTML=['a','b'].map(id=>`<label>Seam ${id.toUpperCase()} start / end (0–1)<div class="range-pair"><input id="seam-${id}-start" type="number" min="0" max="1" step=".05" value="0"><input id="seam-${id}-end" type="number" min="0" max="1" step=".05" value="1"></div></label>`).join('');$('#seam-add').before(ranges);

 const inspection=document.createElement('p');inspection.id='seam-inspection';inspection.setAttribute('role','status');inspection.textContent='Inspect a seam to see its direction. Positive ease means A is longer than B.';$('#seam-list').after(inspection);

 const canvas=$('#pattern-canvas'),ctx=canvas.getContext('2d');

 const refPanel=r=>Array.isArray(r)?r[0]:r.panel,refSegment=r=>Array.isArray(r)?r[1]:r.segment;

 const shownRef=r=>Array.isArray(r)?r.join(':'):`${r.panel}:${r.segment} [${r.start.toFixed(2)}–${r.end.toFixed(2)}]`;

 const pinned=(p,i)=>p.pins.includes(i)||p.pins.includes(p.segments?.[i]?.id);

 function upgrade(){if(doc.version!==2)Object.assign(doc,migratePattern(doc));}

 function stopPreview(){clearTimeout(previewTimer);previewWorker?.terminate();previewWorker=null;previewRevision++;}
 function queuePreview(){stopPreview();if(doc.version!==2||!$('#pattern-preview').checked){preview=null;return;}const revision=previewRevision;previewTimer=setTimeout(()=>{if(!canvas.isConnected)return;const worker=new Worker(new URL('./pattern-preview-worker.js',import.meta.url),{type:'module'});previewWorker=worker;const done=()=>{worker.terminate();if(previewWorker===worker)previewWorker=null;};worker.onmessage=({data})=>{done();if(!canvas.isConnected||revision!==previewRevision)return;if(data.error){$('#pattern-message').textContent=data.error;$('#pattern-message').classList.add('error');return;}preview=data.mesh;$('#pattern-message').classList.remove('error');$('#pattern-message').textContent=`${preview.quality.triangles.toLocaleString()} triangles · min angle ${preview.quality.minAngleDegrees.toFixed(1)}° · max edge ${(preview.quality.maxEdge*1000).toFixed(1)} mm · 20° target ${preview.quality.qualityTargetMet?'met':'unmet'}. `+preview.quality.warnings.join(' ');draw();};worker.onerror=event=>{done();if(!canvas.isConnected||revision!==previewRevision)return;$('#pattern-message').textContent='Pattern preview failed: '+event.message;$('#pattern-message').classList.add('error');};worker.postMessage({revision,document:structuredClone(doc)});},180);}
 // Closing through the modal's title bar also cancels a running preview.
 const previewObserver=new MutationObserver(()=>{if(!canvas.isConnected){stopPreview();previewObserver.disconnect();}});previewObserver.observe(document.body,{childList:true,subtree:true});
 function chosenSegment(){const id=$('#pattern-segment').value;for(const ring of [panel(),...(panel().holes||[])]){const index=ring.segments?.findIndex(s=>s.id===id);if(index>=0)return {ring,index,seg:ring.segments[index]};}return {};}
 function shapeControls(){const {seg}=chosenSegment();if(!seg)return;$('#pattern-curve').value=seg.type;$('#pattern-controls').innerHTML=seg.type==='cubic'?seg.controls.map((v,c)=>`<label>Control ${c+1}<div class="range-pair">${v.map((n,a)=>`<input data-control="${c}" data-axis="${a}" type="number" step=".01" aria-label="Curve control ${c+1} ${a?'Y':'X'}" value="${n}">`).join('')}</div></label>`).join(''):'';document.querySelectorAll('[data-control]').forEach(el=>el.onchange=()=>{seg.controls[Number(el.dataset.control)][Number(el.dataset.axis)]=Number(el.value);feedback();draw();});}

 function advancedRefresh(){const v2=doc.version===2;$('#pattern-v2').hidden=!v2;$('#pattern-upgrade').hidden=v2;$('#pattern-ranges').hidden=!v2;$('#pattern-resolution').disabled=v2;if(!v2)return;$('#pattern-distance').value=doc.particleDistance;const old=$('#pattern-segment').value;$('#pattern-segment').innerHTML=[panel(),...panel().holes].flatMap((r,ri)=>r.segments.map((s,i)=>`<option value="${s.id}">${ri?'Hole '+ri+' · ':''}Edge ${i} · ${esc(s.id)}</option>`)).join('');if([...$('#pattern-segment').options].some(o=>o.value===old))$('#pattern-segment').value=old;shapeControls();$('#pattern-details').innerHTML=[...panel().holes.map((h,i)=>`<div class="seam-row"><span>Hole ${i+1} (${h.points.length} points)</span><button data-hole-remove="${i}">×</button></div><div class="pattern-detail-points">${h.points.map((pt,j)=>`<label>Hole v${j}<div class="range-pair">${pt.map((v,a)=>`<input data-hole-point="${i}:${j}:${a}" type="number" step=".01" value="${v}" aria-label="Hole ${i+1} vertex ${j} ${a?'Y':'X'}">`).join('')}</div></label>`).join('')}</div>`),...panel().internalLines.map((l,i)=>`<div class="seam-row"><span>Internal line ${i+1}</span><button data-line-remove="${i}">×</button></div>`)].join('');document.querySelectorAll('[data-hole-point]').forEach(el=>el.onchange=()=>{const [h,v,a]=el.dataset.holePoint.split(':').map(Number);panel().holes[h].points[v][a]=Number(el.value);feedback();draw();});document.querySelectorAll('[data-hole-remove]').forEach(el=>el.onclick=()=>{const h=panel().holes[Number(el.dataset.holeRemove)],ids=new Set(h.segments.map(s=>s.id));doc.seams=doc.seams.filter(s=>![s.a,s.b].some(r=>r.panel===active&&ids.has(r.segment)));panel().pins=panel().pins.filter(s=>!ids.has(s));panel().holes.splice(Number(el.dataset.holeRemove),1);refresh();});document.querySelectorAll('[data-line-remove]').forEach(el=>el.onclick=()=>{panel().internalLines.splice(Number(el.dataset.lineRemove),1);refresh();});}

 $('#pattern-upgrade').onclick=()=>{upgrade();refresh();};$('#pattern-distance').onchange=e=>{doc.particleDistance=Number(e.target.value);feedback();};$('#pattern-preview').onchange=()=>{queuePreview();draw();};$('#pattern-segment').onchange=shapeControls;

 $('#pattern-curve').onchange=e=>{const {ring:p,index:i,seg:s}=chosenSegment();if(!s)return;s.type=e.target.value;if(s.type==='cubic'&&!s.controls){const a=p.points[i],b=p.points[(i+1)%p.points.length];s.controls=[a.map((v,d)=>v+(b[d]-v)/3),a.map((v,d)=>v+2*(b[d]-v)/3)];}shapeControls();feedback();draw();};

 $('#pattern-dart').onclick=()=>{try{const chosen=chosenSegment();if(chosen.ring!==panel())throw Error('Select an outer boundary segment to cut a dart.');addPatternDart(doc,active,chosen.index,Number($('#dart-width').value),Number($('#dart-depth').value));refresh();}catch(e){$('#pattern-message').textContent=e.message;}};

 $('#pattern-hole').onclick=()=>startDrawing('hole');$('#pattern-line').onclick=()=>startDrawing('line');

 function startDrawing(kind){drawKind=kind;drawing=true;newPoints=[];drawMode();$('#pattern-message').textContent=kind==='line'?'Click at least two points inside fabric, then Finish outline.':'Click at least three points, then Finish outline.';}



 const screen=p=>[(p[0]-view.x)*view.scale+270,210-(p[1]-view.y)*view.scale];

 const coords=e=>{const b=canvas.getBoundingClientRect(),x=(e.clientX-b.left)*540/b.width,y=(e.clientY-b.top)*420/b.height;return [Math.round(((x-270)/view.scale+view.x)*100)/100,Math.round(((210-y)/view.scale+view.y)*100)/100];};

 function fit(){const p=doc.version===2?[panel(),...panel().holes].flatMap(r=>[...r.points,...r.segments.flatMap(s=>s.type==='cubic'?s.controls:[])]):panel().points,x=p.map(v=>v[0]),y=p.map(v=>v[1]);view={x:(Math.min(...x)+Math.max(...x))/2,y:(Math.min(...y)+Math.max(...y))/2,scale:Math.min(460/Math.max(.2,Math.max(...x)-Math.min(...x)),340/Math.max(.2,Math.max(...y)-Math.min(...y)))};draw();}

 function seamDiagnostics(){
  let report,error;try{report=measurePatternSeams(doc);}catch(e){error=e.message;}
  if(!doc.seams.includes(inspectedSeam))inspectedSeam=null;
  const mm=n=>(n*1000).toFixed(1),signed=n=>(n>=0?'+':'')+n.toFixed(1);
  $('#seam-list').innerHTML=doc.seams.map((s,i)=>{const m=report?.seams[i];return `<div class="seam-row"><div><button data-inspect-seam="${i}" aria-label="Inspect seam ${i+1}" aria-pressed="${s===inspectedSeam}">${esc(shownRef(s.a))} ↔ ${esc(shownRef(s.b))}</button><br><small>${m?`A ${mm(m.lengthA)} mm · B ${mm(m.lengthB)} mm<br>Δ ${signed(m.deltaLength*1000)} mm · ease ${signed(m.easePercent)}%<br>B ${m.orientation}${m.warnings.length?' · ⚠ '+esc(m.warnings.join(' ')):''}`:esc('Measurement unavailable: '+error)}</small></div><button data-remove-seam="${i}" aria-label="Remove seam ${i+1}">×</button></div>`;}).join('');
  document.querySelectorAll('[data-remove-seam]').forEach(el=>el.onclick=()=>{doc.seams.splice(Number(el.dataset.removeSeam),1);refresh();});
  document.querySelectorAll('[data-inspect-seam]').forEach(el=>el.onclick=()=>{
   inspectedSeam=doc.seams[Number(el.dataset.inspectSeam)];active=refPanel(inspectedSeam.a);refresh();
   for(const side of ['a','b']){const ref=inspectedSeam[side];$('#seam-'+side).value=refPanel(ref)+':'+refSegment(ref);if(doc.version===2){$('#seam-'+side+'-start').value=ref.start;$('#seam-'+side+'-end').value=ref.end;}}
   $('#seam-reverse').checked=inspectedSeam.reverse;$('#seam-inspection').textContent=`Inspecting seam ${doc.seams.indexOf(inspectedSeam)+1}: A orange → B blue; B ${inspectedSeam.reverse?'reversed':'same direction'}. Arrows follow sewing correspondence. Choose the other panel to inspect its side.`;fit();
  });
  if(!inspectedSeam)$('#seam-inspection').textContent='Inspect a seam to see its direction. Positive ease means A is longer than B.';
 }

 function feedback(){queuePreview();seamDiagnostics();try{const result=validatePattern(doc);$('#pattern-message').textContent=`${result.estimated?'~':''}${result.triangles.toLocaleString()} triangles · ${doc.seams.length} seams. `+result.warnings.join(' ');$('#pattern-message').classList.remove('error');return true;}catch(error){$('#pattern-message').textContent=error.message;$('#pattern-message').classList.add('error');return false;}}

 function draw(){

  ctx.fillStyle='#24282c';ctx.fillRect(0,0,540,420);ctx.strokeStyle='#343a40';ctx.lineWidth=1;

  for(let x=Math.floor((view.x-270/view.scale)*10)/10;x<view.x+270/view.scale;x+=.1){const [px]=screen([x,0]);ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,420);ctx.stroke();}

  for(let y=Math.floor((view.y-210/view.scale)*10)/10;y<view.y+210/view.scale;y+=.1){const [,py]=screen([0,y]);ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(540,py);ctx.stroke();}

  if(preview&&!drawing){const group=preview.groups.find(g=>g.panel===active);ctx.strokeStyle='#54869155';ctx.lineWidth=.5;if(group)for(let f=group.start/3;f<(group.start+group.count)/3;f++){const t=preview.faces[f];ctx.beginPath();t.forEach((i,j)=>{const [x,y]=screen([preview.uvs[i*2],preview.uvs[i*2+1]]);j?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();}}

  const p=drawing?newPoints:panel().points;if(!p.length)return;

  ctx.beginPath();p.forEach((v,i)=>{const [x,y]=screen(v);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);if(!drawing&&doc.version===2&&panel().segments[i].type==='cubic'){const [a,b]=panel().segments[i].controls.map(screen),end=screen(p[(i+1)%p.length]);ctx.bezierCurveTo(...a,...b,...end);}});if(!drawing)ctx.closePath();ctx.fillStyle='#416f8455';if(!drawing)ctx.fill();ctx.strokeStyle='#c2d6df';ctx.lineWidth=2;ctx.stroke();

  p.forEach((v,i)=>{const [x,y]=screen(v);ctx.fillStyle='#f6ac56';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.font='12px sans-serif';ctx.fillText('v'+i,x+8,y-8);

   if(!drawing){const [bx,by]=screen(p[(i+1)%p.length]),sewn=doc.seams.some(s=>[s.a,s.b].some(r=>refPanel(r)===active&&refSegment(r)===(doc.version===2?panel().segments[i].id:i)));ctx.strokeStyle=pinned(panel(),i)?'#79baff':sewn?'#c3a2ed':'#b8bec5';ctx.lineWidth=pinned(panel(),i)||sewn?4:2;ctx.beginPath();ctx.moveTo(x,y);if(doc.version===2&&panel().segments[i].type==='cubic'){const [a,b]=panel().segments[i].controls.map(screen);ctx.bezierCurveTo(...a,...b,bx,by);}else ctx.lineTo(bx,by);ctx.stroke();ctx.fillStyle='#fff';ctx.fillText('e'+i,(x+bx)/2+5,(y+by)/2-5);}});

  if(!drawing&&doc.version===2){for(const hole of panel().holes){ctx.beginPath();hole.points.forEach((v,i)=>{const [x,y]=screen(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y);if(hole.segments[i].type==='cubic'){const [a,b]=hole.segments[i].controls.map(screen),end=screen(hole.points[(i+1)%hole.points.length]);ctx.bezierCurveTo(...a,...b,...end);}});ctx.closePath();ctx.fillStyle='#24282c';ctx.fill();ctx.strokeStyle='#ffb9a1';ctx.stroke();}for(const line of panel().internalLines){ctx.beginPath();line.points.forEach((v,i)=>{const [x,y]=screen(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.setLineDash([5,4]);ctx.strokeStyle='#f1d16e';ctx.stroke();ctx.setLineDash([]);}}

  if(!drawing&&doc.seams.includes(inspectedSeam))for(const [side,color] of [['a','#ffad55'],['b','#70c9ff']]){
   const ref=inspectedSeam[side];if(refPanel(ref)!==active)continue;let ring=panel(),index=refSegment(ref),start=0,end=1;
   if(doc.version===2){ring=[panel(),...panel().holes].find(r=>r.segments.some(s=>s.id===ref.segment));index=ring?.segments.findIndex(s=>s.id===ref.segment);start=ref.start;end=ref.end;}
   if(!ring||index<0)continue;if(side==='b'&&inspectedSeam.reverse)[start,end]=[end,start];
   const point=t=>doc.version===2?patternSegmentPoint(ring,index,t):ring.points[index].map((v,d)=>v+(ring.points[(index+1)%ring.points.length][d]-v)*t),points=Array.from({length:33},(_,i)=>screen(point(start+(end-start)*i/32)));
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=4;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();const tip=points[17],from=points[15],angle=Math.atan2(tip[1]-from[1],tip[0]-from[0]);ctx.beginPath();ctx.moveTo(...tip);ctx.lineTo(tip[0]-12*Math.cos(angle-.5),tip[1]-12*Math.sin(angle-.5));ctx.lineTo(tip[0]-12*Math.cos(angle+.5),tip[1]-12*Math.sin(angle+.5));ctx.closePath();ctx.fill();ctx.fillText(side.toUpperCase()+' start',points[0][0]+6,points[0][1]-9);
  }



 }

 function refresh(){

  const p=panel();$('#pattern-panel').innerHTML=doc.panels.map(n=>`<option value="${n.id}" ${n.id===active?'selected':''}>${esc(n.name)}</option>`).join('');$('#pattern-name').value=p.name;$('#pattern-flip').checked=p.flip;$('#pattern-fabric').value=doc.fabric;$('#pattern-resolution').value=doc.subdivision;$('#pattern-color').value=doc.color;

  $('#pattern-force').value=doc.sewingForce;$('#pattern-collision').value=doc.collisionDistance;

  $('#pattern-placement').innerHTML=['X','Y','Z'].map((a,i)=>`<label>Place ${a}<input ${fitted?'disabled title="Make a flat working copy to change placement"':''} data-place="${i}" type="number" min="-20" max="20" step=".01" value="${p.position[i]}"></label>`).join('');

  $('#pattern-points').innerHTML=p.points.map((v,i)=>`<label>v${i} ${v.map((n,a)=>`<input data-point="${i}" data-axis="${a}" aria-label="Vertex ${i} ${a?'Y':'X'}" type="number" step=".01" value="${n}">`).join('')}</label>`).join('');

  $('#pattern-pins').innerHTML=[p,...(p.holes||[])].flatMap((r,ri)=>r.points.map((_,i)=>`<label><input data-pin="${doc.version===2?r.segments[i].id:i}" type="checkbox" ${(ri?p.pins.includes(r.segments[i].id):pinned(p,i))?'checked':''}> ${ri?'Hole '+ri+' · ':''}Edge ${i}</label>`)).join('');

  const opts=doc.panels.flatMap(p=>[p,...(p.holes||[])].flatMap((ring,r)=>ring.points.map((_,i)=>`<option value="${p.id}:${doc.version===2?ring.segments[i].id:i}">${esc(p.name)}${r?' · hole '+r:''} · edge ${i}</option>`))).join('');for(const id of ['#seam-a','#seam-b']){const old=$(id).value;$(id).innerHTML=opts;if([...$(id).options].some(o=>o.value===old))$(id).value=old;}

  document.querySelectorAll('[data-place]').forEach(el=>el.onchange=()=>{p.position[Number(el.dataset.place)]=Number(el.value);feedback();});

  document.querySelectorAll('[data-point]').forEach(el=>el.onchange=()=>{p.points[Number(el.dataset.point)][Number(el.dataset.axis)]=Number(el.value);feedback();draw();});

  document.querySelectorAll('[data-pin]').forEach(el=>el.onchange=()=>{p.pins=Array.from(document.querySelectorAll('[data-pin]:checked'),n=>doc.version===2?n.dataset.pin:Number(n.dataset.pin));draw();feedback();});

  advancedRefresh();feedback();draw();

 }

 $('#pattern-panel').onchange=e=>{active=e.target.value;drawing=false;newPoints=[];drawMode();refresh();fit();};

 $('#pattern-name').onchange=e=>{panel().name=e.target.value;refresh();};$('#pattern-flip').onchange=e=>{panel().flip=e.target.checked;feedback();};

 $('#pattern-fabric').onchange=e=>{doc.fabric=e.target.value;feedback();};$('#pattern-color').onchange=e=>doc.color=e.target.value;$('#pattern-resolution').onchange=e=>{doc.subdivision=Number(e.target.value);feedback();};

 function drawMode(){for(const id of ['#pattern-finish','#pattern-discard'])$(id).hidden=!drawing;$('#pattern-apply').disabled=drawing;draw();}

 $('#pattern-add').onclick=()=>startDrawing('panel');

 $('#pattern-finish').onclick=()=>{const minimum=drawKind==='line'?2:3;if(newPoints.length<minimum){$('#pattern-message').textContent='Draw at least '+minimum+' vertices.';return;}const before=structuredClone(doc),id=(drawKind==='panel'?'panel_':drawKind+'_')+crypto.randomUUID();if(drawKind==='panel'){const p={id,name:'Panel '+(doc.panels.length+1),points:newPoints,position:[0,1,.3],flip:false,pins:[]};if(doc.version===2)Object.assign(p,{segments:newPoints.map((_,i)=>({id:id+'_s'+i,type:'line'})),holes:[],internalLines:[],darts:[]});doc.panels.push(p);active=id;}else if(drawKind==='hole')panel().holes.push({id,points:newPoints,segments:newPoints.map((_,i)=>({id:id+'_s'+i,type:'line'}))});else panel().internalLines.push({id,points:newPoints});try{validatePattern(doc);}catch(e){Object.assign(doc,before);active=before.panels.some(p=>p.id===active)?active:before.panels[0].id;$('#pattern-message').textContent=e.message;return;}drawing=false;newPoints=[];drawMode();refresh();};

 $('#pattern-discard').onclick=()=>{drawing=false;newPoints=[];drawMode();refresh();};

 $('#pattern-duplicate').onclick=()=>{if(drawing)return;const p=structuredClone(panel());p.id='panel_'+crypto.randomUUID();p.name+=' copy';p.position[2]+=.1;doc.panels.push(p);active=p.id;refresh();};

 $('#pattern-delete').onclick=()=>{if(doc.panels.length===1){$('#pattern-message').textContent='Keep at least one panel.';return;}doc.panels=doc.panels.filter(p=>p.id!==active);doc.seams=doc.seams.filter(s=>refPanel(s.a)!==active&&refPanel(s.b)!==active);active=doc.panels[0].id;refresh();fit();};

 $('#pattern-fit').onclick=fit;

 $('#pattern-force').onchange=e=>{doc.sewingForce=Number(e.target.value);feedback();};$('#pattern-collision').onchange=e=>{doc.collisionDistance=Number(e.target.value);feedback();};

 template.onclick=()=>{Object.assign(doc,tshirtPattern());active=doc.panels[0].id;drawing=false;newPoints=[];drawMode();refresh();fit();};

 $('#seam-add').onclick=()=>{const ref=id=>{const [p,i]=$(id).value.split(':');return doc.version===2?{panel:p,segment:i,start:Number($(id+'-start').value),end:Number($(id+'-end').value)}:[p,Number(i)];};const seam={id:'seam_'+crypto.randomUUID(),a:ref('#seam-a'),b:ref('#seam-b'),reverse:$('#seam-reverse').checked};doc.seams.push(seam);try{validatePattern(doc);refresh();}catch(error){doc.seams.pop();$('#pattern-message').textContent=error.message;}};

 canvas.onpointerdown=e=>{const point=coords(e);if(drawing){newPoints.push(point);draw();return;}const p=panel().points;let best=14/view.scale;drag=null;p.forEach((v,i)=>{const d=Math.hypot(v[0]-point[0],v[1]-point[1]);if(d<best){best=d;drag=i;}});if(drag!==null)canvas.setPointerCapture(e.pointerId);};

 canvas.onpointermove=e=>{if(drag!==null){panel().points[drag]=coords(e);draw();}};canvas.onpointerup=()=>{if(drag!==null){drag=null;refresh();}};canvas.onpointercancel=()=>{drag=null;refresh();};

 $('#pattern-cancel').onclick=()=>{stopPreview();previewObserver.disconnect();close();};$('#pattern-apply').onclick=()=>{if(!feedback())return;stopPreview();previewObserver.disconnect();close();onApply(structuredClone(doc),source?.uuid);};refresh();fit();

}


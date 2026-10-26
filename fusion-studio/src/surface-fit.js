import {measureNeutralMesh} from './body-measurements.js';
import {buildPattern,validatePattern} from './patterns.js';

const finitePoint=(p,n,limit)=>Array.isArray(p)&&p.length===n&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=limit);
export const triples=p=>Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));
export function validatePanelAttachments(data,surface,binding){
 const owners=new Int16Array(surface.reference.positions.length).fill(-1);surface.panels.forEach((p,k)=>{for(const i of p.indices)owners[i]=k;});
 if(!Array.isArray(binding?.attachments)||binding.attachments.length!==data.positions.length/3)throw Error('The flat reference returned invalid attachments.');
 for(const group of data.groups){const panel=surface.panels.findIndex(p=>p.id===group.panel);if(panel<0)throw Error('A fitted panel reference is missing.');for(const i of new Set(data.faces.slice(group.start/3,(group.start+group.count)/3).flat())){const triangle=binding.attachments[i]?.triangle;if(!Number.isInteger(triangle)||!surface.reference.faces[triangle]||owners[surface.reference.faces[triangle][0]]!==panel)throw Error('Panel '+group.panel+' extends into another fitting patch. Reduce this edit or make an independent flat working copy.');}}
}
export function validateFittedSurface(s){
 const r=s?.reference,n=r?.flatPositions?.length;
 if(s?.version!==1||typeof s.bodyId!=='string'||s.bodyId.length>200||!/^[a-f0-9]{64}$/.test(s.topologyHash||'')||!Number.isInteger(n)||n<3||n>60000||!Array.isArray(r.positions)||r.positions.length!==n||r.flatPositions.some(p=>!finitePoint(p,3,100))||r.positions.some(p=>!finitePoint(p,3,100))||!Array.isArray(r.faces)||!r.faces.length||r.faces.length>100000||r.faces.some(t=>!finitePoint(t,3,n-1)||new Set(t).size!==3||t.some(i=>!Number.isInteger(i)||i<0)))throw Error('Invalid saved fitted-surface reference. Keep the saved drape and make a flat working copy.');
 if(!Array.isArray(s.panels)||!s.panels.length||s.panels.length>16||new Set(s.panels.map(p=>p.id)).size!==s.panels.length||s.panels.some(p=>typeof p.id!=='string'||!finitePoint(p.offset,3,100)||!['bodice','sleeve'].includes(p.kind)||!Array.isArray(p.indices)||p.indices.length<3||p.indices.some(i=>!Number.isInteger(i)||i<0||i>=n)))throw Error('Invalid fitted-surface panel identities.');
 const ownership=new Int16Array(n).fill(-1);s.panels.forEach((p,k)=>{for(const i of p.indices){if(ownership[i]!==-1)throw Error('Fitted reference panel vertices are shared or duplicated.');ownership[i]=k;}});if(ownership.some(i=>i<0)||r.faces.some(t=>t.some(i=>ownership[i]!==ownership[t[0]])))throw Error('Fitted reference has invalid panel ownership.');
 const binding=s.binding;if(binding?.version!==1||!Array.isArray(binding.attachments)||binding.attachments.length!==n||binding.bodyId!==s.bodyId||!Number.isInteger(binding.bodyVertices)||binding.bodyVertices<3||binding.bodyVertices>200000||!Number.isInteger(binding.bodyTriangles)||binding.bodyTriangles<1||binding.bodyTriangles>250000||!/^[a-f0-9]{32}$/.test(binding.topologyFingerprint||'')||binding.attachments.some(a=>!Number.isInteger(a.triangle)||a.triangle<0||a.triangle>=binding.bodyTriangles||!finitePoint(a.barycentric,3,1.00000001)||a.barycentric.some(v=>v< -1e-8)||Math.abs(a.barycentric.reduce((n,v)=>n+v,0)-1)>1e-7||!finitePoint(a.offset,3,10000)))throw Error('Invalid saved body-surface attachment.');
 const profile=s.profile;if(!Number.isFinite(profile?.height)||profile.height<1.2||profile.height>2.2||['hips','waist','chest'].some(k=>!Number.isFinite(profile.sections?.[k]?.circumference)||profile.sections[k].circumference<=0||profile.sections[k].circumference>10))throw Error('Invalid fitted garment measurement profile.');
 if(!s.levels||!['hips','waist','chest'].every(k=>Number.isFinite(s.levels[k])&&s.levels[k]>=.45&&s.levels[k]<=.85)||!(s.levels.hips<s.levels.waist&&s.levels.waist<s.levels.chest))throw Error('Invalid fitted garment measurement levels.');
 return s;
}

function solveSymmetric(rows,target){const a=rows.map((r,i)=>[...r,target[i]]);for(let i=0;i<3;i++){let pivot=i;for(let j=i+1;j<3;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;[a[i],a[pivot]]=[a[pivot],a[i]];if(Math.abs(a[i][i])<1e-10)throw Error('The fitting patch has insufficient independent grain directions. Draft a new working copy.');const d=a[i][i];for(let k=i;k<4;k++)a[i][k]/=d;for(let j=0;j<3;j++)if(j!==i){const f=a[j][i];for(let k=i;k<4;k++)a[j][k]-=f*a[i][k];}}return a.map(r=>r[3]);}
export function surfaceGradeMatrices(surface,neutralPositions){
 const reference=surface.reference,n=reference.positions.length;if(!Array.isArray(neutralPositions)||neutralPositions.length!==n||neutralPositions.some(p=>!finitePoint(p,3,100)))throw Error('The neutral fitting surface is invalid.');
 const q=v=>(Math.round(v*1e7)/1e7)||0,base=reference.positions.map(p=>p.map(q)),posed=neutralPositions.map(p=>p.map(q)),owner=new Int16Array(n);surface.panels.forEach((p,k)=>{for(const i of p.indices)owner[i]=k;});
 const matrices={},systems=surface.panels.map(()=>({a:[[0,0,0],[0,0,0],[0,0,0]],b:[0,0,0],edges:new Set()}));
 for(const t of reference.faces)for(let k=0;k<3;k++){const i=t[k],j=t[(k+1)%3],system=systems[owner[i]],key=Math.min(i,j)+':'+Math.max(i,j);if(system.edges.has(key))continue;system.edges.add(key);const du=reference.flatPositions[j][0]-reference.flatPositions[i][0],dv=reference.flatPositions[j][1]-reference.flatPositions[i][1],d=du*du+dv*dv,old=base[j].reduce((s,v,a)=>s+(v-base[i][a])**2,0),now=posed[j].reduce((s,v,a)=>s+(v-posed[i][a])**2,0);if(d<1e-16||old<1e-16||now<1e-16)throw Error('The fitting surface contains a collapsed grading edge. Keep the last valid garment.');const row=[du*du/d,2*du*dv/d,dv*dv/d],ratio=now/old;for(let a=0;a<3;a++){system.b[a]+=row[a]*ratio;for(let b=0;b<3;b++)system.a[a][b]+=row[a]*row[b];}}
 for(let i=0;i<surface.panels.length;i++){const system=systems[i],[a,b,c]=solveSymmetric(system.a,system.b),det=a*c-b*b,disc=Math.hypot(a-c,2*b),low=(a+c-disc)/2,high=(a+c+disc)/2;if(det<=0||low<.75**2||high>1.35**2)throw Error('A local fitting patch exceeds the 75–135% grading range. Draft a new working copy.');const root=Math.sqrt(det),den=Math.sqrt(a+c+2*root);matrices[surface.panels[i].id]=[(a+root)/den,b/den,(c+root)/den].map(q);}
 return matrices;
}

/** Grade the retained authored design, never a previous evaluated mesh. The
 * reference UV surface receives the same transform as the authored panels. */
export function fittedPatternInput(base,surface,mesh,{neutralPositions=null}={}){
 validatePattern(base);validateFittedSurface(surface);
 if(base.panels.length!==surface.panels.length||base.panels.some(p=>!surface.panels.some(q=>q.id===p.id)))throw Error('Fitted panel identities changed. Make a flat working copy to add, remove or duplicate panels.');
 const profile=measureNeutralMesh(mesh,{levels:surface.levels});if(!profile.valid)throw Error('Body grading sections need repair: '+profile.warnings.join(' '));
 const x=['hips','waist','chest'].reduce((n,k)=>n+profile.sections[k].circumference/surface.profile.sections[k].circumference,0)/3,y=profile.height/surface.profile.height;
 if([x,y].some(v=>v<.75||v>1.35))throw Error('Body change exceeds the fitted preview grading range (75–135%). Draft a new garment working copy.');
 const doc=structuredClone(base),flat=structuredClone(surface.reference.flatPositions),matrices=neutralPositions?surfaceGradeMatrices(surface,neutralPositions):null;
 for(const panel of doc.panels){const reference=surface.panels.find(p=>p.id===panel.id);if(panel.flip||panel.position.some((v,i)=>Math.abs(v-reference.offset[i])>1e-8))throw Error('Fitted panels use retained UV placement. Make a flat working copy to change placement or flip panels.');
  const factor=reference.kind==='sleeve'?[y,x]:[x,y],matrix=matrices?.[panel.id],scale=p=>matrix?[matrix[0]*p[0]+matrix[1]*p[1],matrix[1]*p[0]+matrix[2]*p[1]]:p.map((v,i)=>v*factor[i]);
  for(const ring of [panel,...(panel.holes||[])]){ring.points=ring.points.map(scale);for(const s of ring.segments||[])if(s.controls)s.controls=s.controls.map(scale);}
  for(const line of panel.internalLines||[])line.points=line.points.map(scale);
  for(const i of reference.indices){const p=scale(flat[i].slice(0,2).map((v,a)=>v-reference.offset[a]));flat[i]=[p[0]+reference.offset[0],p[1]+reference.offset[1],flat[i][2]];}
 }
 validatePattern(doc);const data=buildPattern(doc);
 if(data.faces.length>15000)throw Error('Fitted draping currently supports at most 15,000 triangles. Increase particle distance in a working copy.');
 return {doc,data,flat,profile,grading:{circumferenceScale:x,heightScale:y,...(matrices?{panelMatrices:matrices}:{}),method:matrices?'neutral surface-metric grading':'proportional measured-source grading',warnings:[matrices?'Each panel uses an affine metric fit to neutral body-surface changes; non-affine local changes still require inspection.':'Bodice width uses mean torso girth ratio; sleeve width uses the same ratio. This is approximate grading, not anatomical tailoring.']}};
}

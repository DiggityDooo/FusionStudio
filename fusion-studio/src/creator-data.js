// Original, bounded evaluation of CC0 sparse target data. No executable assets.
export const CREATOR_FORMAT='fusion.character-recipe';
export const SKIN_TONES=['#f4d8c7','#efd0bc','#eac5ab','#e4bb9e','#dfb39a','#d8a88b','#d09d80','#c99476','#c38b70','#b98268','#af785e','#a66e55','#9c644c','#935d47','#89553f','#804d39','#764633','#6d3f30','#64392b','#5b3327','#522d23','#49291f','#40241d','#36201a'];
export function defaultRecipe(sex='female'){
 if(!['female','male'].includes(sex))throw Error('Choose a supported adult preset.');
 return {format:CREATOR_FORMAT,version:1,family:'makehuman-hm08',base:'fusion.makehuman.adult.v1',sex,controls:{height:sex==='female'?1.7:1.8,muscle:.5,weight:.5},shapes:[],favorites:[],locks:[],symmetry:true,seed:12345,appearance:{version:2,tone:sex==='female'?5:9,undertone:0,roughness:.48,pores:.35,freckles:0,ageDetail:0,eye:'#50777b',hair:'#33251d',roots:'#211914',grey:0},hair:{style:'bald',facial:'none',length:1,volume:1,offset:0},visibility:{clothing:'nude',anatomy:true},pose:'standing'};
}
export function validateRecipe(r,definition){
 if(!r||r.format!==CREATOR_FORMAT||r.version!==1||r.family!==definition.family||r.base!==definition.id||!['female','male'].includes(r.sex)||!r.controls||!r.appearance||!r.hair||!r.visibility)throw Error('Unsupported character recipe or base family.');
 const c=r.controls;if(!Number.isFinite(c.height)||c.height<1.3||c.height>2.25||![c.muscle,c.weight].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Character proportions are outside supported limits.');
 const controls=new Map(definition.controls.map(c=>[c.id,c]));
 for(const [id,v]of Object.entries(c)){if(['height','muscle','weight'].includes(id))continue;const d=controls.get(id);if(!d||!Number.isFinite(v)||v<d.min||v>d.max)throw Error('Invalid character control: '+id);}
 if(!Array.isArray(r.shapes)||r.shapes.length>64||new Set(r.shapes.map(s=>s.id)).size!==r.shapes.length)throw Error('Invalid or duplicate shape-key identities.');
 for(const s of r.shapes){if(!s||typeof s.id!=='string'||s.id.length>100||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||!Number.isFinite(s.value)||!Number.isFinite(s.min)||!Number.isFinite(s.max)||s.min< -2||s.max>2||s.min>s.max||s.value<s.min||s.value>s.max||!Array.isArray(s.deltas)||s.deltas.length%4||s.deltas.length>definition.source.positions.length/3*4)throw Error('Invalid authored shape key.');validateDeltas(s.deltas,definition.source.positions.length/3);}
 for(const k of ['favorites','locks'])if(!Array.isArray(r[k])||r[k].length>512||r[k].some(v=>typeof v!=='string'||v.length>200))throw Error('Invalid character control preferences.');
 if(typeof r.symmetry!=='boolean'||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff)throw Error('Invalid character randomization settings.');
 const a=r.appearance;if(!Number.isFinite(a.tone)||a.tone<0||a.tone>SKIN_TONES.length-1||![a.roughness,a.pores,a.freckles,a.ageDetail,a.grey].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isFinite(a.undertone)||Math.abs(a.undertone)>1||![a.eye,a.hair,a.roots].every(v=>/^#[a-f\d]{6}$/i.test(v)))throw Error('Invalid character appearance.');
 if(a.version!==undefined&&a.version!==1&&a.version!==2)throw Error('Unsupported character appearance version. Restore the matching application or a previous project version.');
 if(a.customColor!==undefined&&!/^#[a-f\d]{6}$/i.test(a.customColor)||a.metalness!==undefined&&(!Number.isFinite(a.metalness)||a.metalness<0||a.metalness>1))throw Error('Invalid character material override.');
 if(!['bald','short','medium','long','wavy','curly','coily'].includes(r.hair.style)||!['none','beard','moustache'].includes(r.hair.facial||'none')||![r.hair.length,r.hair.volume].every(v=>Number.isFinite(v)&&v>=.5&&v<=1.5)||!Number.isFinite(r.hair.offset)||Math.abs(r.hair.offset)>.025||!['nude','underwear','clothed'].includes(r.visibility.clothing)||typeof r.visibility.anatomy!=='boolean')throw Error('Invalid hair fitting or visibility settings.');
 return r;
}
const validatedDeltas=new WeakMap(); // sparse target data is immutable once loaded; revalidating 19k-row targets dominated warm evaluations
export function validateDeltas(deltas,count){
 if(validatedDeltas.get(deltas)===count)return;
 const seen=new Set();for(let i=0;i<deltas.length;i+=4){const id=deltas[i];if(!Number.isInteger(id)||id<0||id>=count||seen.has(id)||!deltas.slice(i+1,i+4).every(v=>Number.isFinite(v)&&Math.abs(v)<=5))throw Error('Sparse shape data contains invalid or duplicate source vertices.');seen.add(id);}
 validatedDeltas.set(deltas,count);
}
const blend3=t=>t<=.5?[[0,1-t*2],[1,t*2]]:[[1,2-t*2],[2,t*2-1]];
const typedSourceCache=new WeakMap(); // worker postMessage clones inputs per tick: typed arrays clone as memcpy, plain JSON arrays clone per element
function typedSource(source){
 let typed=typedSourceCache.get(source);
 if(!typed){typed={positions:Float32Array.from(source.positions),bodyIds:Uint32Array.from(source.cornerSource),targets:new Map(Object.entries(source.targets).map(([k,v])=>[k,Float32Array.from(v)]))};typedSourceCache.set(source,typed);}
 return typed;
}
export function creatorInputs(definition,recipe){
 validateRecipe(recipe,definition);const source=definition.source,typed=typedSource(source),targets=[];
 // Adult bases are equally weighted across the three supplied geometry bases.
 // Skin tone is a separate appearance value and never changes this mixture.
 for(const ancestry of ['african','asian','caucasian'])targets.push({data:typed.targets.get(`macrodetails/${ancestry}-${recipe.sex}-young`),value:1/3});
 const muscles=['minmuscle','averagemuscle','maxmuscle'],weights=['minweight','averageweight','maxweight'];
 for(const [m,mw]of blend3(recipe.controls.muscle))for(const[w,ww]of blend3(recipe.controls.weight))if(mw*ww)targets.push({data:typed.targets.get(`macrodetails/universal-${recipe.sex}-young-${muscles[m]}-${weights[w]}`),value:mw*ww});
 for(const c of definition.controls){const v=recipe.controls[c.id]||0;if(v)targets.push({data:typed.targets.get(v>0?c.positive:c.negative),value:Math.abs(v)});}
 for(const s of recipe.shapes)if(s.value)targets.push({data:s.deltas,value:s.value});
 return {positions:typed.positions,bodyIds:typed.bodyIds,targets,height:recipe.controls.height};
}
export function computeCreator({positions,bodyIds,targets,height}){
 const start=performance.now();const isData=a=>Array.isArray(a)||ArrayBuffer.isView(a);if(!isData(positions)||positions.length%3||positions.length>600000||positions.some(v=>!Number.isFinite(v)||Math.abs(v)>100)||!isData(bodyIds)||!bodyIds.length||bodyIds.length>1200000||bodyIds.some(i=>!Number.isInteger(i)||i<0||i>=positions.length/3)||!Array.isArray(targets)||targets.length>512||!Number.isFinite(height)||height<1.3||height>2.25)throw Error('Invalid character evaluation input.');
 const output=new Float32Array(positions);let count=0;
 for(const target of targets){if(!target||!isData(target.data)||target.data.length%4||!Number.isFinite(target.value)||Math.abs(target.value)>4)throw Error('Missing or invalid character target.');count+=target.data.length/4;if(count>2000000)throw Error('Character evaluation exceeds two million sparse deltas.');validateDeltas(target.data,positions.length/3);for(let i=0;i<target.data.length;i+=4){const v=target.data[i]*3;for(let j=0;j<3;j++)output[v+j]+=target.data[i+j+1]*target.value;}}
 let low=Infinity,high=-Infinity;for(const i of bodyIds){low=Math.min(low,output[i*3+1]);high=Math.max(high,output[i*3+1]);}if(high-low<.1)throw Error('Character height collapsed.');const scale=height/(high-low);
 for(let i=0;i<output.length;i+=3){output[i]*=scale;output[i+1]=(output[i+1]-low)*scale;output[i+2]*=scale;}
 if(output.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('Character deformation overflow.');
 return {positions:output,scale,ground:low,milliseconds:performance.now()-start,sparseDeltas:count};
}
export function seededRandomize(definition,recipe,{seed=recipe.seed,categories=['Body','Face']}={}){
 const next=structuredClone(recipe);let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};const locked=id=>next.locks.includes(id)||next.locks.includes(id.split('/')[0]);
 for(const c of definition.controls)if(categories.includes(c.category)&&!locked(c.id))next.controls[c.id]=(random()-.5)*.65;
 if(categories.includes('Body'))for(const id of ['muscle','weight'])if(!locked(id))next.controls[id]=.25+random()*.5;
 if(next.symmetry)for(const c of definition.controls)if(/\/l-/.test(c.id)){const right=c.id.replace('/l-','/r-');if(!locked(right)&&!locked(c.id)&&definition.controls.some(v=>v.id===right))next.controls[right]=next.controls[c.id]||0;}
 next.seed=seed>>>0;return validateRecipe(next,definition);
}
export function mirrorShape(shape,mirror){
 const copy={...structuredClone(shape),id:crypto.randomUUID(),name:(shape.name+' mirrored').slice(0,80),deltas:[]};
 for(let i=0;i<shape.deltas.length;i+=4){const id=mirror[shape.deltas[i]];if(!Number.isInteger(id))throw Error('This base has no verified mirror correspondence.');copy.deltas.push(id,-shape.deltas[i+1],shape.deltas[i+2],shape.deltas[i+3]);}
 return copy;
}

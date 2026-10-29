// Original bounded interpreter of the public DSON scalar operation format.
const LIMITS={operations:512,stack:256,knots:128};
const finite=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Expected a finite scalar');return v;};
export function parseChannelReference(url){
 if(typeof url!=='string'||!url.length||url.length>4096||/[\u0000-\u001f\\]/.test(url))throw Error('Invalid channel reference');
 const hash=url.lastIndexOf('#');let prefix,leaf;try{prefix=hash<0?'':decodeURIComponent(url.slice(0,hash));leaf=decodeURIComponent(hash<0?url:url.slice(hash+1));}catch{throw Error('Invalid percent encoding in channel reference');}
 if(!leaf||/[\u0000-\u001f]/.test(prefix)||/[\u0000-\u001f#]/.test(leaf)||/^(?:https?|file|data|javascript|ftp):/i.test(prefix))throw Error('Unsupported external channel reference');
 if(!leaf.includes('?'))leaf+='?value';if(!/^[^?]+\?[^?]+$/.test(leaf))throw Error('Invalid channel property path');return {leaf,key:prefix?prefix+'#'+leaf:leaf,qualified:!!prefix};
}
export const channelId=url=>parseChannelReference(url).leaf;
function spline(knots,x,kind){
  const stride=kind==='spline_tcb'?5:2;
  if(knots.some(k=>!Array.isArray(k)||k.length!==stride||k.some(v=>!Number.isFinite(v))))throw Error('Invalid spline knot');
  for(let i=1;i<knots.length;i++)if(knots[i][0]<=knots[i-1][0])throw Error('Spline keys must strictly increase');
  if(x<=knots[0][0])return knots[0][1];if(x>=knots.at(-1)[0])return knots.at(-1)[1];
  const i=knots.findIndex(k=>k[0]>x)-1,a=knots[i],b=knots[i+1],span=b[0]-a[0],t=(x-a[0])/span;
  if(kind==='spline_constant')return a[1];if(kind==='spline_linear')return a[1]+(b[1]-a[1])*t;
  const slope=(l,r)=>(r[1]-l[1])/(r[0]-l[0]);const d=slope(a,b),prev=i?slope(knots[i-1],a):d,next=i+2<knots.length?slope(b,knots[i+2]):d;
  const [,,ta,ca,ba]=a,[,,tb,cb,bb]=b;
  const m0=(1-ta)*((1+ca)*(1+ba)*prev+(1-ca)*(1-ba)*d)/2;
  const m1=(1-tb)*((1-cb)*(1+bb)*d+(1+cb)*(1-bb)*next)/2;
  return (2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*span*m1;
}
export function evaluateOperations(operations,resolve){
  if(!Array.isArray(operations)||!operations.length||operations.length>LIMITS.operations)throw Error('Formula operation limit exceeded');
  const stack=[],pop=()=>{if(!stack.length)throw Error('Formula stack underflow');return stack.pop();},scalar=()=>finite(pop());
  for(const item of operations){
    const op=item?.op;
    if(op==='push'){if(item.url!==undefined){if(item.val!==undefined)throw Error('Push must specify either url or val');parseChannelReference(item.url);stack.push(finite(resolve(item.url)));}else if(Array.isArray(item.val)){if(![2,5].includes(item.val.length))throw Error('Invalid spline knot');stack.push(item.val.map(finite));}else stack.push(finite(item.val));}
    else if(['add','sub','mult','div'].includes(op)){const b=scalar(),a=scalar();if(op==='div'&&b===0)throw Error('Division by zero');stack.push(finite(op==='add'?a+b:op==='sub'?a-b:op==='mult'?a*b:a/b));}
    else if(op==='neg'||op==='inv'){const a=scalar();if(op==='inv'&&a===0)throw Error('Division by zero');stack.push(finite(op==='neg'?-a:1/a));}
    else if(['spline_linear','spline_constant','spline_tcb'].includes(op)){const n=scalar();if(!Number.isInteger(n)||n<2||n>LIMITS.knots||stack.length<n+1)throw Error('Invalid spline knot count');const knots=stack.splice(stack.length-n,n),x=scalar();stack.push(finite(spline(knots,x,op)));}
    else throw Error('Unsupported formula operation: '+String(op));
    if(stack.length>LIMITS.stack)throw Error('Formula stack limit exceeded');
  }
  if(stack.length!==1)throw Error('Formula must leave exactly one result');return finite(stack[0]);
}

// Definitions keep their identity. A qualified URL can only use an explicit
// alias when aliases are present; legacy unqualified metadata is diagnosed if
// two different file-qualified references compete for its short selector.
export function evaluateFormulas(channels,formulas=[],inputs={},options={}){
 if(!Array.isArray(channels)||channels.length>16384||!Array.isArray(formulas)||formulas.length>4096||!inputs||typeof inputs!=='object'||Object.keys(inputs).length>24576)throw Error('Invalid or oversized formula document');
 const nodes=new Map(),aliases=new Map(),leafMap=new Map(),errors=[],compiled=[],order=[],failed=new Set();let operationCount=0;
 const addAlias=(ref,key)=>{const r=parseChannelReference(ref);if(!aliases.has(r.key))aliases.set(r.key,new Set());aliases.get(r.key).add(key);if(!leafMap.has(r.leaf))leafMap.set(r.leaf,new Set());leafMap.get(r.leaf).add(key);};
 const node=(key)=>{if(!nodes.has(key))nodes.set(key,{key,base:0,formulas:[],dependencies:new Set(),explicit:false});return nodes.get(key);};
 for(const c of channels){if(!c||typeof c!=='object')throw Error('Malformed formula channel');const key=parseChannelReference(c.id).key;if(nodes.has(key))throw Error('Ambiguous duplicate channel: '+key);if(c.min!==undefined)finite(c.min);if(c.max!==undefined)finite(c.max);if((c.min??-Infinity)>(c.max??Infinity))throw Error('Invalid channel limits: '+key);const n=node(key);n.definition=c;n.base=finite(c.value??c.default??0);n.explicit=!!c.strictReferences||parseChannelReference(c.id).qualified||!!c.aliases?.length;addAlias(c.id,key);if(c.aliases!==undefined&&(!Array.isArray(c.aliases)||c.aliases.length>256))throw Error('Channel alias limit exceeded');for(const alias of c.aliases||[])addAlias(alias,key);}
 const unique=(set,ref)=>{if(set?.size>1)throw Error('Ambiguous channel reference: '+ref);return set?.values().next().value;};
 const legacyQualified=new Map();
 const resolve=(ref,create=false)=>{const r=parseChannelReference(ref),exact=unique(aliases.get(r.key),ref);if(exact)return exact;const short=unique(leafMap.get(r.leaf),ref);if(short){const n=nodes.get(short);if(r.qualified){if(n.explicit||!n.definition){if(create){const target=node(r.key);addAlias(ref,target.key);return target.key;}throw Error('Unresolved qualified channel: '+ref);}const asset=r.key.slice(0,r.key.lastIndexOf('#'));if(!legacyQualified.has(short))legacyQualified.set(short,new Set());legacyQualified.get(short).add(asset);if(legacyQualified.get(short).size>1)throw Error('Ambiguous qualified aliases for legacy channel: '+r.leaf);}return short;}if(create){const n=node(r.key);addAlias(ref,n.key);return n.key;}throw Error('Unresolved channel: '+ref);};
 for(const [ref,value] of Object.entries(inputs)){const key=resolve(ref,true);node(key).base=finite(value);}
 // Register all outputs first so forward references and long chains work.
 formulas.forEach((f,index)=>{let key;try{if(!f||typeof f!=='object')throw Error('Malformed formula');key=resolve(f.output,true);const n=node(key);const stage=f.stage==='mult'?'multiply':f.stage;if(!['sum','multiply',undefined].includes(stage))throw Error('Unsupported formula stage: '+f.stage);if(!Array.isArray(f.operations)||!f.operations.length||f.operations.length>512)throw Error('Formula operation limit exceeded');operationCount+=f.operations.length;if(operationCount>131072)throw Error('Formula total operation limit exceeded');const entry={...f,stage,index,key};n.formulas.push(entry);compiled.push(entry);}catch(error){errors.push({index,channel:key||String(f?.output),code:'invalid-formula',message:error.message});if(key)failed.add(key);}});
 if(nodes.size>24576)throw Error('Formula dependency node limit exceeded');
 for(const f of compiled)for(const op of f.operations)if(op?.op==='push'&&op.url!==undefined)try{node(f.key).dependencies.add(resolve(op.url));}catch(error){errors.push({index:f.index,channel:f.key,code:'unresolved-reference',message:error.message});failed.add(f.key);}
 for(const [key,refs] of legacyQualified)if(refs.size>1){failed.add(key);errors.push({channel:key,code:'ambiguous-reference',message:'Ambiguous qualified aliases for legacy channel: '+key});for(const n of nodes.values())if(n.dependencies.has(key))failed.add(n.key);}
 // Iterative DFS avoids exhausting the JavaScript call stack on long assets.
 const colors=new Map(),positions=new Map(),cycleNodes=new Set();
 for(const start of nodes.keys()){if(colors.has(start))continue;const stack=[{key:start,dependencies:[...node(start).dependencies],at:0}];colors.set(start,1);positions.set(start,0);
  while(stack.length){const top=stack.at(-1);if(top.at<top.dependencies.length){const dep=top.dependencies[top.at++];if(colors.get(dep)===1){const cycle=stack.slice(positions.get(dep)).map(s=>s.key);for(const key of cycle)cycleNodes.add(key);continue;}if(!colors.has(dep)){colors.set(dep,1);positions.set(dep,stack.length);stack.push({key:dep,dependencies:[...node(dep).dependencies],at:0});}}else{stack.pop();positions.delete(top.key);colors.set(top.key,2);order.push(top.key);}}
 }
 for(const key of cycleNodes){failed.add(key);errors.push({channel:key,code:'dependency-cycle',message:'Formula dependency cycle: '+key});}
 const values=new Map(),rawValues=new Map();for(const key of order){const n=node(key);if(failed.has(key))continue;try{let sum=n.base,mult=1;for(const f of n.formulas){const value=evaluateOperations(f.operations,ref=>{const dep=resolve(ref);if(!values.has(dep))throw Error('Dependency failed: '+dep);return values.get(dep);});if(f.stage==='multiply')mult=finite(mult*value);else sum=finite(sum+value);}let value=finite(sum*mult);const c=n.definition;if(c)value=Math.min(c.max??Infinity,Math.max(c.min??-Infinity,value));rawValues.set(key,value);if(options.forced?.has(key))value=finite(options.forced.get(key));values.set(key,value);}catch(error){failed.add(key);errors.push({channel:key,code:'evaluation-failed',message:error.message});}}
 return {values:Object.fromEntries(values),rawValues:Object.fromEntries(rawValues),errors,valid:errors.length===0,order,dependencies:Object.fromEntries([...nodes].map(([id,n])=>[id,[...n.dependencies]])),outputs:[...new Set(compiled.map(f=>f.key))],statistics:{channels:channels.length,formulas:formulas.length,operations:operationCount,nodes:nodes.size}};
}


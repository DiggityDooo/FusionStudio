// Only snapshots owned by this module may share their arrays with internal
// history capture. Public documents receive detached, mutable copies.
const immutableImages=new WeakSet();
function freeze(value,seen=new WeakSet()) {
 if(!value||typeof value!=='object'||seen.has(value))return value;seen.add(value);
 if(Array.isArray(value)){for(let i=0;i<value.length;i++)if(value[i]&&typeof value[i]==='object')freeze(value[i],seen);}
 else for(const key of Object.keys(value))freeze(value[key],seen);
 return Object.freeze(value);
}
export function immutableImageSnapshot(image){const snapshot=freeze(structuredClone(image));immutableImages.add(snapshot);return snapshot;}
export function isImmutableImageSnapshot(image){return !!image&&immutableImages.has(image);}

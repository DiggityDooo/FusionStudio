import {Group} from 'three';
const header=new Group().toJSON().metadata;
const collections=['geometries','materials','textures','images','shapes','skeletons','animations','nodes'];
/** Use Three's public metadata cache to omit reproducible buffers before they
 * allocate JSON arrays, and reuse image encoding only while its source version
 * and data object are unchanged. Returned documents own their mutable arrays. */
export function serializeScene(root,imageCache=new WeakMap(),derived=new Map()){
 const meta=Object.fromEntries(collections.map(key=>[key,{}])),sources=new Set();
 root.traverse(n=>{for(const material of [].concat(n.material||[]))for(const value of Object.values(material))if(value?.isTexture)sources.add(value.source);if(n.background?.isTexture)sources.add(n.background.source);if(n.environment?.isTexture)sources.add(n.environment.source);});
 for(const source of sources){const prior=imageCache.get(source);if(prior?.version===source.version&&prior.data===source.data)meta.images[source.uuid]=structuredClone(prior.image);}
 for(const [id,value]of derived)meta.geometries[id]=structuredClone(value);
 const object=root.toJSON(meta).object,output={metadata:{...header}};
 for(const key of collections){let values=Object.values(meta[key]).map(value=>{const copy={...value};delete copy.metadata;return copy;});if(key==='images')values.sort((a,b)=>a.uuid.localeCompare(b.uuid));if(values.length)output[key]=values;}
 for(const source of sources)if(meta.images[source.uuid])imageCache.set(source,{version:source.version,data:source.data,image:structuredClone(meta.images[source.uuid])});
 output.object=object;return output;
}

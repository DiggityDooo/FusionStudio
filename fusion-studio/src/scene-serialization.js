import {Group} from 'three';
import {immutableImageSnapshot,isImmutableImageSnapshot} from './image-snapshots.js';
const header=new Group().toJSON().metadata;
const collections=['geometries','materials','textures','images','shapes','skeletons','animations','nodes'];
/** Use Three's public metadata cache to omit reproducible buffers before they
 * allocate JSON arrays, and reuse image encoding only while its source version
 * and data object are unchanged. Public documents own mutable image arrays;
 * internal history capture can explicitly share owned immutable images. */
export function serializeScene(root,imageCache=new WeakMap(),derived=new Map(),{immutableImages=false}={}){
 const meta=Object.fromEntries(collections.map(key=>[key,{}])),sources=new Set(),reused=new Set();
 root.traverse(n=>{for(const material of [].concat(n.material||[]))for(const value of Object.values(material))if(value?.isTexture)sources.add(value.source);if(n.background?.isTexture)sources.add(n.background.source);if(n.environment?.isTexture)sources.add(n.environment.source);});
 for(const source of sources){const prior=imageCache.get(source);if(prior?.version===source.version&&prior.data===source.data&&prior.image.uuid===source.uuid&&isImmutableImageSnapshot(prior.image)){meta.images[source.uuid]=prior.image;reused.add(source.uuid);}}
 for(const [id,value]of derived)meta.geometries[id]=structuredClone(value);
 const object=root.toJSON(meta).object,output={metadata:{...header}},snapshots=new Map();
 for(const [id,value]of Object.entries(meta.images)){const clean={...value};delete clean.metadata;snapshots.set(id,isImmutableImageSnapshot(value)?value:immutableImageSnapshot(clean));}
 for(const source of sources)if(snapshots.has(source.uuid)&&!reused.has(source.uuid))imageCache.set(source,{version:source.version,data:source.data,image:snapshots.get(source.uuid)});
 for(const key of collections){let values=Object.values(meta[key]).map(value=>{if(key==='images'){if(immutableImages)return snapshots.get(value.uuid);if(reused.has(value.uuid))return structuredClone(snapshots.get(value.uuid));}const copy={...value};delete copy.metadata;return copy;});if(key==='images')values.sort((a,b)=>a.uuid.localeCompare(b.uuid));if(values.length)output[key]=values;}
 output.object=object;return output;
}

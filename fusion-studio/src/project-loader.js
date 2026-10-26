import {ObjectLoader} from 'three';
import {hydrateCreator} from './character-creator.js';
// Three's loader reconstructs TextureSource objects with new UUIDs. Retain the
// document image identity so reload/undo does not invent new asset references.
export class ProjectLoader extends ObjectLoader {
 parseMaterials(json,textures){const materials=super.parseMaterials(json,textures);for(const entry of json||[])if(entry.ior!==undefined){if(!Number.isFinite(entry.ior)||entry.ior<1||entry.ior>3)throw Error('Invalid physical material index of refraction.');if(materials[entry.uuid]?.isMeshPhysicalMaterial)materials[entry.uuid].ior=entry.ior;}return materials;}
 async parseAsync(json){if(json.images?.some(i=>i.fusion_history_image))throw Error('History-only image references cannot be opened as a project. Restore an embedded-image project file.');const root=await super.parseAsync(json),jobs=[];root.traverse(n=>{if(n.userData.fusion_creator)jobs.push(hydrateCreator(n));});await Promise.all(jobs);root.traverse(n=>{if(n.geometry?.userData.fusion_derived_creator_body||n.geometry?.userData.fusion_derived_creator_hair)throw Error('A derived character mesh has no compatible creator recipe. Restore the matching foundation or relink the character.');});return root;}
 async parseImagesAsync(json){const sources=await super.parseImagesAsync(json);for(const image of json||[])if(sources[image.uuid])sources[image.uuid].uuid=image.uuid;return sources;}
 parseImages(json,onLoad){const sources=super.parseImages(json,onLoad);for(const image of json||[])if(sources[image.uuid])sources[image.uuid].uuid=image.uuid;return sources;}
}

import {buildPattern} from './patterns.js';
// Each preview owns a worker. Termination cancels both tessellation and its
// pending response without exposing partial meshes to the scene or history.
self.onmessage=({data})=>{
  try {
    const mesh=buildPattern(data.document);
    self.postMessage({revision:data.revision,mesh:{faces:mesh.faces,uvs:mesh.uvs,groups:mesh.groups,quality:mesh.quality}});
  } catch(error) {
    self.postMessage({revision:data.revision,error:String(error?.message||error)});
  }
};

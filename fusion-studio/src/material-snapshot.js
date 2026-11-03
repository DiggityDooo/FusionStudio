// Three's derived reflectivity alias does not preserve the exact authored IOR.
// Use the same explicit value for full documents and insertion snapshots.
export function retainPhysicalIor(root,document){
 const physical=new Map();root.traverse(n=>{for(const material of [].concat(n.material||[]))if(material?.isMeshPhysicalMaterial)physical.set(material.uuid,material);});
 for(const material of document.materials||[])if(physical.has(material.uuid)){material.ior=physical.get(material.uuid).ior;delete material.reflectivity;}
 return document;
}

// Skeleton cloning shares materials. Stamping delivery metadata must operate on
// owned material records, keeping texture resources and stable sidecar IDs.
export function copyExportMaterials(root,copies=new WeakMap()){
 const copy=material=>{if(!material)return material;if(!copies.has(material)){const owned=material.clone();owned.uuid=material.uuid;owned.userData=structuredClone(material.userData);copies.set(material,owned);}return copies.get(material);};
 root.traverse(n=>{if(n.material)n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);});
 return root;
}

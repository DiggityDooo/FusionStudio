import {modifierCapability} from './modifier-capabilities.js';
import {animationSamplingReasons} from './animation-export.js';
import meshOperations from '../electron/mesh-operations.json' with {type:'json'};
const MESH_OPERATIONS=Object.keys(meshOperations),EXPORTS=['glb','fbx','blend','obj','usd','usdz','abc','stl','ply'],STATIC_EXPORTS=['obj','usd','usdz','abc','stl','ply'];
export function inspectObject(object){
  const result={nativeBlend:0,sculptLayers:0,bumpMaps:0,ik:0,jointLimits:0,formulas:0,creators:0,meshes:0,triangles:0,skinned:0,morphs:0,animations:0,materials:0,textures:0,nonUniform:false,mirrored:false,procedural:false,garment:false};
  object?.traverse?.(n=>{
    result.formulas+=n.userData?.fusion_deformation?.formulas?.length||0;
    if(n.userData?.fusion_sculpt_layers)result.sculptLayers++;
    if(n.userData?.fusion_creator)result.creators++;
    if(n.userData?.dson_deformation)try{const data=typeof n.userData.dson_deformation==='string'?JSON.parse(n.userData.dson_deformation):n.userData.dson_deformation;result.formulas+=data.formulas?.length||0;}catch{}
    result.nativeBlend+=n.userData?.nativeBlend?1:0;result.animations+=(n.animations||[]).length;result.ik+=(n.userData?.fusion_ik||[]).length;result.jointLimits+=(n.userData?.fusion_joint_limits||[]).length;
    if((n.userData?.fusion_timeline||[]).length>1)result.animations++;
    if(n.isMesh){result.meshes++;result.triangles+=(n.geometry.index?.count||n.geometry.attributes.position?.count||0)/3;result.skinned+=n.isSkinnedMesh?1:0;result.morphs+=Object.keys(n.geometry.morphAttributes||{}).length;result.materials+=Array.isArray(n.material)?n.material.length:1;}
    if(n.isMesh)for(const mat of [].concat(n.material)){if(mat?.map||mat?.normalMap||mat?.bumpMap)result.textures++;if(mat?.bumpMap)result.bumpMaps++;}
    const s=n.scale;if(s){if(Math.abs(Math.abs(s.x)-Math.abs(s.y))>1e-4||Math.abs(Math.abs(s.x)-Math.abs(s.z))>1e-4)result.nonUniform=true;if(s.x*s.y*s.z<0)result.mirrored=true;}
    if(['character','garment','pattern'].includes(n.userData?.fusion_kind))result.procedural=true;
    if(n.userData?.fusion_cloth||n.userData?.patternProject)result.garment=true;
  });result.animationSampling=object?.traverse?animationSamplingReasons(object):[];return result;
}
export function checkCompatibility(action,stats,context={}){
  const issues=[];
  const add=(severity,title,detail)=>issues.push({severity,title,detail});
  const topology=[...MESH_OPERATIONS,'extrude','delete-face','sculpt','cloth'];
  if(action==='detach-native')add('warning','Native shader and scene data will be detached','A converted copy uses Fusion viewport geometry and generic materials. Original Blender shader graphs, lights, world and camera effects stay with the preserved source.');
  if(stats.nativeBlend&&(topology.includes(action)||['sculpt','extrude','delete-face',...EXPORTS].includes(action)))add('warning','Preserved Blender render data will not follow mesh conversion','Keep the preserved source. The converted working mesh uses approximate viewport materials; native shader graphs and scene presentation are not carried by generic interchange.');
  if(topology.includes(action)){
    if(stats.sculptLayers&&action!=='sculpt')add('warning','Sculpt layers become a baked working copy','This operation cannot remap editable sculpt-layer deltas through topology or engine conversion. Retain the layered source and use an explicit working copy of its evaluated surface.');
    if(stats.skinned||stats.morphs){const keepsTopology=modifierCapability(action)?.topology==='preserves';add('block','Rig or morph data can be lost',keepsTopology?'This modifier preserves mesh connectivity, but the current Blender exchange returns a static evaluated mesh. Make a static working copy to retain the rigged source.':'This mesh contains skin weights or morph targets. Changing its topology can break deformation or prevent the modifier from applying. Make a static working copy and retain the rigged source.');}
    if(stats.animations)add('warning','Animated mesh','Applying this operation can invalidate animation bindings. Save a version and work on a copy.');
    if(context.keyed)add('warning','Keyframe bindings will be detached','This processing step returns a static geometry snapshot at the current frame. Use a working copy to keep the original object and its transform or pose keys.');
    if(stats.procedural&&action!=='cloth')add('warning','Parametric controls will be detached','The result becomes a regular mesh. Character or pattern sliders will no longer rebuild this result. A duplicate keeps the original controls available.');
    if(stats.nonUniform&&['bevel','solidify','cloth','wireframe','weld','remesh','inset','bisect','screw','radial_array','displace'].includes(action))add('warning','Uneven object scale','Thickness and simulation distances depend on the scale. The engine will apply scale to a working copy before processing.');
    if(stats.mirrored)add('warning','Negative scale','Mirrored transforms can flip winding and normals. Inspect the result before continuing.');
    if(stats.materials>stats.meshes&&['extrude','delete-face','remesh'].includes(action))add('warning','Multiple material regions','This operation may collapse material regions or UV seams. Use a duplicate if those regions matter.');
  }
  if(action==='subdivide'&&stats.triangles*4**(context.levels||1)>1000000)add('block','Mesh is too dense','These subdivision settings exceed one million estimated output triangles. Lower levels or reduce the mesh first.');
  if(['sculpt','extrude','delete-face'].includes(action)&&stats.triangles>300000)add('block','Interactive editing limit','This mesh exceeds 300,000 triangles. Reduce it or isolate a smaller part before editing.');
  if(MESH_OPERATIONS.includes(action))add('warning',context.editableStack?'Editable modifier working copy':'Baked mesh working copy',context.editableStack?'Fusion retains the original source geometry and this modifier’s parameters. The evaluated viewport passes through glTF; attribute changes are reported per stack entry. The source remains available for component edits.':'This operation returns an applied mesh through glTF. Native modifier stacks and controller metadata are not carried by this exchange. Keep the original object for editing.');
  if(action==='array'&&stats.triangles*(context.count||3)>1000000)add('block','Array output is too dense','Lower the copy count or simplify the mesh to stay below one million estimated output triangles.');
  if(action==='remesh'&&stats.textures)add('warning','Voxel remesh removes texture coordinates','Rebuild UVs and rebake textures on the result. Original texture placement cannot be preserved.');
  if(action==='cloth'){
    if(context.sewnPattern)add('warning','Sewn pattern bake','Simulation starts from the authored flat panels and current placement. The result is a static drape; pins, seams and pattern outlines remain on the preserved source. Seam closure is approximate; inspect the remaining gaps after baking.');
    for(const detail of context.patternWarnings||[])add('warning','Pattern compatibility',detail);
    if(!stats.garment)add('block','Select a garment pattern','Clothing simulation expects a Fusion garment with a pinned edge. Create a pattern in Clothing first.');
    if(context.colliders===0)add('warning','No collision object','The cloth will hang from its pins under gravity. Add a body or model to drape it against.');
    if(context.animatedColliders)add('warning','Animated collision surface','This simulation uses the current pose as a static collision surface. Animated cloth playback is not included in this bake.');
  }
  if(EXPORTS.includes(action)&&stats.ik)add('warning','IK controls become a pose or baked animation','Exchange files do not retain editable Fusion IK targets or bend poles. Animated scenes are sampled at the timeline frame rate through its End frame. Keep the Fusion project to edit the controls. OBJ contains only the current static pose.');
  if(EXPORTS.includes(action)&&stats.jointLimits)add('warning','Joint limits become evaluated motion','Exchange files retain the constrained pose or animation sampled once per timeline frame, rather than editable Fusion limits. Keep the Fusion project for local bounds and references.');
  if(EXPORTS.includes(action)&&stats.formulas)add('warning','Character drivers become evaluated motion','Fusion dependency graphs, source-axis bindings and pose correctives are baked into the exported pose, live morph targets or sampled animation. Keep the Fusion project to edit driver rules.');
  if(EXPORTS.includes(action)&&stats.creators)add('warning','Generator recipes stay in Fusion projects','Body and face controls, hairstyle bindings and generator settings are evaluated for exchange. Supported formats retain the resulting geometry, rig and authored shape keys; OBJ is static. Save a Fusion project to keep the editable character recipe.');
  if(EXPORTS.includes(action)&&stats.bumpMaps)add('warning','Bump-map support depends on the target','GLB embeds Three.js EXT_materials_bump data. Fusion restores supported embedded PNG/JPEG bump textures in its Blender jobs, but other consumers and delivery formats may omit or approximate this shading. Keep the Fusion project and original maps; inspect the export report before relying on appearance parity.');
  if(EXPORTS.includes(action)&&stats.sculptLayers)add('warning','Editable sculpt layers stay in Fusion projects','Exchange retains the current evaluated surface. Base geometry, sparse layer deltas, layer strengths and locks stay editable in the Fusion project; they are not silently represented as native Blender/ZBrush sculpt layers.');
  if(EXPORTS.includes(action)&&stats.animationSampling?.length)add('warning','Animation requires sampled exchange',stats.animationSampling.join(', ')+'. Uniform linear and held tracks keep their interpolation. Eased or mixed curves are sampled four times per frame; evaluated character/rig dependencies use the timeline frame rate. Subframe motion is approximate. The GLB includes an animation report; keep the Fusion project for editable source curves and controls.');
  if(STATIC_EXPORTS.includes(action)&&(stats.skinned||stats.morphs||stats.animations))add('warning',action.toUpperCase()+' keeps a static mesh',action.toUpperCase()+' does not carry the rig, morphs, or animation here. Export GLB or FBX when you need deformation data.');
  if(action==='uv'&&stats.textures)add('warning','Texture placement will change','UV projection replaces the current texture coordinates. Existing skin, clothing, or detail maps can become misaligned. Keep the original mapped object as a reference.');
  if(action==='native-shape')add('warning','Native mesh and rig will be rebuilt','Reapplying native morphs rebuilds a working mesh from the saved source pose. Current in-app bone poses, animation bindings, and fitted clothing may need to be reapplied. Use a copy to retain the current state.');
  if(action==='fbx'&&(stats.materials||stats.morphs))add('warning','Interchange fidelity','Specialized vendor shaders and controller metadata do not survive a generic FBX exchange. Preserve your native asset; inspect materials and morphs after export.');
  if(action==='convert'){
    const ext=context.extension?.toLowerCase();
    if(['.obj','.stl','.ply'].includes(ext))add('warning','Units and deformation data','This format may not carry units, rigs, or animation. Choose its source units before conversion.');
    if(ext==='.blend')add('warning','Evaluated viewport and preserved render scene','Fusion keeps an embedded Blender scene for native shaders, lights and source-camera rendering. The viewport is an evaluated static mesh with approximate materials. Root transforms freeze object constraints at the imported frame; world-space shaders may change appearance. Additional Fusion objects are supported in native rendering; geometry/material edits require an explicit converted working copy. Native animation, drivers, file-output compositor nodes and all Blender editing tools are not reproduced by the viewport.');
    if(['.fbx','.blend','.duf'].includes(ext))add('warning','Character and shader conversion','The working scene may differ from the native asset: custom shaders, scripted controllers, and some deformation metadata require inspection. Your native source stays available.');
  }
  return {issues,blocked:issues.some(i=>i.severity==='block'),warnings:issues.filter(i=>i.severity==='warning').length};
}

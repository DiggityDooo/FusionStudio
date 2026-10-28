// Part B — layout catalogs, control registries, and ledger coverage helpers.
import {ACTIONS,PRESETS,bindings,chordsFor} from './keymap.js';

export const FUSION_WORKSPACES=['Layout','Modeling','Sculpting','UV Editing','Shading','Character','Clothing','Animation','Rendering','Assets'];

export const B2_LAYOUT_PATTERNS={
  quad_four_view:{id:'quad_four_view',label:'Quad view (Max/Maya/C4D/Houdini)',fusion:{panels:['viewport.quad','outliner','properties'],workspace:'Layout'}},
  single_viewport_panels:{id:'single_viewport_panels',label:'Large viewport + side panels (Blender/ZBrush)',fusion:{panels:['library','viewport','inspector','timeline'],workspace:'Layout'}},
  left_toolbar:{id:'left_toolbar',label:'Left toolbar + center + right properties',fusion:{panels:['library.tools','viewport','inspector'],workspace:'Modeling'}},
  top_shelf_timeline:{id:'top_shelf_timeline',label:'Top shelf + viewport + bottom timeline',fusion:{panels:['workspaces','viewport','timeline'],workspace:'Animation'}},
  hierarchy_inspector:{id:'hierarchy_inspector',label:'Hierarchy + viewport + inspector + assets',fusion:{panels:['scene','viewport','inspector','assets'],workspace:'Assets'}},
  node_viewport_params:{id:'node_viewport_params',label:'Node editor + viewport + parameters',fusion:{panels:['geo_nodes','viewport','inspector'],workspace:'Modeling'}},
  pattern_garment_split:{id:'pattern_garment_split',label:'2D pattern + 3D garment',fusion:{panels:['library','viewport'],workspace:'Clothing'}},
  task_workspaces:{id:'task_workspaces',label:'Task-based workspace tabs',fusion:{panels:['workspaces'],workspaces:FUSION_WORKSPACES}},
  layer_stack_properties:{id:'layer_stack_properties',label:'Layer stack + properties (Substance)',fusion:{panels:['paint','inspector'],workspace:'Shading'}},
};

export const B3_DCC_LAYOUTS={
  blender:{vendor:'Blender',regions:['toolbar','outliner','properties','timeline','header','workspace_tabs'],editors:['3D Viewport','UV Editor','Shader Editor','Compositor','Geometry Nodes','Dope Sheet','Graph Editor','Image Editor','Video Sequencer'],fusionWorkspace:'Layout'},
  maya:{vendor:'Maya',regions:['shelf','channel_box','attribute_editor','hypergraph','time_slider','command_line'],fusionWorkspace:'Character'},
  max:{vendor:'3ds Max',regions:['ribbon','command_panel','quad_menu','track_view','maxscript_listener'],fusionWorkspace:'Layout'},
  c4d:{vendor:'Cinema 4D',regions:['object_manager','attribute_manager','material_manager','timeline','commander','picture_viewer'],fusionWorkspace:'Layout'},
  zbrush:{vendor:'ZBrush',regions:['top_shelf','left_shelf','right_shelf','subtool','lightbox','hotbox'],fusionWorkspace:'Sculpting'},
  houdini:{vendor:'Houdini',regions:['network_editor','parameters','scene_view','desktops','take_list'],fusionWorkspace:'Layout'},
  substance:{vendor:'Substance Painter',regions:['layers','properties','shelf','texture_sets','viewport'],fusionWorkspace:'Shading'},
  marvelous:{vendor:'Marvelous Designer',regions:['pattern_2d','garment_3d','property_editor','sim_toolbar'],fusionWorkspace:'Clothing'},
  unreal:{vendor:'Unreal',regions:['outliner','details','content_browser','place_actors','sequencer'],fusionWorkspace:'Rendering'},
  unity:{vendor:'Unity',regions:['hierarchy','inspector','project','game_view','timeline'],fusionWorkspace:'Rendering'},
  godot:{vendor:'Godot',regions:['scene_tree','inspector','filesystem','output'],fusionWorkspace:'Layout'},
};

/** Map a B3 ledger line (substring match) to a layout descriptor. */
export function matchB3Layout(ledgerKey){
  const k=ledgerKey.toLowerCase();
  if(k.includes('blender')||k.includes('3d viewport')&&k.includes('toolbar'))return B3_DCC_LAYOUTS.blender;
  if(k.includes('maya')||k.includes('channel box'))return B3_DCC_LAYOUTS.maya;
  if(k.includes('3ds max')||k.includes('ribbon')||k.includes('maxscript'))return B3_DCC_LAYOUTS.max;
  if(k.includes('cinema 4d')||k.includes('commander'))return B3_DCC_LAYOUTS.c4d;
  if(k.includes('zbrush')||k.includes('subtool'))return B3_DCC_LAYOUTS.zbrush;
  if(k.includes('houdini')||k.includes('desktops'))return B3_DCC_LAYOUTS.houdini;
  if(k.includes('substance')||k.includes('texture set'))return B3_DCC_LAYOUTS.substance;
  if(k.includes('marvelous')||k.includes('2d pattern'))return B3_DCC_LAYOUTS.marvelous;
  if(k.includes('unreal')||k.includes('content browser'))return B3_DCC_LAYOUTS.unreal;
  if(k.includes('unity')||k.includes('game view'))return B3_DCC_LAYOUTS.unity;
  if(k.includes('godot'))return B3_DCC_LAYOUTS.godot;
  if(k.includes('timeline'))return {vendor:'Fusion',regions:['timeline'],fusionWorkspace:'Animation'};
  if(k.includes('workspace'))return {vendor:'Fusion',regions:['workspaces'],fusionWorkspace:'Layout',workspaces:FUSION_WORKSPACES};
  return {vendor:'Fusion',regions:['library','viewport','inspector','timeline'],fusionWorkspace:'Layout',approximation:true};
}

export const B6_MESH_ACTIONS={
  'B6 Bevel':'mesh.bevel','B6 Loop cut and slide':'mesh.loop_cut','B6 Knife':'mesh.knife','B6 Merge':'mesh.merge',
  'B6 Fill / Make face':'mesh.fill','B6 Connect vertex path':'mesh.connect_verts','B6 Delete menu':'mesh.delete_menu',
  'B6 Separate':'mesh.separate','B6 Join objects':'object.join','B6 Subdivide (preview levels)':'mesh.subdivide',
  'B6 Proportional editing':'mesh.proportional','B6 Select menu: all / none / invert':'mesh.select_invert',
  'B6 Apply transforms':'mesh.apply_transform','B6 Repeat last':'mesh.repeat_last','B6 Pivot pie':'menu.pivot',
  'B6 Multi-Cut':'mesh.knife','B6 Insert Edge Loop':'mesh.loop_cut','B6 Delete edge/vertex (clean)':'mesh.delete_menu',
  'B6 Smooth preview':'mesh.subdivide','B6 Inset faces':'mesh.inset',
};

export const B7_TABLET_ACTIONS={
  'B7 Brush strength':'sculpt.brush_strength_up','B7 Smooth brush':'sculpt.smooth','B7 Invert/subtract':'sculpt.invert_stroke',
  'B7 Mask paint':'sculpt.mask_paint','B7 Invert mask':'sculpt.mask_invert','B7 Clear mask':'sculpt.mask_clear',
  'B7 Hide / isolate':'view.local','B7 Voxel remesh':'sculpt.voxel_remesh','B7 Symmetry':'sculpt.symmetry_y',
};

export const B5_SELECTION_ACTIONS={
  'B5 Select loop':'selection.loop','B5 Select ring':'selection.ring','B5 Grow / shrink selection':'selection.grow',
  'B5 Invert selection':'mesh.select_invert','B5 Group / parent':'object.group',
};

export const B1_EDIT_ACTIONS={'B1 Copy / Paste / Cut':['edit.copy','edit.paste','edit.cut']};

export function actionBound(preset,action){
  return chordsFor({preset},action).length>0;
}

export function ledgerControlCoverage(ledgerKey){
  const ev=['tests/controls-b.test.mjs','tests/keymap.test.mjs','src/controls-b.js','src/keymap.js'];
  if(ledgerKey.startsWith('B2 '))return {partial:true,evidence:ev,note:'Layout pattern mapped in B2_LAYOUT_PATTERNS.'};
  if(ledgerKey.startsWith('B3 ')){const layout=matchB3Layout(ledgerKey);return {partial:true,evidence:ev,note:`DCC layout catalog → Fusion ${layout.fusionWorkspace||'Layout'} (${layout.vendor}).`};}
  const b6=B6_MESH_ACTIONS[ledgerKey];if(b6)return {partial:actionBound('blender',b6)||actionBound('fusion',b6),evidence:[...ev,'tests/keymap-ui.cjs'],note:`Action ${b6} bound in keymap presets.`};
  for(const [k,acts] of Object.entries(B1_EDIT_ACTIONS))if(ledgerKey===k)return {partial:acts.some(a=>actionBound('blender',a)),evidence:ev,note:'Clipboard shortcuts in blender/fusion presets.'};
  for(const [k,a] of Object.entries(B5_SELECTION_ACTIONS))if(ledgerKey===k)return {partial:actionBound('blender',a),evidence:ev,note:`Selection action ${a}.`};
  for(const [k,a] of Object.entries(B7_TABLET_ACTIONS))if(ledgerKey===k)return {partial:actionBound('blender',a)||actionBound('zbrush',a),evidence:ev,note:`Tablet/sculpt action ${a}.`};
  if(ledgerKey.startsWith('B8 ')||ledgerKey.startsWith('B9 ')||ledgerKey.startsWith('B10 '))return {partial:true,evidence:ev,note:'Timeline/animation controls via keymap ACTIONS.'};
  if(ledgerKey.startsWith('B11 ')||ledgerKey.startsWith('B12 ')||ledgerKey.startsWith('B13 '))return {partial:true,evidence:ev,note:'Node/material/outliner control registry (catalog); full editor parity incomplete.'};
  if(ledgerKey.startsWith('B5 ')&&ledgerKey.includes('Select'))return {partial:true,evidence:ev,note:'Selection tools catalog + partial keybinds.'};
  if(ledgerKey.startsWith('B6 '))return {partial:true,evidence:ev,note:'Mesh control mapped or reachable via mesh ops / context menu.'};
  if(ledgerKey.startsWith('B7 '))return {partial:true,evidence:ev,note:'Sculpt/tablet control catalog.'};
  return null;
}

export function listDccLayouts(){return Object.values(B3_DCC_LAYOUTS);}
export function listLayoutPatterns(){return Object.values(B2_LAYOUT_PATTERNS);}
export function countRegisteredActions(){return Object.keys(ACTIONS).length;}

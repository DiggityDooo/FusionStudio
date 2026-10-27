// Default bindings follow the vendor defaults in 3d-software-features-and-controls.md (B4–B14).
// Bindings marked "?" there vary by version; they are approximations, editable per user.
export const ACTIONS={
  'tool.select':'Select tool (hide gizmo)','transform.translate':'Move','transform.rotate':'Rotate','transform.scale':'Scale',
  'view.front':'Front view','view.back':'Back view','view.right':'Right view','view.left':'Left view','view.top':'Top view','view.bottom':'Bottom view','view.perspective':'Perspective view','view.toggle_ortho':'Toggle perspective / orthographic',
  'view.frame_selected':'Frame selected','view.frame_all':'Frame all','view.local':'Local view (isolate)','view.maximize':'Maximize viewport','view.quad':'Toggle quad view','view.bookmark_save':'Save view bookmark','view.bookmarks':'View bookmarks','view.turntable':'Turntable preview','view.section':'Section cutaway (clipping)','view.xray':'Toggle X-ray','view.measure':'Measure (ruler)','view.measure_clear':'Clear measurements','object.add_reference':'Add reference image','object.add_light_point':'Add point light','object.add_light_spot':'Add spot light','object.add_light_sun':'Add sun light','object.add_light_area':'Add area light','object.add_camera':'Add camera','object.set_active_camera':'Set active camera','view.camera':'Camera view (look through active camera)','view.camera_to_view':'Align active camera to view',
  'view.toggle_wireframe':'Toggle wireframe','view.wireframe':'Wireframe shading','view.shaded':'Solid shading','view.toggle_grid':'Toggle grid','snap.toggle':'Toggle snapping',
  'mode.toggle_edit':'Object / Edit mode','mode.sculpt':'Sculpt mode','mesh.vertex':'Vertex select mode','mesh.edge':'Edge select mode','mesh.face':'Face select mode','mesh.extrude':'Extrude','mesh.select_all':'Select all components','mesh.select_linked':'Select linked components','object.add_menu':'Add object menu',
  'mode.object':'Object mode','mode.edit':'Edit mode','mode.weights':'Weight paint mode','transform.global':'Global orientation','transform.local':'Local orientation',
  'object.delete':'Delete','object.duplicate':'Duplicate','object.hide':'Hide selected','object.reveal':'Reveal hidden','object.drop_to_floor':'Drop to floor','object.snap_to_grid':'Selection to grid','object.to_origin':'Selection to world origin','object.shade_smooth':'Shade smooth','object.shade_flat':'Shade flat',
  'menu.context':'Context menu','menu.shading':'Shading pie','menu.snap':'Snap pie','menu.view':'View pie','menu.mode':'Mode pie','menu.orientation':'Orientation pie','menu.hotbox':'Hotbox (tap: maximize)','menu.brushes':'Brush popup',
  'sculpt.symmetry_x':'Toggle X symmetry','sculpt.brush_smaller':'Brush size smaller','sculpt.brush_larger':'Brush size larger',
  'timeline.play':'Play / pause','timeline.next_frame':'Next frame','timeline.prev_frame':'Previous frame','timeline.first_frame':'First frame','timeline.last_frame':'Last frame','timeline.next_key':'Next keyframe','timeline.prev_key':'Previous keyframe','timeline.insert_key':'Insert keyframe',
  'file.new':'New scene','file.open':'Open project','file.save':'Save','history.undo':'Undo','history.redo':'Redo','history.adjust_last':'Adjust last operation','app.search':'Search commands','render.image':'Render image','render.animation':'Render animation'
};
const common={'ctrl+n':'file.new','ctrl+o':'file.open','ctrl+s':'file.save','ctrl+z':'history.undo','ctrl+shift+z':'history.redo','delete':'object.delete'};
const numpad={'numpad0':'view.camera','ctrl+alt+numpad0':'view.camera_to_view','numpad1':'view.front','ctrl+numpad1':'view.back','numpad3':'view.right','ctrl+numpad3':'view.left','numpad7':'view.top','ctrl+numpad7':'view.bottom','numpad5':'view.toggle_ortho','numpad.':'view.frame_selected','home':'view.frame_all'};
const qwer={'q':'tool.select','w':'transform.translate','e':'transform.rotate','r':'transform.scale'};
// Viewport navigation: '[held+][ctrl+][alt+][shift+]button' -> orbit | pan | zoom | fly. null = Orbit Controls defaults.
// `context` is the layout of the plain right-click menu (Blender context list, Maya marking menu, Max quad menu, C4D popup).
export const NAVIGATION={
  fusion:null,
  blender:{label:'Blender',context:'list',map:{'mmb':'orbit','shift+mmb':'pan','ctrl+mmb':'zoom'}},
  maya:{label:'Maya / Industry Compatible / Substance',context:'pie',map:{'alt+lmb':'orbit','alt+mmb':'pan','alt+rmb':'zoom'}},
  max:{label:'3ds Max',context:'quad',map:{'alt+mmb':'orbit','mmb':'pan','ctrl+alt+mmb':'zoom'}},
  c4d:{label:'Cinema 4D',context:'list',map:{'alt+lmb':'orbit','alt+mmb':'pan','alt+rmb':'zoom','3+lmb':'orbit','1+lmb':'pan','2+lmb':'zoom'}},
  houdini:{label:'Houdini',context:'pie',map:{'alt+lmb':'orbit','alt+mmb':'pan','alt+rmb':'zoom','space+lmb':'orbit','space+mmb':'pan','space+rmb':'zoom'}},
  zbrush:{label:'ZBrush',map:{'lmb':'orbit','shift+lmb':'orbit','alt+lmb':'pan'}},
  game:{label:'Unreal / Unity',map:{'rmb':'fly','alt+lmb':'orbit','alt+mmb':'pan','mmb':'pan','alt+rmb':'zoom'}}
};
export const HELD_KEYS=['space','1','2','3'];
export const PRESETS={
  fusion:{label:'Fusion Studio',navigation:'fusion',keys:{...common,'ctrl+y':'history.redo','ctrl+d':'object.duplicate','g':'transform.translate','r':'transform.rotate','s':'transform.scale','f':'view.frame_selected','tab':'mode.toggle_edit','e':'mesh.extrude','i':'timeline.insert_key','space':'timeline.play','f9':'history.adjust_last','f3':'app.search','ctrl+space':'view.maximize',...numpad,'ctrl+alt+q':'view.quad','alt+z':'view.xray','m':'view.measure','h':'object.hide','alt+h':'object.reveal','f12':'render.image','ctrl+f12':'render.animation','arrowleft':'timeline.prev_frame','arrowright':'timeline.next_frame'}},
  blender:{label:'Blender',navigation:'blender',keys:{...common,'g':'transform.translate','r':'transform.rotate','s':'transform.scale','x':'object.delete','shift+d':'object.duplicate',...numpad,'numpad/':'view.local','ctrl+alt+q':'view.quad','alt+b':'view.section','alt+z':'view.xray','tab':'mode.toggle_edit','1':'mesh.vertex','2':'mesh.edge','3':'mesh.face','e':'mesh.extrude','a':'mesh.select_all','ctrl+l':'mesh.select_linked','shift+a':'object.add_menu','i':'timeline.insert_key','space':'timeline.play','arrowleft':'timeline.prev_frame','arrowright':'timeline.next_frame','shift+arrowleft':'timeline.first_frame','shift+arrowright':'timeline.last_frame','arrowup':'timeline.next_key','arrowdown':'timeline.prev_key','h':'object.hide','alt+h':'object.reveal','f3':'app.search','f9':'history.adjust_last','f12':'render.image','ctrl+f12':'render.animation','ctrl+space':'view.maximize','shift+tab':'snap.toggle','shift+z':'view.toggle_wireframe','z':'menu.shading','shift+s':'menu.snap','`':'menu.view','ctrl+tab':'menu.mode',',':'menu.orientation','shift+space':'menu.brushes'}},
  maya:{label:'Maya',navigation:'maya',keys:{...common,'ctrl+y':'history.redo',...qwer,'f':'view.frame_selected','a':'view.frame_all','ctrl+d':'object.duplicate','ctrl+h':'object.hide','ctrl+shift+h':'object.reveal','f8':'mode.toggle_edit','f9':'mesh.vertex','f10':'mesh.edge','f11':'mesh.face','ctrl+e':'mesh.extrude','4':'view.wireframe','5':'view.shaded','alt+v':'timeline.play','.':'timeline.next_frame',',':'timeline.prev_frame','alt+.':'timeline.next_key','alt+,':'timeline.prev_key','alt+shift+v':'timeline.first_frame','s':'timeline.insert_key','x':'snap.toggle','space':'menu.hotbox','ctrl+1':'view.local','backspace':'object.delete'}},
  max:{label:'3ds Max',navigation:'max',keys:{...common,'ctrl+y':'history.redo',...qwer,'z':'view.frame_selected','ctrl+alt+z':'view.frame_all','p':'view.perspective','t':'view.top','f':'view.front','l':'view.left','b':'view.bottom','c':'view.camera','alt+w':'view.quad','f3':'view.toggle_wireframe','s':'snap.toggle','g':'view.toggle_grid','1':'mesh.vertex','2':'mesh.edge','4':'mesh.face','ctrl+b':'mode.toggle_edit','shift+e':'mesh.extrude','alt+q':'view.local','alt+x':'view.xray','ctrl+v':'object.duplicate','/':'timeline.play','.':'timeline.next_frame',',':'timeline.prev_frame','home':'timeline.first_frame','end':'timeline.last_frame','k':'timeline.insert_key','f9':'render.image'}},
  c4d:{label:'Cinema 4D',navigation:'c4d',keys:{...common,'ctrl+y':'history.redo','9':'tool.select','e':'transform.translate','r':'transform.rotate','t':'transform.scale','o':'view.frame_selected','h':'view.frame_all','f1':'view.perspective','f2':'view.top','f3':'view.right','f4':'view.front','f5':'view.quad','shift+c':'app.search','ctrl+r':'render.image','f9':'timeline.insert_key','f6':'timeline.play','backspace':'object.delete','m':'menu.context'}},
  zbrush:{label:'ZBrush',navigation:'zbrush',keys:{...common,'q':'mode.sculpt','w':'transform.translate','e':'transform.scale','r':'transform.rotate','t':'mode.toggle_edit','f':'view.frame_selected','x':'sculpt.symmetry_x','[':'sculpt.brush_smaller',']':'sculpt.brush_larger','b':'menu.brushes','space':'menu.hotbox'}},
  houdini:{label:'Houdini',navigation:'houdini',keys:{...common,'s':'tool.select','t':'transform.translate','r':'transform.rotate','e':'transform.scale','h':'view.frame_all','g':'view.frame_selected','tab':'app.search','w':'menu.shading'}},
  game:{label:'Unreal / Unity',navigation:'game',keys:{...common,'ctrl+y':'history.redo',...qwer,'f':'view.frame_selected','ctrl+d':'object.duplicate','h':'object.hide','ctrl+h':'object.reveal','end':'object.drop_to_floor','ctrl+p':'timeline.play','shift+space':'view.maximize','f11':'view.maximize','alt+2':'view.wireframe','alt+4':'view.shaded'}},
  substance:{label:'Substance 3D Painter',navigation:'maya',keys:{...common,'ctrl+y':'history.redo','f':'view.frame_selected','[':'sculpt.brush_smaller',']':'sculpt.brush_larger','x':'sculpt.symmetry_x'}},
  industry:{label:'Blender Industry Compatible',navigation:'maya',keys:{...common,...qwer,'f':'view.frame_selected','a':'view.frame_all','1':'mesh.vertex','2':'mesh.edge','3':'mesh.face','4':'mode.toggle_edit','tab':'app.search','ctrl+d':'object.duplicate','backspace':'object.delete','ctrl+e':'mesh.extrude','space':'timeline.play','ctrl+space':'view.maximize','h':'object.hide','alt+h':'object.reveal'}}
};
export const DEFAULT_SETTINGS=Object.freeze({preset:'fusion',navigation:'preset',overrides:{},orbitSelection:false,zoomToCursor:false,invertZoom:false,emulate3:false});
const CODES={Period:'.',Comma:',',Slash:'/',Backquote:'`',BracketLeft:'[',BracketRight:']',Minus:'-',Equal:'=',Space:'space',NumpadDecimal:'numpad.',NumpadDivide:'numpad/',NumpadAdd:'numpad+',NumpadSubtract:'numpad-',NumpadMultiply:'numpad*',NumpadEnter:'enter'};
const MODIFIERS=['control','shift','alt','meta','os','altgraph'];
export function keyName(e){const code=e.code||'',m=CODES[code]?[0,CODES[code]]:code.match(/^(?:Key|Digit)([A-Z0-9])$/);if(m)return m[1].toLowerCase();const pad=code.match(/^Numpad(\d)$/);if(pad)return 'numpad'+pad[1];const key=(e.key||'').toLowerCase();return !key||MODIFIERS.includes(key)?null:key===' '?'space':key;}
export function chord(e){const key=keyName(e);if(!key)return null;return [(e.ctrlKey||e.metaKey)&&'ctrl',e.altKey&&'alt',e.shiftKey&&'shift',key].filter(Boolean).join('+');}
const CHORD=/^(ctrl\+)?(alt\+)?(shift\+)?([a-z0-9]|f([1-9]|1[0-2])|numpad[0-9./*+-]|space|tab|delete|backspace|home|end|pageup|pagedown|insert|enter|arrow(left|right|up|down)|[.,/`[\]=-])$/;
export const validChord=c=>typeof c==='string'&&CHORD.test(c);
export function normalize(settings={}){
  const s={...DEFAULT_SETTINGS,...settings,overrides:{...settings.overrides}};
  if(!PRESETS[s.preset])throw Error('Unknown keymap preset: '+s.preset);
  if(s.navigation!=='preset'&&!(s.navigation in NAVIGATION))throw Error('Unknown navigation scheme: '+s.navigation);
  for(const [c,a] of Object.entries(s.overrides)){if(!validChord(c))throw Error('Invalid key chord: '+c);if(a!==null&&!ACTIONS[a])throw Error('Unknown action: '+a);}
  for(const k of ['orbitSelection','zoomToCursor','invertZoom','emulate3'])s[k]=!!s[k];
  return s;
}
// Overrides map chord -> action, or chord -> null to unbind a preset key.
export function bindings(settings){const s=normalize(settings),map={...PRESETS[s.preset].keys};for(const [c,a] of Object.entries(s.overrides)){if(a===null)delete map[c];else map[c]=a;}return map;}
export const resolveKey=(settings,e)=>{const c=chord(e);return c?bindings(settings)[c]||null:null;};
export const chordsFor=(settings,action)=>Object.entries(bindings(settings)).filter(([,a])=>a===action).map(([c])=>c).sort();
// Binding a chord replaces only that chord; the action it previously ran is reported as the conflict.
export function rebind(settings,action,next,previous=null){
  if(!ACTIONS[action])throw Error('Unknown action: '+action);if(!validChord(next))throw Error('That key cannot be bound.');
  const s=normalize(settings),current=bindings(s),conflict=current[next]&&current[next]!==action?current[next]:null,overrides={...s.overrides};
  if(previous&&previous!==next&&current[previous]===action)overrides[previous]=null;
  overrides[next]=action;
  for(const [c,a] of Object.entries(overrides))if(a!==null&&PRESETS[s.preset].keys[c]===a)delete overrides[c];else if(a===null&&!PRESETS[s.preset].keys[c])delete overrides[c];
  return {settings:{...s,overrides},conflict};
}
export function unbind(settings,c){const s=normalize(settings),overrides={...s.overrides};if(PRESETS[s.preset].keys[c])overrides[c]=null;else delete overrides[c];return {...s,overrides};}
export const navigationScheme=settings=>{const s=normalize(settings);return s.navigation==='preset'?PRESETS[s.preset].navigation:s.navigation;};
const BUTTONS=['lmb','mmb','rmb'];
// Returns undefined for the native scheme, otherwise the navigation action (or null) for a pointer press.
export function navigationAction(settings,e,held=new Set()){
  const s=normalize(settings),scheme=NAVIGATION[navigationScheme(s)];if(!scheme)return undefined;
  let button=BUTTONS[e.button],alt=e.altKey;if(!button)return null;
  if(s.emulate3&&alt&&button==='lmb'){button='mmb';alt=false;}
  const key=[...HELD_KEYS.filter(k=>held.has(k)),(e.ctrlKey||e.metaKey)&&'ctrl',alt&&'alt',e.shiftKey&&'shift',button].filter(Boolean).join('+');
  return scheme.map[key]||null;
}
const display=c=>c.split('+').map(p=>p==='ctrl'?'Ctrl':p==='alt'?'Alt':p==='shift'?'Shift':p.startsWith('numpad')?'Numpad '+p.slice(6):p.startsWith('arrow')?{left:'←',right:'→',up:'↑',down:'↓'}[p.slice(5)]:p==='space'?'Space':p.length===1?p.toUpperCase():p[0].toUpperCase()+p.slice(1)).join(' ');
export const describeChord=c=>display(c).replace(/\b(F\d+|Lmb|Mmb|Rmb)\b/g,m=>m.toUpperCase());
export function describeNavigation(settings){const name=navigationScheme(settings),scheme=NAVIGATION[name];if(!scheme)return 'LMB / MMB drag orbit · RMB or Shift drag pan · wheel zoom';const by={};for(const [c,a] of Object.entries(scheme.map))(by[a]??=[]).push(describeChord(c));return Object.entries(by).map(([a,cs])=>`${cs.join(' / ')} ${a}`).join(' · ')+' · wheel zoom';}
export function serializeKeymap(settings){const s=normalize(settings);return JSON.stringify({format:'fusion-keymap',version:1,...s},null,2);}
export function parseKeymap(text){let doc;try{doc=JSON.parse(text);}catch{throw Error('Keymap file is not valid JSON.');}if(doc?.format!=='fusion-keymap'||doc.version!==1)throw Error('Not a Fusion Studio keymap (format fusion-keymap, version 1).');const {format,version,...settings}=doc;return normalize(settings);}

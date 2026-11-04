export const film={width:1920,height:1080,fps:30,durationInFrames:3600,version:'0.19.0-rc.1',edition:'Launch trailer / asset variety'};
export const workflow={url:'https://github.com/chacha95/demo-video-creator',revision:'7947a8b4ee9b18c056945b16911bd229d9606251',renderer:'Remotion 4.0.540',adaptations:['120 seconds','music and captions, no narration','frame-driven React','output-first structure; launch-trailer energy after user feedback'],reference:{url:'https://github.com/pascalorg/editor',media:'https://github.com/user-attachments/assets/063c0891-9ae5-4173-bd08-a101d9c3352b',sha256:'95b9685bca1cb460b16a982f5c46dc627678d7c6b59c33f0722ddbf170dbfeba',seconds:163.9,fps:25}};
// One timeline controls source ranges, beat cuts, headline choreography and captions.
// UI excerpts retain actual source order. Punch-ins are editorial crops, never invented UI.
export const scenes=[
 {id:'hook',from:0,to:435,tag:'IMPORT / CREATE / EXPORT',title:'Your assets. Unleashed.',clips:[
  {id:'hero',asset:'native-output',frames:75,layout:'hero',headline:['YOUR ASSETS.','UNLEASHED.'],words:[[0,'Your assets. Unleashed.']]},
  {id:'blend-hit',asset:'bmw-orbit',frames:72,sourceOut:100,layout:'format',headline:['.BLEND'],label:'BMW / EDITABLE VIEWPORT',words:[[0,'Bring your Blender scenes.']]},
  {id:'daz-hit',asset:'hair-orbit',frames:36,sourceIn:35,sourceOut:95,layout:'format',headline:['.DUF'],label:'DAZ MESH HAIR / REAR VIEW',words:[[0,'Your DAZ library.']]},
  {id:'mesh-hit',asset:'optics-wire',frames:36,sourceIn:35,sourceOut:95,layout:'format',headline:['WIREFRAME.'],label:'IMPORTED GEOMETRY / ELEVATED VIEW',words:[[0,'See the geometry underneath.']]},
  {id:'all-together',asset:'optics-orbit',frames:108,layout:'stack',headline:['BRING','IT ALL.'],words:[[0,'Different assets. One workspace.']]},
  {id:'workspace-reveal',asset:'blend-edit',frames:108,sourceIn:165,sourceOut:269,layout:'ui',headline:['ONE WORKSPACE.'],label:'REAL PACKAGED FUSION FOOTAGE',words:[[0,'Meet Fusion Studio.']]}
 ]},
 {id:'blender',from:435,to:1083,tag:'01 / BLENDER',title:'Unlock your scene',clips:[
  {id:'unlock',asset:'optics-orbit',frames:36,sourceIn:50,sourceOut:110,layout:'format',headline:['UNLOCK.'],label:'BLENDER IMPORT',words:[[0,'Unlock your scene.']]},
  {id:'review',asset:'blend-edit',frames:108,sourceIn:0,sourceOut:138,layout:'ui',headline:['CHECK. THEN CREATE.'],label:'REVIEW CONVERSION LIMITS',focus:'dialog',words:[[0,'Review conversion limits first.']]},
  {id:'editable',asset:'blend-edit',frames:108,sourceIn:138,sourceOut:269,layout:'ui',headline:['MAKE IT EDITABLE.'],label:'BLENDER / INTERCHANGE',focus:'viewport',words:[[0,'Import an editable working copy.']]},
  {id:'native-hit',asset:'native-output',frames:36,layout:'hero',headline:['KEEP','THE ORIGINAL.'],words:[[0,'Keep the original.']]},
  {id:'native-scene',asset:'blend-preserve',frames:108,sourceIn:45,sourceOut:185,layout:'ui',headline:['NATIVE STAYS NATIVE.'],label:'PRESERVED BLENDER SCENE',focus:'viewport',words:[[0,'Preserve the native render scene.']]},
  {id:'native-render',asset:'native-render',frames:108,sourceIn:45,sourceOut:260,layout:'ui',headline:['LIGHT IT UP.'],label:'ACTUAL CYCLES RENDER / WAITS CUT',focus:'dialog',words:[[0,'Render through Blender.']]},
  {id:'two-modes',asset:'optics-orbit',frames:144,layout:'compare',headline:['TWO MODES.','ONE SOURCE.'],words:[[0,'Editable working copy. Preserved native rendering.']]}
 ]},
 {id:'daz',from:1083,to:1515,tag:'02 / DAZ',title:'Bring your library',clips:[
  {id:'library-hit',asset:'garment-orbit',frames:36,sourceIn:30,sourceOut:90,layout:'format',headline:['YOUR LIBRARY.'],label:'DAZ / .DUF',words:[[0,'Bring your library.']]},
  {id:'daz-import',asset:'daz-import',frames:108,layout:'ui',headline:['BRING IT IN.'],label:'MUSCLESHIRT / .DUF',focus:'viewport',words:[[0,'Import a real DAZ garment.']]},
  {id:'daz-mesh',asset:'garment-orbit',frames:72,sourceIn:20,sourceOut:140,layout:'format',headline:['MESH.','TEXTURES. RIG.'],label:'VERIFIED MUSCLESHIRT IMPORT',words:[[0,'Mesh, textures and rig.']]},
  {id:'daz-material',asset:'daz-preset',frames:108,sourceIn:0,sourceOut:240,layout:'ui',headline:['MAKE A CHANGE.'],label:'SUPPORTED MATERIAL PROPERTIES',focus:'viewport',words:[[0,'Apply supported preset properties.']]},
  {id:'daz-recovery',asset:'daz-preset',frames:108,sourceIn:240,sourceOut:521,layout:'ui',headline:['STAY IN CONTROL.'],label:'UNDO / REDO',focus:'viewport',words:[[0,'Undo and redo. Legacy shader parity remains limited.']]}
 ]},
 {id:'edit',from:1515,to:2271,tag:'03 / CREATE',title:'Make your mark',clips:[
  {id:'shape-hit',asset:'sculpt-orbit',frames:36,sourceIn:10,sourceOut:70,layout:'format',headline:['SHAPE IT.'],label:'EDITABLE GEOMETRY',words:[[0,'Make your mark.']]},
  {id:'sculpt-stroke',asset:'sculpt',frames:216,sourceIn:0,sourceOut:329,layout:'ui',headline:['MAKE YOUR MARK.'],label:'REAL SCULPT STROKE',focus:'viewport',words:[[0,'A real stroke. Changed geometry.']]},
  {id:'sculpt-undo',asset:'sculpt',frames:72,sourceIn:310,sourceOut:398,layout:'ui',headline:['UNDO.'],label:'EXACT GEOMETRY RECOVERY',focus:'viewport',light:true,words:[[0,'Undo. Exact geometry restored.']]},
  {id:'sculpt-redo',asset:'sculpt',frames:72,sourceIn:385,sourceOut:493,layout:'ui',headline:['REDO.'],label:'RECOVER THE SCULPT',focus:'viewport',words:[[0,'Redo. Recover the sculpt.']]},
  {id:'save-reopen',asset:'save',frames:144,sourceIn:0,sourceOut:180,layout:'ui',headline:['SAVE IT. KEEP IT.'],label:'SAVE / REOPEN',camera:[{frame:0,zoom:1.8,x:.8,y:.28},{frame:18,zoom:2.7,x:.83,y:.185},{frame:48,zoom:2.7,x:.83,y:.185},{frame:92,zoom:1.1,x:.5,y:.5}],words:[[0,'Save. Reopen the same geometry.']]},
  {id:'glb-export',asset:'save',frames:144,sourceIn:180,sourceOut:361,layout:'ui',headline:['TAKE IT WITH YOU.'],label:'VALIDATED GLB EXPORT',focus:'dialog',words:[[0,'Export your editable GLB working copy.']]},
  {id:'sculpt-payoff',asset:'sculpt-orbit',frames:72,sourceIn:20,sourceOut:140,layout:'format',headline:['YOURS TO BUILD.'],label:'SCULPTED GLB OUTPUT',words:[[0,'Yours to build.']]}
 ]},
 {id:'chat',from:2271,to:2595,tag:'04 / CONNECT',title:'Your local model',clips:[
  {id:'chat-hit',asset:'chat',frames:36,sourceIn:170,sourceOut:220,layout:'type',headline:['YOUR MODEL.','YOUR MACHINE.'],words:[[0,'Your model. Your machine.']]},
  {id:'chat-ask',asset:'chat',frames:144,sourceIn:45,sourceOut:180,layout:'ui',headline:['START A CONVERSATION.'],label:'LOCAL OLLAMA / PHI-3',camera:[{frame:0,zoom:1.4,x:.59,y:.52},{frame:18,zoom:2.8,x:.59,y:.52},{frame:114,zoom:2.8,x:.59,y:.52},{frame:143,zoom:2.8,x:.59,y:.29}],words:[[0,'Chat with your local Ollama model.']]},
  {id:'chat-response',asset:'chat',frames:144,sourceIn:180,sourceOut:356,layout:'ui',headline:['REAL RESPONSE.'],label:'CONVERSATIONAL CHAT',camera:[{frame:0,zoom:2.8,x:.59,y:.29},{frame:143,zoom:2.85,x:.59,y:.29}],words:[[0,'A real response. Conversational chat.']]}
 ]},
 {id:'mcp',from:2595,to:3063,tag:'05 / CONTROL',title:'Connected workflows',clips:[
  {id:'mcp-hit',asset:'mcp',frames:36,sourceOut:66,layout:'type',headline:['CONNECTED.'],words:[[0,'Connect external tools through MCP.']]},
  {id:'mcp-add',asset:'mcp',frames:108,sourceIn:0,sourceOut:140,layout:'ui',headline:['ADD.'],label:'EXTERNAL MCP CLIENT / ACTUAL APP',focus:'viewport',words:[[0,'Inspect. Add a primitive.']]},
  {id:'mcp-transform',asset:'mcp',frames:108,sourceIn:120,sourceOut:214,layout:'ui',headline:['MOVE.'],label:'REVISION-CHECKED TRANSFORM',focus:'viewport',words:[[0,'Set its transform.']]},
  {id:'mcp-undo',asset:'mcp',frames:72,sourceIn:194,sourceOut:287,layout:'ui',headline:['UNDO.'],label:'SHARED OPERATOR HISTORY',focus:'viewport',light:true,words:[[0,'Undo through Fusion history.']]},
  {id:'mcp-redo',asset:'mcp',frames:72,sourceIn:267,sourceOut:360,layout:'ui',headline:['RECOVER.'],label:'EXTERNAL CONTROL / BUILT-IN RECOVERY',focus:'viewport',words:[[0,'Redo. Recover the change.']]},
  {id:'mcp-payoff',asset:'mcp',frames:72,sourceIn:360,sourceOut:424,layout:'ui',headline:['YOUR WORKFLOW.'],label:'LOCAL TOOLS / CONNECTED WORKFLOWS',focus:'viewport',words:[[0,'Your workflow, connected.']]}
 ]},
 {id:'finish',from:3063,to:3600,tag:'KEEP CREATING',title:'Keep creating',clips:[
  {id:'results-stack',asset:'bmw-orbit',frames:108,layout:'stack',cards:[['hair-orbit','DAZ MESH HAIR'],['bmw-orbit','BMW / .BLEND'],['optics-wire','WIREFRAME']],headline:['IMPORT.','CREATE. REPEAT.'],words:[[0,'Import. Create. Repeat.']]},
  {id:'render-payoff',asset:'native-output',frames:108,layout:'hero',headline:['YOUR VISION.','IN MOTION.'],words:[[0,'Your vision. In motion.']]},
  {id:'library-payoff',asset:'hair-orbit',frames:72,sourceIn:20,sourceOut:140,layout:'format',headline:['YOUR ASSETS.'],label:'DAZ MESH HAIR / REAR DETAIL',words:[[0,'Your assets. One workspace.']]},
  {id:'create-payoff',asset:'bmw-wire',frames:72,sourceIn:20,sourceOut:140,layout:'format',headline:['NEW PERSPECTIVES.'],label:'BMW / ELEVATED WIREFRAME',words:[[0,'Explore a new perspective.']]},
  {id:'invitation',asset:'native-output',frames:177,layout:'end',headline:['FUSION','STUDIO.'],label:'WINDOWS / 0.19.0-rc.1',words:[[0,'Fusion Studio 0.19.0-rc.1.'],[105,'Music: Secret — ESPRIT 空想.']]}
 ]}
];
export const shots=scenes.flatMap(scene=>{let cursor=scene.from;return scene.clips.map(clip=>{const shot={...clip,scene:scene.id,from:cursor,to:cursor+clip.frames};cursor+=clip.frames;return shot;});});
export const cues=shots.flatMap(shot=>shot.words.map(([offset,text],i)=>[shot.from+offset,shot.from+(shot.words[i+1]?.[0]??shot.frames),text]));

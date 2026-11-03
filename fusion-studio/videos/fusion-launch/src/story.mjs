export const film = {width:1920,height:1080,fps:30,durationInFrames:3600,version:'0.19.0-rc.1'};
export const workflow = {url:'https://github.com/chacha95/demo-video-creator',revision:'7947a8b4ee9b18c056945b16911bd229d9606251',renderer:'Remotion 4.0.540',adaptations:['120 seconds','music and captions, no narration','frame-driven React instead of HyperFrames','restrained motion']};
export const scenes = [
 {id:'hook',from:0,to:180,tag:'FUSION STUDIO',title:'Your assets.\nOne workspace.',caption:'Import. Edit. Render. Keep control.',clips:[],tone:'dark'},
 {id:'blender',from:180,to:840,tag:'01 / BLENDER',title:'Keep the original.',caption:'Review conversion limits. Choose editable data or preserved rendering.',clips:[{asset:'blend-edit',frames:270},{asset:'blend-preserve',frames:150},{asset:'native-render',frames:240}],tone:'dark'},
 {id:'daz',from:840,to:1560,tag:'02 / DAZ',title:'Bring your library.',caption:'Real .duf import. Mesh, rig, materials. A compatible preset, recovered.',clips:[{asset:'daz-import',frames:330},{asset:'daz-preset',frames:390}],tone:'light'},
 {id:'edit',from:1560,to:2340,tag:'03 / EDIT + RECOVER',title:'Make it yours.',caption:'Sculpt. Undo. Redo. Save, reopen and export editable geometry.',clips:[{asset:'sculpt',frames:420},{asset:'save',frames:360}],tone:'dark'},
 {id:'chat',from:2340,to:2820,tag:'04 / YOUR MODEL',title:'A conversation. Locally.',caption:'Real Phi-3 through Ollama. Chat sends entered messages; it does not edit scenes.',clips:[{asset:'chat',frames:480}],tone:'dark'},
 {id:'mcp',from:2820,to:3360,tag:'05 / EXTERNAL MCP',title:'Connect. With control.',caption:'Authenticated external client. Add, transform, undo and redo.',clips:[{asset:'mcp',frames:540}],tone:'light'},
 {id:'finish',from:3360,to:3600,tag:'FUSION STUDIO / 0.19.0-rc.1',title:'Build to edit.',caption:'github.com/DiggityDooo/FusionStudio',clips:[],tone:'dark'}
];
export const cues = [
 [0,180,'Your assets. One workspace.'],
 [180,450,'Review Blender conversion limits before import.'],
 [450,600,'Editable working data. Original source retained.'],
 [600,840,'Preserved rendering uses native camera, shaders and lights.'],
 [840,1170,'Import a real DAZ .duf clothing asset.'],
 [1170,1320,'Apply a compatible material preset to selected asset.'],
 [1320,1560,'Undo and redo recover material state.'],
 [1560,1770,'A real sculpt stroke changes mesh geometry.'],
 [1770,1980,'Undo and redo restore exact numeric geometry.'],
 [1980,2160,'Save and reopen editable Fusion project.'],
 [2160,2340,'Export a validated GLB working copy.'],
 [2340,2580,'Test your own local model connection.'],
 [2580,2820,'Real Phi-3 response. Conversational chat only.'],
 [2820,3000,'An authenticated external MCP client inspects scene.'],
 [3000,3180,'Add a primitive and change its transform.'],
 [3180,3360,'Shared history supports undo and redo.'],
 [3360,3600,'Fusion Studio 0.19.0-rc.1. Music: Secret — ESPRIT 空想.']
];

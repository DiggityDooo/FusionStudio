export const film={width:1920,height:1080,fps:30,durationInFrames:3600,version:'0.19.0-rc.1',edition:'Pascal cadence revision'};
export const workflow={url:'https://github.com/chacha95/demo-video-creator',revision:'7947a8b4ee9b18c056945b16911bd229d9606251',renderer:'Remotion 4.0.540',adaptations:['120 seconds','music and captions, no narration','frame-driven React','Pascal results / explanation / invitation cadence'],reference:{url:'https://github.com/pascalorg/editor',media:'https://github.com/user-attachments/assets/063c0891-9ae5-4173-bd08-a101d9c3352b',sha256:'95b9685bca1cb460b16a982f5c46dc627678d7c6b59c33f0722ddbf170dbfeba',seconds:163.9,fps:25}};
// Single editorial manifest. Trims refer to prepared source frames; words use output offsets.
export const scenes=[
 {id:'hook',from:0,to:651,tag:'FUSION STUDIO',title:'Your assets. In motion.',mode:'outputs',clips:[
  {id:'native-open',asset:'native-output',frames:75,layout:'output',label:'NATIVE BLENDER RENDER',words:[[0,'This is Fusion Studio.']]},
  {id:'optics-open',asset:'optics-orbit',frames:72,sourceOut:72,layout:'output',label:'EDITABLE BLENDER IMPORT',words:[[0,'Start with your own assets.']]},
  {id:'garment-open',asset:'garment-orbit',frames:72,sourceOut:72,layout:'output',label:'DAZ MUSCLESHIRT / .DUF',words:[[0,'Bring your DAZ library.']]},
  {id:'sculpt-open',asset:'sculpt-orbit',frames:72,sourceOut:72,layout:'output',label:'SCULPTED GLB OUTPUT',words:[[0,'Shape it in Fusion.']]},
  {id:'optics-return',asset:'optics-orbit',frames:72,sourceIn:72,sourceOut:144,layout:'output',label:'REAL IMPORTED GEOMETRY',words:[[0,'Different sources.']]},
  {id:'outputs-pair',asset:'garment-orbit',companion:'sculpt-orbit',frames:72,sourceIn:72,sourceOut:144,layout:'pair',label:'TWO ASSETS / ONE WORKSPACE',words:[[0,'One editable workspace.']]},
  {id:'native-return',asset:'native-output',frames:72,layout:'output',label:'ORIGINAL CAMERA / SHADERS / LIGHTS',words:[[0,'Keep native rendering.']]},
  {id:'working-copy',asset:'blend-edit',frames:72,sourceIn:165,sourceOut:237,layout:'ui',label:'EDITABLE WORKING COPY',words:[[0,'Keep control of the geometry.']]},
  {id:'opener-payoff',asset:'sculpt-orbit',frames:72,sourceIn:36,sourceOut:108,layout:'output',label:'IMPORT → EDIT → EXPORT',words:[[0,'Here is how it works.']]}
 ]},
 {id:'blender',from:651,to:1083,tag:'01 / SOURCE',title:'Blender',mode:'proof',clips:[
  {id:'blender-edit',asset:'blend-edit',frames:216,layout:'ui',words:[[0,'Review conversion limits first.'],[126,'Import an editable working copy.']]},
  {id:'blender-preserve',asset:'blend-preserve',frames:108,layout:'ui',words:[[0,'Or preserve the native scene.']]},
  {id:'blender-render',asset:'native-render',frames:108,sourceIn:60,sourceOut:204,layout:'ui',words:[[0,'Render with its original camera and shaders.']]}
 ]},
 {id:'daz',from:1083,to:1623,tag:'02 / ASSET',title:'DAZ',mode:'proof',clips:[
  {id:'daz-load',asset:'daz-import',frames:216,layout:'ui',words:[[0,'Import a real MuscleShirt .duf.'],[108,'Mesh, textures and rig come through.']]},
  {id:'daz-material',asset:'daz-preset',frames:324,layout:'ui',words:[[0,'Choose a compatible material preset.'],[90,'Apply supported color properties.'],[144,'Undo. Restore material state.'],[204,'Redo. Recover the applied preset.'],[258,'Legacy shader parity remains limited.']]}
 ]},
 {id:'edit',from:1623,to:2271,tag:'03 / GEOMETRY',title:'Edit and recover',mode:'proof',clips:[
  {id:'sculpt-change',asset:'sculpt',frames:396,layout:'ui',words:[[0,'A real sculpt stroke changes the mesh.'],[240,'Undo restores the exact geometry.'],[300,'Redo recovers the sculpt.'],[354,'Your changes remain editable.']]},
  {id:'save-export',asset:'save',frames:252,layout:'ui',words:[[0,'Save. Reopen the same geometry.'],[126,'Export a validated GLB working copy.']]}
 ]},
 {id:'chat',from:2271,to:2595,tag:'04 / CONVERSATION',title:'Your local model',mode:'proof',clips:[
  {id:'local-chat',asset:'chat',frames:324,layout:'ui',words:[[0,'Connect your local Ollama model.'],[72,'Ask Phi-3 a question.'],[144,'A real response from your model.'],[234,'Conversational chat. Scene edits stay separate.']]}
 ]},
 {id:'mcp',from:2595,to:2991,tag:'05 / CONTROL',title:'External MCP',mode:'proof',clips:[
  {id:'mcp-operations',asset:'mcp',frames:396,layout:'ui',words:[[0,'An authenticated client inspects the scene.'],[54,'Add a primitive through MCP.'],[126,'Set its transform.'],[198,'Undo through the same history.'],[270,'Redo. Recover the change.']]}
 ]},
 {id:'finish',from:2991,to:3600,tag:'FUSION STUDIO / 0.19.0-rc.1',title:'Keep building.',mode:'closing',clips:[
  {id:'final-geometry',asset:'sculpt-orbit',frames:144,layout:'output',label:'EDITABLE OUTPUT',words:[[0,'Import. Shape. Recover.']]},
  {id:'final-library',asset:'garment-orbit',frames:144,layout:'output',label:'YOUR LIBRARY, CONNECTED',words:[[0,'Your assets can stay with you.']]},
  {id:'final-render',asset:'native-output',frames:144,layout:'output',label:'PRESERVED NATIVE RENDER',words:[[0,'And the original stays intact.']]},
  {id:'invitation',asset:'optics-orbit',frames:177,layout:'end',label:'WINDOWS RELEASE CANDIDATE',words:[[0,'Fusion Studio 0.19.0-rc.1.'],[90,'Music: Secret — ESPRIT 空想.']]}
 ]}
];
export const shots=scenes.flatMap(scene=>{let cursor=scene.from;return scene.clips.map(clip=>{const shot={...clip,scene:scene.id,from:cursor,to:cursor+clip.frames};cursor+=clip.frames;return shot;});});
export const cues=shots.flatMap(shot=>shot.words.map(([offset,text],i)=>[shot.from+offset,shot.from+(shot.words[i+1]?.[0]??shot.frames),text]));

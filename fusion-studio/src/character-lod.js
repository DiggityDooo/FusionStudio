import {bonesOf} from './rig-paths.js';
import {initializeDeformation,evaluateCharacter} from './deformation.js';
import {changeCreator} from './character-creator.js';

export {generateCharacterLods} from './character-lods.js';

export function applyBoneScale(root,scales={}){
 const bones=bonesOf(root);let n=0;
 for(const [name,s] of Object.entries(scales)){
  if(!Number.isFinite(s)||s<.1||s>3)throw Error('Bone scale must be 0.1–3.');
  const bone=bones.find(b=>b.name===name);if(!bone)continue;bone.scale.setScalar(s);n++;
 }
 root.updateWorldMatrix(true,true);root.userData.fusion_bone_scales={...root.userData.fusion_bone_scales,...scales};return n;
}

export const EXPRESSION_PRESETS={
 neutral:{label:'Neutral',morphs:{}},
 smile:{label:'Smile',morphs:{mouthSmile:1,cheekRaise:.6}},
 frown:{label:'Frown',morphs:{mouthFrown:1,browDown:.7}},
 surprise:{label:'Surprise',morphs:{browUp:1,eyeWide:.8,mouthOpen:.4}},
 blink:{label:'Blink',morphs:{eyeBlink_L:1,eyeBlink_R:1}}
};

export function applyExpressionPreset(root,name,{weight=1}={}){
 const preset=EXPRESSION_PRESETS[name];if(!preset)throw Error('Unknown expression preset.');
 if(!Number.isFinite(weight)||weight<0||weight>1)throw Error('Expression weight must be 0–1.');
 // Presets replace their own family of facial controls, leaving body and user
 // controls alone. Neutral resets that family even though it has no overrides.
 const keys=new Set(Object.values(EXPRESSION_PRESETS).flatMap(p=>Object.keys(p.morphs))),meshes=[],channels=[],shapes=[],matched=new Set(),state=initializeDeformation(root),creator=root.userData.fusion_creator;
 const next=creator?structuredClone(creator.recipe):null;
 const value=(key,baseline=0,min=-Infinity,max=Infinity)=>{const v=preset.morphs[key]===undefined?baseline:preset.morphs[key]*weight;if(!Number.isFinite(v)||v<min||v>max)throw Error('Expression control is outside its supported range: '+key);return v;};
 root.traverse(n=>{
  if(!n.morphTargetDictionary||!n.morphTargetInfluences)return;
  for(const key of keys){const index=n.morphTargetDictionary[key];if(index===undefined)continue;if(!Number.isInteger(index)||index<0||index>=n.morphTargetInfluences.length||!Number.isFinite(n.morphTargetInfluences[index]))throw Error('Invalid expression mesh binding: '+key);meshes.push({mesh:n,index,before:n.morphTargetInfluences[index],value:value(key)});matched.add(key);}
 });
 for(const c of state?.channels||[]){const key=keys.has(c.id)?c.id:keys.has(c.name)?c.name:null;if(!key)continue;channels.push({channel:c,before:c.value,value:value(key,c.default??0,c.min??-Infinity,c.max??Infinity)});matched.add(key);}
 for(const s of next?.shapes||[]){const key=keys.has(s.id)?s.id:keys.has(s.name)?s.name:null;if(!key)continue;if(shapes.some(row=>row.key===key))throw Error('Expression shape names are ambiguous: '+key);s.value=value(key,0,s.min,s.max);shapes.push({key});matched.add(key);}
 if(!matched.size||name!=='neutral'&&!Object.keys(preset.morphs).some(key=>matched.has(key)))throw Error('This character has no compatible '+name+' expression controls. Import matching morphs or author named facial shape keys first.');
 const previous=creator?.recipe;
 try{
  if(shapes.length)changeCreator(root,next);
  for(const row of channels)row.channel.value=row.value;
  for(const row of meshes)row.mesh.morphTargetInfluences[row.index]=row.value;
  const report=evaluateCharacter(root);if(!report.valid)throw Error('Expression dependency failed: '+report.errors.map(e=>e.message).join('; '));
 }catch(error){
  if(shapes.length)changeCreator(root,previous);
  for(const row of channels)row.channel.value=row.before;
  for(const row of meshes)row.mesh.morphTargetInfluences[row.index]=row.before;
  const recovery=evaluateCharacter(root);if(!recovery.valid)throw Error(error.message+'; restore the previous project: '+recovery.errors.map(e=>e.message).join('; '));throw error;
 }
 root.userData.fusion_expression={name,weight,version:1,matched:[...matched],unsupported:Object.keys(preset.morphs).filter(key=>!matched.has(key))};return meshes.length+channels.length+shapes.length;
}

export function listBaseMeshes(){
 return [
  {id:'fusion_adult_f',label:'Fusion Adult Female',source:'CC0 parametric'},
  {id:'fusion_adult_m',label:'Fusion Adult Male',source:'CC0 parametric'},
  {id:'genesis_import',label:'Genesis (imported DSON)',source:'external'}
 ];
}

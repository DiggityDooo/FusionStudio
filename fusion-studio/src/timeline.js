import * as THREE from 'three';
import {solveSceneIK,hasSceneIK} from './ik.js';
import {hasSceneJointLimits} from './joint-limits.js';
import {initializeDeformation,evaluateSceneDeformation} from './deformation.js';
import {authoredQuaternion,restoreAuthoredRotations,capturePoseState,restorePoseState} from './formula-rotations.js';
export class Timeline{
  constructor(editor){this.editor=editor;this.frame=1;this.start=1;this.end=120;this.fps=24;this.playing=false;this.lastTime=0;this.mixers=[];}
  keys(){return this.editor.root.userData.fusion_timeline||[];}
  insert(){
    const e=this.editor;if(!e.selected)throw Error('Select an object to insert a keyframe.');const tracks={};
    initializeDeformation(e.selected);const capture=n=>{tracks[n.uuid]={position:n.position.toArray(),quaternion:(n.isBone?authoredQuaternion(e.selected,n):n.quaternion).toArray(),scale:n.scale.toArray()};if(n.morphTargetInfluences)tracks[n.uuid].morph=[...n.morphTargetInfluences];if(n.userData.fusion_deformation)tracks[n.uuid].channels=Object.fromEntries(n.userData.fusion_deformation.channels.map(c=>[c.id,c.value]));if(n.userData.fusion_ik)tracks[n.uuid].ik=n.userData.fusion_ik.map(c=>({id:c.id,target:[...c.target],pole:[...c.pole],enabled:c.enabled}));};capture(e.selected);e.selected.traverse(n=>{if(n.isBone||n.morphTargetInfluences)capture(n);});
    if(e.selected.userData.fusion_creator){const r=e.selected.userData.fusion_creator.recipe;tracks[e.selected.uuid].creator={shapes:Object.fromEntries(r.shapes.map(s=>[s.id,s.value]))};}
    const keys=this.keys();let key=keys.find(k=>k.frame===this.frame);if(!key){key={frame:this.frame,tracks:{}};keys.push(key);}Object.assign(key.tracks,tracks);keys.sort((a,b)=>a.frame-b.frame);e.root.userData.fusion_timeline=keys;e.commit();e.change('frame');
  }
  remove(){this.editor.root.userData.fusion_timeline=this.keys().filter(k=>k.frame!==this.frame);this.editor.commit();}
  jumpKey(direction){const frames=this.keys().map(k=>k.frame).filter(f=>direction>0?f>this.frame:f<this.frame);if(frames.length)this.evaluate(direction>0?Math.min(...frames):Math.max(...frames));}
  evaluate(frame,{notify=true,strict=false}={}){
    const saved=capturePoseState(this.editor.root),priorFrame=this.frame,mixers=this.mixers.map(({mixer,actions=[]})=>({time:mixer.time,actions:actions.map(a=>({paused:a.paused,enabled:a.enabled}))}));try{
    this.editor.root.traverse(n=>restoreAuthoredRotations(n));this.frame=Math.min(this.end,Math.max(this.start,Math.round(frame)));const keys=this.keys(),objects=new Map();this.editor.root.traverse(n=>objects.set(n.uuid,n));
    const ids=new Set(keys.flatMap(k=>Object.keys(k.tracks)));
    for(const id of ids){const obj=objects.get(id);if(!obj)continue;const track=keys.filter(k=>k.tracks[id]);const before=[...track].reverse().find(k=>k.frame<=this.frame)||track[0],after=track.find(k=>k.frame>=this.frame)||track.at(-1);if(!before||!after)continue;
      const t=before.frame===after.frame?0:(this.frame-before.frame)/(after.frame-before.frame),a=before.tracks[id],b=after.tracks[id];
      obj.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position),t);obj.scale.fromArray(a.scale).lerp(new THREE.Vector3().fromArray(b.scale),t);obj.quaternion.fromArray(a.quaternion).slerp(new THREE.Quaternion().fromArray(b.quaternion),t);
      if(a.morph&&b.morph&&obj.morphTargetInfluences)for(let i=0;i<obj.morphTargetInfluences.length;i++)if(Number.isFinite(a.morph[i])&&Number.isFinite(b.morph[i]))obj.morphTargetInfluences[i]=a.morph[i]+(b.morph[i]-a.morph[i])*t;
      if(a.channels&&b.channels&&obj.userData.fusion_deformation)for(const c of obj.userData.fusion_deformation.channels)if(Number.isFinite(a.channels[c.id])&&Number.isFinite(b.channels[c.id]))c.value=a.channels[c.id]+(b.channels[c.id]-a.channels[c.id])*t;
      if(a.creator&&b.creator&&obj.userData.fusion_creator)for(const shape of obj.userData.fusion_creator.recipe.shapes){const av=a.creator.shapes[shape.id],bv=b.creator.shapes[shape.id];if(Number.isFinite(av)&&Number.isFinite(bv))shape.value=av+(bv-av)*t;}
      for(const c of obj.userData.fusion_ik||[]){const ac=a.ik?.find(k=>k.id===c.id),bc=b.ik?.find(k=>k.id===c.id);if(ac&&bc){c.target=ac.target.map((v,i)=>v+(bc.target[i]-v)*t);c.pole=ac.pole.map((v,i)=>v+(bc.pole[i]-v)*t);c.enabled=t<1?ac.enabled:bc.enabled;}}
    }
    for(const {mixer,actions=[]} of this.mixers){for(const action of actions){action.paused=false;action.enabled=true;}mixer.setTime((this.frame-1)/this.fps);}this.editor.root.updateMatrixWorld(true);solveSceneIK(this.editor.root);if(notify)this.editor.change('frame');return true;
    }catch(error){this.mixers.forEach(({mixer,actions=[]},i)=>{mixer.setTime(mixers[i].time);actions.forEach((a,j)=>Object.assign(a,mixers[i].actions[j]));});restorePoseState(saved);this.frame=priorFrame;this.playing=false;if(notify)this.editor.change('operator-error',error);if(strict)throw error;return false;}
  }
  tick(time){if(!this.playing){this.lastTime=time;return;}const delta=(time-this.lastTime)/1000;this.lastTime=time;this.accumulator=(this.accumulator||0)+delta*this.fps;if(this.accumulator>=1){const next=this.frame+Math.floor(this.accumulator);this.accumulator%=1;this.evaluate(next>this.end?this.start:next);}}
  toggle(){this.playing=!this.playing;this.lastTime=performance.now();this.editor.change('frame');}
  register(root,clips){if(clips?.length){const mixer=new THREE.AnimationMixer(root);const actions=clips.map(clip=>{const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;return action.play();});this.mixers.push({root,mixer,actions});}}
  reset(){this.playing=false;for(const {mixer} of this.mixers)mixer.stopAllAction();this.mixers=[];this.frame=1;this.editor.root.traverse(n=>{if(n.animations?.length)this.register(n,n.animations);});}
  needsIKBake(){let driven=false;this.editor.root.traverse(n=>{const s=n.userData.fusion_deformation;if(s&&((s.formulasEnabled!==false&&s.formulas?.length)||s.correctives?.length))driven=true;});return (driven||hasSceneIK(this.editor.root)||hasSceneJointLimits(this.editor.root)||this.keys().some(k=>Object.values(k.tracks).some(t=>t.ik?.some(c=>c.enabled))))&&(this.keys().length>1||this.mixers.length>0);}
  exportClips(){
    let deformation=false;this.editor.root.traverse(n=>{if(n.userData.fusion_deformation)deformation=true;});if(this.needsIKBake()||deformation&&this.keys().length>1)return this.bakeIKClips();
    const tracks=[],keys=this.keys(),ids=new Set(keys.flatMap(k=>Object.keys(k.tracks)));
    for(const id of ids){const frames=keys.filter(k=>k.tracks[id]),times=frames.map(k=>(k.frame-1)/this.fps);if(frames.length<2)continue;
      for(const [property,Type] of [['position',THREE.VectorKeyframeTrack],['quaternion',THREE.QuaternionKeyframeTrack],['scale',THREE.VectorKeyframeTrack]])tracks.push(new Type(id+'.'+property,times,frames.flatMap(k=>k.tracks[id][property])));
      if(frames.every(k=>Array.isArray(k.tracks[id].morph)))tracks.push(new THREE.NumberKeyframeTrack(id+'.morphTargetInfluences',times,frames.flatMap(k=>k.tracks[id].morph)));
    }
    return tracks.length?[new THREE.AnimationClip('Fusion animation',-1,tracks)]:[];
  }
  bakeIKClips(){
    const nodes=[];this.editor.root.traverse(n=>{if(n!==this.editor.root)nodes.push(n);});
    if(nodes.length*this.end>1000000)throw Error('IK animation export exceeds one million node/frame samples. Shorten the timeline or simplify the scene.');
    const state=capturePoseState(this.editor.root),frame=this.frame,playing=this.playing,mixerStates=this.mixers.map(({mixer,actions=[]})=>({time:mixer.time,actions:actions.map(a=>({paused:a.paused,enabled:a.enabled}))})),times=[],samples=nodes.map(()=>({position:[],quaternion:[],scale:[],morphTargetInfluences:[]}));
    try{
      for(let f=1;f<=this.end;f++){this.evaluate(f,{notify:false,strict:true});times.push((f-1)/this.fps);nodes.forEach((n,i)=>{for(const key of ['position','quaternion','scale'])samples[i][key].push(...n[key].toArray());if(n.morphTargetInfluences)samples[i].morphTargetInfluences.push(...n.morphTargetInfluences);});}
      const tracks=[];nodes.forEach((n,i)=>{for(const [key,Type,stride] of [['position',THREE.VectorKeyframeTrack,3],['quaternion',THREE.QuaternionKeyframeTrack,4],['scale',THREE.VectorKeyframeTrack,3],['morphTargetInfluences',THREE.NumberKeyframeTrack,n.morphTargetInfluences?.length||0]]){const values=samples[i][key];if(!stride||!values.length)continue;const prior=state[i+1],original=key==='morphTargetInfluences'?prior.morph:prior[key].toArray();if(values.some((v,j)=>Math.abs(v-original[j%stride])>1e-7))tracks.push(new Type(n.uuid+'.'+key,times,values));}});
      return tracks.length?[new THREE.AnimationClip('Fusion IK baked',-1,tracks)]:[];
    }finally{
      this.mixers.forEach(({mixer,actions=[]},i)=>{for(const action of actions){action.paused=false;action.enabled=true;}mixer.setTime(mixerStates[i].time);actions.forEach((a,j)=>Object.assign(a,mixerStates[i].actions[j]));});
      restorePoseState(state);this.frame=frame;this.playing=playing;this.editor.change('frame');
    }
  }
}


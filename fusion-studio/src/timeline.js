import * as THREE from 'three';
import {solveSceneIK,hasSceneIK} from './ik.js';
import {hasSceneJointLimits} from './joint-limits.js';
import {initializeDeformation} from './deformation.js';
import {authoredQuaternion,restoreAuthoredRotations,capturePoseState,restorePoseState} from './formula-rotations.js';
import {applyCameraProcedural} from './cameras.js';
import {sampleSegment,mapLoopFrame,nlaSourceFrame,reduceKeys,retimeKeys,stretchRange,INTERP_MODES,LOOP_MODES,eventsAt,followPath,createPathCurve} from './animation.js';
import {resolvedTrack,validateTimelineSettings} from './animation-data.js';
import {animationSamplingReasons,keyframeClips} from './animation-export.js';

export class Timeline{
  constructor(editor){
    this.editor=editor;this.frame=1;this.start=1;this.end=120;this.fps=24;this.playing=false;this.lastTime=0;this.mixers=[];
    this.autoKey=false;this.loopMode='loop';this.timeScale=1;this.pingDir=1;this.onion={enabled:false,before:2,after:2};this.defaultInterp='linear';
    this._eventListeners=[];this.follow=null;
  }
  keys(){return this.editor.root.userData.fusion_timeline||[];}
  snapshot(){return validateTimelineSettings(Object.fromEntries(Object.keys(validateTimelineSettings()).map(k=>[k,k==='version'?1:structuredClone(this[k])])));}
  hydrate(input){Object.assign(this,validateTimelineSettings(input));this.follow=null;this.pathCache=new WeakMap();}
  setInterp(mode){if(!INTERP_MODES.includes(mode))throw Error('Unknown interpolation mode.');this.defaultInterp=mode;const key=this.keys().find(k=>k.frame===this.frame);if(key&&this.editor.selected){const ids=new Set();this.editor.selected.traverse(n=>ids.add(n.uuid));for(const id of ids)if(key.tracks[id])key.tracks[id]={...resolvedTrack(key,id),interp:mode};this.editor.commit();}return mode;}
  setLoopMode(mode){if(!LOOP_MODES.includes(mode))throw Error('Unknown loop mode.');this.loopMode=mode;return mode;}
  setTimeScale(scale){if(!Number.isFinite(scale)||scale<=0||scale>10)throw Error('Time scale must be in (0, 10].');this.timeScale=scale;return scale;}
  insert({interp}={}){
    const e=this.editor;if(!e.selected)throw Error('Select an object to insert a keyframe.');const tracks={};
    initializeDeformation(e.selected);const capture=n=>{tracks[n.uuid]={position:n.position.toArray(),quaternion:(n.isBone?authoredQuaternion(e.selected,n):n.quaternion).toArray(),scale:n.scale.toArray()};if(n.morphTargetInfluences)tracks[n.uuid].morph=[...n.morphTargetInfluences];if(n.userData.fusion_deformation)tracks[n.uuid].channels=Object.fromEntries(n.userData.fusion_deformation.channels.map(c=>[c.id,c.value]));if(n.userData.fusion_ik)tracks[n.uuid].ik=n.userData.fusion_ik.map(c=>({id:c.id,target:[...c.target],pole:[...c.pole],enabled:c.enabled}));};capture(e.selected);e.selected.traverse(n=>{if(n.isBone||n.morphTargetInfluences)capture(n);});
    if(e.selected.userData.fusion_creator){const r=e.selected.userData.fusion_creator.recipe;tracks[e.selected.uuid].creator={shapes:Object.fromEntries(r.shapes.map(s=>[s.id,s.value]))};}
    for(const track of Object.values(tracks))track.interp=interp||this.defaultInterp;
    const keys=this.keys();let key=keys.find(k=>k.frame===this.frame);if(!key){key={frame:this.frame,tracks:{},interp:interp||this.defaultInterp};keys.push(key);}Object.assign(key.tracks,tracks);keys.sort((a,b)=>a.frame-b.frame);e.root.userData.fusion_timeline=keys;e.commit();e.change('frame');
  }
  maybeAutoKey(){if(!this.autoKey||!this.editor.selected)return false;this.insert();return true;}
  remove(){this.editor.root.userData.fusion_timeline=this.keys().filter(k=>k.frame!==this.frame);this.editor.commit();}
  jumpKey(direction){const frames=this.keys().map(k=>k.frame).filter(f=>direction>0?f>this.frame:f<this.frame);if(frames.length)this.evaluate(direction>0?Math.min(...frames):Math.max(...frames));}
  reduce(tolerance=.001){this.editor.root.userData.fusion_timeline=reduceKeys(this.keys(),{tolerance});this.editor.commit();return this.keys().length;}
  retime(scale,origin=1){this.editor.root.userData.fusion_timeline=retimeKeys(this.keys(),{scale,origin});this.editor.commit();return this.keys().length;}
  stretch(start,end,newEnd){this.editor.root.userData.fusion_timeline=stretchRange(this.keys(),{start,end,newEnd});this.editor.commit();return this.keys().length;}
  onEvent(fn){this._eventListeners.push(fn);return ()=>{this._eventListeners=this._eventListeners.filter(f=>f!==fn);};}
  _fireEvents(frame){for(const event of eventsAt(this.editor.root,frame))for(const fn of this._eventListeners)fn(event);}
  evaluate(frame,{notify=true,strict=false,events=notify,subframe=false}={}){
    const saved=capturePoseState(this.editor.root),priorFrame=this.frame,priorDirection=this.pingDir,mixers=this.mixers.map(({mixer,actions=[]})=>({time:mixer.time,actions:actions.map(a=>({paused:a.paused,enabled:a.enabled}))}));try{
    this.editor.root.traverse(n=>restoreAuthoredRotations(n));
    let target=subframe?frame:Math.round(frame);const mapped=mapLoopFrame(target,this.start,this.end,this.playing?this.loopMode:'once',this.pingDir);this.pingDir=mapped.pingDir;target=mapped.frame;
    // NLA remaps the source key timeline while preserving the display frame.
    const sourceFrame=nlaSourceFrame(this.editor.root.userData.fusion_nla,target);
    this.frame=Math.min(this.end,Math.max(this.start,target));const keys=this.keys(),objects=new Map();this.editor.root.traverse(n=>objects.set(n.uuid,n));
    const ids=new Set(keys.flatMap(k=>Object.keys(k.tracks)));
    for(const id of ids){const obj=objects.get(id);if(!obj)continue;const track=keys.filter(k=>k.tracks[id]);const before=[...track].reverse().find(k=>k.frame<=sourceFrame)||track[0],after=track.find(k=>k.frame>=sourceFrame)||track.at(-1);if(!before||!after)continue;
      const a=resolvedTrack(before,id),b=resolvedTrack(after,id),{t}=sampleSegment({...before,...a},{...after,...b},sourceFrame);
      obj.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position),t);obj.scale.fromArray(a.scale).lerp(new THREE.Vector3().fromArray(b.scale),t);obj.quaternion.fromArray(a.quaternion).slerp(new THREE.Quaternion().fromArray(b.quaternion),t);
      if(a.morph&&b.morph&&obj.morphTargetInfluences)for(let i=0;i<obj.morphTargetInfluences.length;i++)if(Number.isFinite(a.morph[i])&&Number.isFinite(b.morph[i]))obj.morphTargetInfluences[i]=a.morph[i]+(b.morph[i]-a.morph[i])*t;
      if(a.channels&&b.channels&&obj.userData.fusion_deformation)for(const c of obj.userData.fusion_deformation.channels)if(Number.isFinite(a.channels[c.id])&&Number.isFinite(b.channels[c.id]))c.value=a.channels[c.id]+(b.channels[c.id]-a.channels[c.id])*t;
      if(a.creator&&b.creator&&obj.userData.fusion_creator)for(const shape of obj.userData.fusion_creator.recipe.shapes){const av=a.creator.shapes[shape.id],bv=b.creator.shapes[shape.id];if(Number.isFinite(av)&&Number.isFinite(bv))shape.value=av+(bv-av)*t;}
      for(const c of obj.userData.fusion_ik||[]){const ac=a.ik?.find(k=>k.id===c.id),bc=b.ik?.find(k=>k.id===c.id);if(ac&&bc){c.target=ac.target.map((v,i)=>v+(bc.target[i]-v)*t);c.pole=ac.pole.map((v,i)=>v+(bc.pole[i]-v)*t);c.enabled=t<1?ac.enabled:bc.enabled;}}
    }
    if(this.follow?.object&&this.follow?.curve)followPath(this.follow.object,this.follow.curve,{frame:this.frame,start:this.follow.start||this.start,end:this.follow.end||this.end,align:this.follow.align!==false});
    this.pathCache??=new WeakMap();this.editor.root.traverse(n=>{const path=n.userData.fusion_follow_path;if(!path?.points)return;let cached=this.pathCache.get(n);const hash=JSON.stringify(path);if(cached?.hash!==hash){cached={hash,curve:createPathCurve(path.points)};this.pathCache.set(n,cached);}followPath(n,cached.curve,{...path,frame:this.frame});});
    for(const {mixer,actions=[]} of this.mixers){for(const action of actions){action.paused=false;action.enabled=true;}mixer.setTime((this.frame-1)/this.fps);}this.editor.root.updateMatrixWorld(true);solveSceneIK(this.editor.root);this.editor.root.traverse(n=>{if(n.isCamera)applyCameraProcedural(n,this.frame,this.fps,this.editor.root);});this.editor.root.updateMatrixWorld(true);
    if(events)this._fireEvents(this.frame);if(notify)this.editor.change('frame');return true;
    }catch(error){this.mixers.forEach(({mixer,actions=[]},i)=>{mixer.setTime(mixers[i].time);actions.forEach((a,j)=>Object.assign(a,mixers[i].actions[j]));});restorePoseState(saved);this.frame=priorFrame;this.pingDir=priorDirection;this.playing=false;if(notify)this.editor.change('operator-error',error);if(strict)throw error;return false;}
  }
  tick(time){if(!this.playing){this.lastTime=time;return;}const delta=(time-this.lastTime)/1000;this.lastTime=time;this.accumulator=(this.accumulator||0)+delta*this.fps*this.timeScale;if(this.accumulator>=1){const step=Math.floor(this.accumulator);this.accumulator%=1;const next=this.frame+step*this.pingDir;if(this.loopMode==='once'&&next>this.end){this.playing=false;this.evaluate(this.end);return;}this.evaluate(next);}}
  toggle(){this.playing=!this.playing;this.lastTime=performance.now();this.editor.change('frame');}
  register(root,clips){if(clips?.length){const mixer=new THREE.AnimationMixer(root);const actions=clips.map(clip=>{const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;return action.play();});this.mixers.push({root,mixer,actions});}}
  reset(){this.playing=false;for(const {mixer} of this.mixers)mixer.stopAllAction();this.mixers=[];this.hydrate(this.editor.root.userData.fusion_timeline_settings);this.frame=this.start;this.pingDir=1;this.editor.root.traverse(n=>{if(n.animations?.length)this.register(n,n.animations);});}
  needsIKBake(){let driven=false;this.editor.root.traverse(n=>{const s=n.userData.fusion_deformation;if(s&&((s.formulasEnabled!==false&&s.formulas?.length)||s.correctives?.length))driven=true;});return (driven||hasSceneIK(this.editor.root)||hasSceneJointLimits(this.editor.root)||this.keys().some(k=>Object.values(k.tracks).some(t=>t.ik?.some(c=>c.enabled))))&&(this.keys().length>1||this.mixers.length>0);}
  exportReport(){
    const reasons=animationSamplingReasons(this.editor.root);let deformation=false;this.editor.root.traverse(n=>{if(n.userData.fusion_deformation)deformation=true;});
    const driven=this.needsIKBake()||deformation&&this.keys().length>1;if(driven)reasons.push('evaluated character/rig dependencies');if(this.follow)reasons.push('follow-path motion');
    return {version:1,mode:reasons.length?'sampled':'keyframes',reasons:[...new Set(reasons)],fps:this.fps,start:this.start,end:this.end,frameOrigin:1,samplesPerFrame:driven?1:4,fullEvaluation:!!(driven||this.follow||reasons.some(r=>r!=='eased or mixed interpolation')),approximation:reasons.length?'Exchange motion is sampled; retain the Fusion project for editable curves and controls. Mixed hold transitions use adjacent Float32 times.':null};
  }
  exportClips(){const report=this.exportReport();this.lastExportReport=report;return report.fullEvaluation?this.bakeIKClips({samplesPerFrame:report.samplesPerFrame}):keyframeClips(this.keys(),{fps:this.fps});}
  samplePose(run){
    const state=capturePoseState(this.editor.root),runtime=Object.fromEntries(['frame','playing','pingDir','accumulator','lastTime'].map(k=>[k,this[k]])),mixers=this.mixers.map(({mixer,actions=[]})=>({time:mixer.time,actions:actions.map(a=>({paused:a.paused,enabled:a.enabled}))}));
    this.playing=false;
    try{return run();}finally{
      this.mixers.forEach(({mixer,actions=[]},i)=>{for(const a of actions){a.paused=false;a.enabled=true;}mixer.setTime(mixers[i].time);actions.forEach((a,j)=>Object.assign(a,mixers[i].actions[j]));});
      restorePoseState(state);Object.assign(this,runtime);
    }
  }
  bakeIKClips({samplesPerFrame=1}={}){
    const nodes=[];this.editor.root.traverse(n=>{if(n!==this.editor.root)nodes.push(n);});
    if(!Number.isInteger(this.end)||this.end<1||!Number.isFinite(this.fps)||this.fps<=0||this.fps>240||nodes.length*((this.end-1)*samplesPerFrame+1)>1000000)throw Error('Animation export exceeds its one million node/time sample budget or has invalid frame/FPS settings. Shorten the timeline or simplify the scene.');
    const state=capturePoseState(this.editor.root),times=[],samples=nodes.map(()=>({position:[],quaternion:[],scale:[],morphTargetInfluences:[]}));
    return this.samplePose(()=>{
      for(let step=0;step<=(this.end-1)*samplesPerFrame;step++){const f=1+step/samplesPerFrame;this.evaluate(f,{notify:false,strict:true,events:false,subframe:true});times.push((f-1)/this.fps);nodes.forEach((n,i)=>{for(const key of ['position','quaternion','scale'])samples[i][key].push(...n[key].toArray());if(n.morphTargetInfluences)samples[i].morphTargetInfluences.push(...n.morphTargetInfluences);});}
      const tracks=[];nodes.forEach((n,i)=>{for(const [key,Type,stride] of [['position',THREE.VectorKeyframeTrack,3],['quaternion',THREE.QuaternionKeyframeTrack,4],['scale',THREE.VectorKeyframeTrack,3],['morphTargetInfluences',THREE.NumberKeyframeTrack,n.morphTargetInfluences?.length||0]]){const values=samples[i][key];if(!stride||!values.length)continue;const prior=state[i+1],original=key==='morphTargetInfluences'?prior.morph:prior[key].toArray();if(values.some((v,j)=>Math.abs(v-original[j%stride])>1e-7))tracks.push(new Type(n.uuid+'.'+key,times,values));}});
      return tracks.length?[new THREE.AnimationClip('Fusion IK baked',-1,tracks)]:[];
    });
  }
}

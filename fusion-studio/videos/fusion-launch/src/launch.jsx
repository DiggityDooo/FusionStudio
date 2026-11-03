import React from 'react';
import {AbsoluteFill,Sequence,staticFile,useCurrentFrame,interpolate,Easing} from 'remotion';
import {Video,Audio} from '@remotion/media';
import {film,scenes as nominalScenes,cues as nominalCues} from './story.mjs';
import prepared from '../public/prepared.json';
import './style.css';
const scenes=prepared.story||nominalScenes,cues=prepared.cues||nominalCues;

const ease=Easing.bezier(.16,1,.3,1);
const enter=(f,d=20)=>interpolate(f,[0,d],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
function Footage({asset,frames,hero=false}){
 const frame=useCurrentFrame(),meta=prepared.assets[asset],rate=meta.frames/frames;
 const drift=interpolate(frame,[0,frames],[1,1.018],{extrapolateRight:'clamp'});
 return <div className={hero?'hero-footage':'footage'} style={{transform:`scale(${drift})`}}>
  <Video src={staticFile(`media/${asset}.mp4`)} muted playbackRate={rate} />
  {!hero&&<span className="capture-badge">ACTUAL FUSION CAPTURE{rate>1.08?` / ${rate.toFixed(1)}× PLAYBACK`:''}</span>}
 </div>;
}
function Montage({frames}){
 return <div className="montage">
  {['native-render','daz-preset','sculpt'].map((asset,i)=><div className={`tile tile-${i}`} key={asset}><Footage asset={asset} frames={frames} hero/><span>{['PRESERVE','IMPORT','EDIT'][i]}</span></div>)}
 </div>;
}
function Scene({scene,preview}){
 const frame=useCurrentFrame(),length=scene.to-scene.from,arrival=enter(frame),leave=enter(length-frame,12),isBookend=!scene.clips.length;
 const cue=cues.find(([a,b])=>frame+scene.from>=a&&frame+scene.from<b)?.[2]||scene.caption;
 let cursor=0;
 return <AbsoluteFill className={`scene ${scene.tone}`} style={{opacity:Math.min(arrival,leave)}}>
  <div className="grain"/>
  <div className="brand"><span className="mark">◈</span> FUSION <span>STUDIO</span></div>
  <div className="top-right">{preview?'PICTURE PREVIEW / SOUNDTRACK PENDING':'120 SECONDS / REAL WORKFLOWS'}</div>
  <div className={`heading ${isBookend?'bookend':''}`} style={{transform:`translateY(${(1-arrival)*22}px)`}}>
   <div className="eyebrow">{scene.tag}</div><h1>{scene.title}</h1>
   {isBookend&&<p>{scene.caption}</p>}
  </div>
  {isBookend?<Montage frames={length}/>:<div className="stage">
   {scene.clips.map(clip=>{const from=cursor;cursor+=clip.frames;return <Sequence key={clip.asset} from={from} durationInFrames={clip.frames}><Footage {...clip}/></Sequence>;})}
  </div>}
  {!isBookend&&<div className="caption"><span className="caption-dot"/>{cue}</div>}
  <div className="footer"><span>{scene.id==='finish'?'MUSIC / SECRET — ESPRIT 空想':'ASSETS RETAINED / EDITS RECOVERABLE'}</span><span>{scene.id==='finish'?'LOCAL WINDOWS RELEASE CANDIDATE':scene.caption}</span></div>
 </AbsoluteFill>;
}
export function LaunchFilm({preview=true}){
 const frame=useCurrentFrame();
 return <AbsoluteFill style={{background:'#161715',fontFamily:'Fusion Sans, Segoe UI, sans-serif'}}>
  {scenes.map(scene=><Sequence key={scene.id} from={scene.from} durationInFrames={scene.to-scene.from}><Scene scene={scene} preview={preview}/></Sequence>)}
  <div className="progress"><div style={{width:`${frame/(film.durationInFrames-1)*100}%`}}/></div>
  {!preview&&prepared.music&&<Audio src={staticFile('audio/secret-master.wav')}/>}
 </AbsoluteFill>;
}

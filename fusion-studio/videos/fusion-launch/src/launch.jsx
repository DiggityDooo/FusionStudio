import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,Sequence,Img,staticFile,useCurrentFrame,interpolate,delayRender,continueRender,cancelRender} from 'remotion';
import {Video,Audio} from '@remotion/media';
import prepared from '../public/prepared.json';
import './style.css';
const handle=delayRender('Load verified fonts');
Promise.all([['regular.ttf','400'],['semibold.ttf','600']].map(async([file,weight])=>{const font=await new FontFace('Fusion Sans',`url("${staticFile('fonts/'+file)}")`,{weight}).load();document.fonts.add(font);})).then(()=>continueRender(handle)).catch(cancelRender);
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
function Media({clip,companion=false}){
 const frame=useCurrentFrame(),asset=companion?clip.companion:clip.asset,meta=prepared.assets[asset],start=clip.sourceIn||0,end=clip.sourceOut??meta.frames,rate=(end-start)/clip.frames;
 // Orbit shots already move. Only still renders get a 1.5% camera drift.
 if(meta.kind==='image')return <Img src={staticFile(meta.file)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1+.015*frame/clip.frames})`}}/>;
 return <Video src={staticFile(meta.file)} muted trimBefore={start} trimAfter={end} playbackRate={rate} objectFit={clip.layout==='pair'?'cover':'contain'} style={{width:'100%',height:'100%'}}/>;
}
function Caption({cue,globalFrame}){
 const words=cue[2].split(' '),age=globalFrame-cue[0];
 return <div className="caption" data-qa="caption">{words.map((word,i)=><React.Fragment key={i}><span style={{opacity:interpolate(age,[Math.min(4,i*.6),Math.min(4,i*.6)+6],[.35,1],clamp)}}>{word}</span>{' '}</React.Fragment>)}</div>;
}
function Shot({clip,scene,preview}){
 const frame=useCurrentFrame(),globalFrame=clip.from+frame,cue=prepared.cues.find(([a,b])=>globalFrame>=a&&globalFrame<b),meta=prepared.assets[clip.asset],rate=((clip.sourceOut??meta.frames)-(clip.sourceIn||0))/clip.frames,ui=clip.layout==='ui',end=clip.layout==='end';
 useLayoutEffect(()=>{for(const node of document.querySelectorAll('[data-qa]')){const base=node.closest('.shot').getBoundingClientRect();if(Math.abs(base.width-1920)>1)continue;const r=node.getBoundingClientRect();if(r.x<base.x||r.y<base.y||r.right>base.right+.1||r.bottom>base.bottom+.1||node.scrollWidth>node.clientWidth+1)throw Error(`Clipped ${node.dataset.qa} in ${clip.id} at ${frame}`);}},[frame,clip.id]);
 return <AbsoluteFill className={`shot ${clip.layout}`} data-shot={clip.id}>
  <div className="picture"><Media clip={clip}/>{clip.companion&&<Media clip={clip} companion/>}</div>
  {!ui&&<div className="shade"/>}
  <div className="masthead" data-qa="masthead"><span className="diamond">◈</span> FUSION <span className="sub-brand">STUDIO</span></div>
  {ui?<div className="section-label" data-qa="section">{scene.tag}<strong>{scene.title}</strong></div>:<div className="output-label" data-qa="label">{clip.label}</div>}
  {ui&&<div className="capture-note" data-qa="capture-note">ACTUAL CAPTURE{meta.waitingTimeShortened?' · WAITS CUT':''}{rate>1.08?` · ${rate.toFixed(1)}×`:''}</div>}
  {end&&<div className="invitation" data-qa="invitation" style={{transform:`translateY(${-4*frame/clip.frames}px)`}}><div className="eyebrow">FUSION STUDIO / 0.19.0-rc.1</div><h1>Keep building.</h1><p>github.com/DiggityDooo/FusionStudio</p><div className="credit">Secret — ESPRIT 空想</div></div>}
  {cue&&<Caption cue={cue} globalFrame={globalFrame}/>}
  {preview&&<div className="preview">PICTURE PREVIEW / SOUNDTRACK PENDING</div>}
 </AbsoluteFill>;
}
export function LaunchFilm({preview=true}){
 const shots=prepared.story.flatMap(scene=>{let cursor=scene.from;return scene.clips.map(clip=>{const result={...clip,from:cursor,scene};cursor+=clip.frames;return result;});});
 return <AbsoluteFill style={{background:'#090a0b',fontFamily:'Fusion Sans, Segoe UI, sans-serif'}}>{shots.map(clip=><Sequence key={clip.id} from={clip.from} durationInFrames={clip.frames}><Shot clip={clip} scene={clip.scene} preview={preview}/></Sequence>)}{!preview&&prepared.music&&<Audio src={staticFile('audio/secret-master.wav')}/>}</AbsoluteFill>;
}

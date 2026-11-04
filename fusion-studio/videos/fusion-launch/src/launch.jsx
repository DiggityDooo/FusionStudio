import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,Sequence,Img,staticFile,useCurrentFrame,interpolate,Easing,delayRender,continueRender,cancelRender} from 'remotion';
import {Video,Audio} from '@remotion/media';
import prepared from '../public/prepared.json';
import './style.css';
const handle=delayRender('Load verified fonts');
Promise.all([['regular.ttf','400'],['semibold.ttf','600']].map(async([file,weight])=>{const font=await new FontFace('Fusion Sans',`url("${staticFile('fonts/'+file)}")`,{weight}).load();document.fonts.add(font);})).then(()=>continueRender(handle)).catch(cancelRender);
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'},ease=Easing.bezier(.16,1,.3,1);
const ramp=(frame,start,end,a,b)=>interpolate(frame,[start,end],[a,b],{...clamp,easing:ease});
function Media({clip,asset=clip.asset,fit='cover'}){
 const frame=useCurrentFrame(),meta=prepared.assets[asset],start=clip.sourceIn||0,end=clip.sourceOut??meta.frames;
 if(meta.kind==='image')return <Img src={staticFile(meta.file)} style={{width:'100%',height:'100%',objectFit:fit,transform:`scale(${ramp(frame,0,clip.frames,1.04,1.12)})`}}/>;
 return <Video src={staticFile(meta.file)} muted trimBefore={start} trimAfter={end} playbackRate={(end-start)/clip.frames} objectFit={fit} style={{width:'100%',height:'100%'}}/>;
}
function Headline({lines,frame,small=false}){
 const longest=Math.max(...lines.map(s=>s.length)),size=small?Math.min(112,1570/(longest*.57)):Math.min(170,1640/(longest*.57));
 return <div className={`headline ${small?'compact':''}`} data-qa="headline" style={{fontSize:size}}>{lines.map((line,i)=><div className="line-mask" key={line}><div style={{transform:`translateY(${ramp(frame,i*3,18+i*3,115,0)}%)`,opacity:ramp(frame,i*3,12+i*3,0,1)}}>{line}</div></div>)}</div>;
}
function Backdrop({frame,light=false}){
 return <><div className={`ambient ${light?'pale':''}`}/><div className="trailer-grid"/><div className="orbit-ring" style={{transform:`translate(-50%,-50%) rotate(${-18+frame*.025}deg)`}}/><div className="beam" style={{opacity:interpolate(frame,[0,5,19],[0,.7,0],clamp),transform:`translateX(${ramp(frame,0,19,-800,2100)}px) skewX(-23deg)`}}/></>;
}
function Stack({clip,frame}){
 return <div className="asset-stack">{['garment-orbit','optics-orbit','sculpt-orbit'].map((asset,i)=>{const entry=ramp(frame,i*5,24+i*5,0,1),d=frame/clip.frames;return <div key={asset} className={`asset-card card-${i}`} style={{transform:`translateY(${(1-entry)*330+Math.sin(i*2)*d*16}px) rotate(${[-9,2,10][i]}deg) scale(${.9+.1*entry})`,opacity:entry}}><Media asset={asset} clip={{...clip,sourceIn:0,sourceOut:150}}/><div className="asset-card-label">{['DAZ / .DUF','BLENDER / .BLEND','EDITABLE / .GLB'][i]}</div></div>;})}</div>;
}
function Screen({clip,frame}){
 const meta=prepared.assets[clip.asset],rate=((clip.sourceOut??meta.frames)-(clip.sourceIn||0))/clip.frames;
 const zoom=clip.focus==='chat'?1.25:clip.focus==='dialog'?1.12:1.1;
 const focus=ramp(frame,18,Math.min(clip.frames-3,60),1,zoom),entry=ramp(frame,0,20,0,1);
 return <><div className="screen" style={{transform:`translateY(${(1-entry)*95}px) scale(${.96+.04*entry})`,opacity:entry}}><div className="screen-rail"><i/><i/><i/><span>FUSION STUDIO</span><b>ACTUAL CAPTURE{rate>1.08?` / ${rate.toFixed(1)}×`:''}</b></div><div className="screen-content"><div className="screen-zoom" style={{transform:`scale(${focus})`,transformOrigin:clip.focus==='chat'?'52% 38%':'52% 48%'}}><Media clip={clip} fit="contain"/></div></div></div><div className="action-label" data-qa="action-label"><span className="live-dot"/>{clip.label}{clip.focus?' / DETAIL CROP':''}</div></>;
}
function Shot({clip,scene,preview}){
 const frame=useCurrentFrame(),globalFrame=clip.from+frame,cue=prepared.cues.find(([a,b])=>globalFrame>=a&&globalFrame<b),type=clip.layout;
 useLayoutEffect(()=>{for(const node of document.querySelectorAll('[data-qa]')){const base=node.closest('.shot')?.getBoundingClientRect();if(!base||Math.abs(base.width-1920)>1)continue;const r=node.getBoundingClientRect();if(r.x<base.x-.1||r.y<base.y-.1||r.right>base.right+.1||r.bottom>base.bottom+.1||node.scrollWidth>node.clientWidth+1)throw Error(`Clipped ${node.dataset.qa} in ${clip.id} at ${frame}`);}},[frame,clip.id]);
 return <AbsoluteFill className={`shot trailer ${type} ${clip.light?'light':''}`} data-shot={clip.id}>
  <Backdrop frame={frame} light={clip.light}/>
  {['hero','format','end'].includes(type)&&<div className="hero-media" style={{transform:`scale(${ramp(frame,0,Math.min(30,clip.frames),1.16,1.02)}) translateX(${type==='hero'?180:0}px)`}}><Media clip={clip}/></div>}
  {['hero','format','end'].includes(type)&&<div className="hero-vignette"/>}
  {type==='stack'&&<Stack clip={clip} frame={frame}/>}
  {type==='ui'&&<Screen clip={clip} frame={frame}/>}
  {type==='compare'&&<><div className="comparison"><div><Media clip={{...clip,asset:'native-output'}}/><b>NATIVE RENDER</b></div><div><Media clip={{...clip,asset:'optics-orbit',sourceIn:0,sourceOut:150}}/><b>EDITABLE GEOMETRY</b></div></div><div className="compare-divider" style={{height:ramp(frame,0,24,0,640)}}/></>}
  <div className="trailer-brand" data-qa="brand"><span>◈</span> FUSION STUDIO</div>
  <div className="chapter-mark" data-qa="chapter">{type==='end'?clip.label:scene.tag}</div>
  <Headline lines={clip.headline} frame={frame} small={type==='ui'}/>
  {type==='format'&&<div className="format-label" data-qa="format-label">{clip.label}</div>}
  {type==='ui'&&cue&&<div className="trailer-caption" data-qa="caption">{cue[2]}</div>}
  {type==='end'&&<div className="end-links" data-qa="end-links"><p>github.com/DiggityDooo/FusionStudio</p><span>Music: Secret — ESPRIT 空想</span></div>}
  {preview&&<div className="preview-mark">DIRECTION PREVIEW</div>}
 </AbsoluteFill>;
}
export function LaunchFilm({preview=true,teaser=false}){
 return <AbsoluteFill style={{background:'#08090c',fontFamily:'Fusion Sans, Segoe UI, sans-serif'}}>{prepared.shots.map(clip=><Sequence key={clip.id} from={clip.from} durationInFrames={clip.frames} premountFor={12}><Shot clip={clip} scene={prepared.story.find(s=>s.id===clip.scene)} preview={preview}/></Sequence>)}{prepared.music&&<Audio src={staticFile('audio/secret-master.wav')} volume={frame=>teaser?interpolate(frame,[702,723],[1,0],clamp):1}/>}</AbsoluteFill>;
}

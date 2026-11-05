import React from 'react';
import {AbsoluteFill,OffthreadVideo,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';

// One media element, never trimmed or retimed. Captions annotate the same take.
export function WorkflowFilm({take}){
 const frame=useCurrentFrame(),{durationInFrames}=useVideoConfig();
 const index=Math.max(0,take.steps.findLastIndex(s=>frame>=s.frame));
 const step=take.steps[index];
 const opacity=interpolate(frame,[step.frame,step.frame+12],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <AbsoluteFill style={{background:'#101112',fontFamily:'Segoe UI,Arial,sans-serif',color:'#f2efe7'}}>
  <OffthreadVideo src={staticFile('workflow/take.mp4')} muted style={{position:'absolute',left:0,top:0,width:1920,height:960}}/>
  <div style={{position:'absolute',top:960,left:0,right:0,height:120,borderTop:'1px solid #8e713b',background:'linear-gradient(90deg,#161719,#202020)',padding:'18px 36px',boxSizing:'border-box',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
   <div style={{opacity,maxWidth:1440}}><div style={{fontSize:28,fontWeight:650,letterSpacing:.3,color:'#e8c679',marginBottom:8}}>{step.title}</div><div style={{fontSize:22,color:'#e0ded7'}}>{step.caption}</div></div>
   <div style={{textAlign:'right',fontSize:15,letterSpacing:2,color:'#c9c5bb',lineHeight:1.8}}>FUSION STUDIO<br/><span style={{fontSize:13,color:'#c9a862'}}>CONTINUOUS TAKE · 1×</span></div>
  </div>
  <div style={{position:'absolute',left:0,bottom:0,height:3,width:1920*frame/Math.max(1,durationInFrames-1),background:'#d4ae63'}}/>
 </AbsoluteFill>;
}

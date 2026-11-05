import {interpolate,Easing} from 'remotion';
// Centers use normalized coordinates inside the captured screen, below its rail.
export function screenCamera(frame,keys){
 const options={extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.42,0,.22,1)};
 const sample=field=>interpolate(frame,keys.map(k=>k.frame),keys.map(k=>k[field]),options);
 const zoom=sample('zoom'),limit=v=>Math.max(.5/zoom,Math.min(1-.5/zoom,v));
 const x=limit(sample('x')),y=limit(sample('y'));
 return {zoom,x,y,transform:`translate(${50-x*zoom*100}%, ${50-y*zoom*100}%) scale(${zoom})`};
}

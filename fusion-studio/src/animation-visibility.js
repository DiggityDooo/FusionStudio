import * as THREE from 'three';

// Scene visibility is intentional export scope. A hidden source's tracks must
// not make the exporter discard a clip containing visible replacement actors.
export function visibleAnimationClips(content,source,clips){
 const all=new Map(),names=new Map(),visible=new Set(),output=[];source.traverse(n=>{all.set(n.uuid,n);if(!names.has(n.name))names.set(n.name,[]);names.get(n.name).push(n);});content.traverseVisible(n=>{visible.add(n.uuid);if(n.isSkinnedMesh)for(const b of n.skeleton.bones)visible.add(b.uuid);});let omittedTracks=0,omittedClips=0;
 for(const clip of clips){const kept=[];for(const track of clip.tracks){const p=THREE.PropertyBinding.parseTrackName(track.name);let node=all.get(p.nodeName);if(!node){const matches=names.get(p.nodeName)||[];if(matches.length>1)throw Error('Animation target name is ambiguous: '+p.nodeName+'. Bind this track by object ID before export.');node=matches[0];}if(!node)throw Error('Animation target is missing: '+(p.nodeName||'unscoped root')+'. Relink or bake this clip before export.');if(p.objectName==='bones')node=node.skeleton?.getBoneByName(p.objectIndex)||node.skeleton?.bones?.[Number(p.objectIndex)];if(!node)throw Error('Animation joint binding is missing: '+track.name);if(visible.has(node.uuid))kept.push(track);else omittedTracks++;}
  if(kept.length){const next=clip.clone();next.tracks=kept.map(t=>t.clone());output.push(next);}else omittedClips++;
 }
 return {clips:output,report:{version:1,omittedTracks,omittedClips,scope:'Only visible actors are exported. Omitted source tracks stay in the Fusion project.'}};
}

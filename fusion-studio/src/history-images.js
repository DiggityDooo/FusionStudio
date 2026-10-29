// Images stay embedded in project files. History alone interns identical image
// payloads so unchanged 2k/4k skin maps do not consume every snapshot's budget.
import {isImmutableImageSnapshot} from './image-snapshots.js';
export class HistoryImages {
 constructor(){this.payloads=new Map();this.byContent=new Map();this.byImage=new WeakMap();this.pins=new Map();this.next=1;}
 capture(document,{pin=false}={}){
  const images=document.images?.map(image=>{const {uuid,...payload}=image;let id=isImmutableImageSnapshot(image)?this.byImage.get(image):null;if(!id||!this.payloads.has(id)){const content=JSON.stringify(payload);id=this.byContent.get(content);if(!id){id=String(this.next++);this.byContent.set(content,id);this.payloads.set(id,content);}if(isImmutableImageSnapshot(image))this.byImage.set(image,id);}return {uuid,fusion_history_image:id};});
  const snapshot=JSON.stringify(images?{...document,images}:document);return pin?{snapshot,release:this.retainIds((images||[]).map(image=>image.fusion_history_image))}:snapshot;
 }
 expand(document){
  if(!document.images?.some(image=>image.fusion_history_image))return document;
  return {...document,images:document.images.map(image=>{if(!image.fusion_history_image)return image;const content=this.payloads.get(image.fusion_history_image);if(!content)throw Error('A history image is missing. Keep the current scene and reopen the last saved project.');return {uuid:image.uuid,...JSON.parse(content)};})};
 }
 prune(snapshots){
  const used=new Set(this.pins.keys());for(const snapshot of snapshots)for(const match of snapshot?.matchAll(/"fusion_history_image":"(\d+)"/g)||[])used.add(match[1]);
  for(const [id,content]of this.payloads)if(!used.has(id)){this.payloads.delete(id);this.byContent.delete(content);}
 }
 retain(snapshot){
  return this.retainIds((JSON.parse(snapshot).images||[]).map(image=>image.fusion_history_image).filter(Boolean));
 }
 retainIds(references){
  const ids=new Set(references);for(const id of ids)if(!this.payloads.has(id))throw Error('A history image is missing. Keep the current scene and reopen the last saved project.');
  for(const id of ids)this.pins.set(id,(this.pins.get(id)||0)+1);let released=false;return ()=>{if(released)return;released=true;for(const id of ids){const count=this.pins.get(id)-1;if(count)this.pins.set(id,count);else this.pins.delete(id);}};
 }
 get characters(){return [...this.payloads.values()].reduce((n,s)=>n+s.length,0);}
}

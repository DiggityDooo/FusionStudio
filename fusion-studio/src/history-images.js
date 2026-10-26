// Images stay embedded in project files. History alone interns identical image
// payloads so unchanged 2k/4k skin maps do not consume every snapshot's budget.
export class HistoryImages {
 constructor(){this.payloads=new Map();this.byContent=new Map();this.next=1;}
 capture(document){
  const images=document.images?.map(image=>{const {uuid,...payload}=image,content=JSON.stringify(payload);let id=this.byContent.get(content);if(!id){id=String(this.next++);this.byContent.set(content,id);this.payloads.set(id,content);}return {uuid,fusion_history_image:id};});
  return JSON.stringify(images?{...document,images}:document);
 }
 expand(document){
  if(!document.images?.some(image=>image.fusion_history_image))return document;
  return {...document,images:document.images.map(image=>{if(!image.fusion_history_image)return image;const content=this.payloads.get(image.fusion_history_image);if(!content)throw Error('A history image is missing. Keep the current scene and reopen the last saved project.');return {uuid:image.uuid,...JSON.parse(content)};})};
 }
 prune(snapshots){
  const used=new Set();for(const snapshot of snapshots)for(const match of snapshot?.matchAll(/"fusion_history_image":"(\d+)"/g)||[])used.add(match[1]);
  for(const [id,content]of this.payloads)if(!used.has(id)){this.payloads.delete(id);this.byContent.delete(content);}
 }
 get characters(){return [...this.payloads.values()].reduce((n,s)=>n+s.length,0);}
}

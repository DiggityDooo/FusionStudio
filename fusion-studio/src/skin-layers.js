const LAYER_KINDS=['makeup','tattoo','scar','pores','wrinkles','freckles'];
const MAX_LAYERS=24;

export function createSkinLayer(kind,{name,color='#c45c6a',opacity=.5,region='face',scale=1}={}){
 if(!LAYER_KINDS.includes(kind))throw Error('Unknown skin layer kind.');
 if(!Number.isFinite(opacity)||opacity<0||opacity>1||!Number.isFinite(scale)||scale<.1||scale>4)throw Error('Invalid layer opacity/scale.');
 if(!/^#[a-f\d]{6}$/i.test(color))throw Error('Layer color must be #rrggbb.');
 return {id:`skin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,kind,name:String(name||kind).slice(0,40),color,opacity,region:String(region).slice(0,32),scale,enabled:true};
}

export function ensureSkinStack(root){
 if(!root.userData.fusion_skin_layers)root.userData.fusion_skin_layers={version:1,layers:[]};
 return root.userData.fusion_skin_layers;
}

export function addSkinLayer(root,layer){
 const stack=ensureSkinStack(root);if(stack.layers.length>=MAX_LAYERS)throw Error('At most 24 skin layers.');
 stack.layers.push(layer);return layer;
}

export function removeSkinLayer(root,id){
 const stack=ensureSkinStack(root),i=stack.layers.findIndex(l=>l.id===id);if(i<0)throw Error('Skin layer missing.');
 return stack.layers.splice(i,1)[0];
}

export function setSkinLayer(root,id,patch={}){
 const layer=ensureSkinStack(root).layers.find(l=>l.id===id);if(!layer)throw Error('Skin layer missing.');
 if(patch.opacity!==undefined){if(!Number.isFinite(patch.opacity)||patch.opacity<0||patch.opacity>1)throw Error('Opacity 0–1.');layer.opacity=patch.opacity;}
 if(patch.scale!==undefined){if(!Number.isFinite(patch.scale)||patch.scale<.1||patch.scale>4)throw Error('Scale 0.1–4.');layer.scale=patch.scale;}
 if(patch.color!==undefined){if(!/^#[a-f\d]{6}$/i.test(patch.color))throw Error('Invalid color.');layer.color=patch.color;}
 if(patch.enabled!==undefined)layer.enabled=!!patch.enabled;
 if(patch.region!==undefined)layer.region=String(patch.region).slice(0,32);
 return layer;
}

export function reorderSkinLayer(root,id,toIndex){
 const stack=ensureSkinStack(root),from=stack.layers.findIndex(l=>l.id===id);
 if(from<0||!Number.isInteger(toIndex)||toIndex<0||toIndex>=stack.layers.length)throw Error('Invalid reorder.');
 const [layer]=stack.layers.splice(from,1);stack.layers.splice(toIndex,0,layer);return stack.layers;
}

/** Composite enabled layers into a simple preview description (no GPU paint yet). */
export function compositeSkinLayers(root){
 const stack=ensureSkinStack(root),active=stack.layers.filter(l=>l.enabled);
 const byKind=Object.fromEntries(LAYER_KINDS.map(k=>[k,0]));
 for(const l of active)byKind[l.kind]=(byKind[l.kind]||0)+l.opacity;
 // Mirror freckles/pores into creator appearance when present.
 const recipe=root.userData.fusion_creator?.recipe?.appearance;
 if(recipe){if(byKind.freckles)recipe.freckles=Math.min(1,byKind.freckles);if(byKind.pores)recipe.pores=Math.min(1,.35+byKind.pores*.65);}
 return {version:1,count:active.length,byKind,layers:active.map(l=>({id:l.id,kind:l.kind,opacity:l.opacity,color:l.color,region:l.region}))};
}

export function skinLayerPresets(){
 return [
  createSkinLayer('makeup',{name:'Lip tint',color:'#b83250',opacity:.55,region:'lips'}),
  createSkinLayer('makeup',{name:'Eye shadow',color:'#5a4a78',opacity:.4,region:'eyes'}),
  createSkinLayer('tattoo',{name:'Arm band',color:'#1a1a22',opacity:.85,region:'arm_l'}),
  createSkinLayer('scar',{name:'Cheek scar',color:'#8a6a5a',opacity:.35,region:'face',scale:1.2}),
  createSkinLayer('freckles',{name:'Nose freckles',color:'#6b3a28',opacity:.45,region:'nose'}),
  createSkinLayer('wrinkles',{name:'Forehead lines',color:'#5c4033',opacity:.25,region:'forehead'}),
  createSkinLayer('pores',{name:'Cheek pores',color:'#000000',opacity:.3,region:'cheeks'})
 ];
}

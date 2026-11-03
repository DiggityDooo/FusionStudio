const fs=require('node:fs');

// Local launch preference only; no project metadata or Windows settings change.
function placementForDisplay(displays,primaryId,preference,{width=1600,height=1000}={}){
 if(preference?.display!=='secondary')return {};
 const target=displays.find(display=>display.id!==primaryId);
 const area=target?.workArea;
 if(!area||![area.x,area.y,area.width,area.height].every(Number.isFinite)||area.width<1||area.height<1)return {};
 width=Math.min(width,area.width);height=Math.min(height,area.height);
 return {x:Math.floor(area.x+(area.width-width)/2),y:Math.floor(area.y+(area.height-height)/2),width,height,minWidth:Math.min(1180,width),minHeight:Math.min(750,height)};
}

function localWindowPlacement(file,screen){
 let preference;try{preference=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return {};}
 if(preference?.display!=='secondary')return {};
 return placementForDisplay(screen.getAllDisplays(),screen.getPrimaryDisplay().id,preference);
}
module.exports={placementForDisplay,localWindowPlacement};

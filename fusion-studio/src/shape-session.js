// A neutral editing copy belongs to one character and one live project. It is
// deliberately outside the saved root until Apply records its sparse delta.
export function shapeEditingSession(editor,mesh=editor.selected){
  const session=editor.creatorShapeSession,mark=mesh?.userData?.fusion_shape_session;
  if(!session||session.project!==editor.root||session.copy!==mesh||mesh.parent!==editor.scene||!mark)return null;
  if(editor.root.getObjectByProperty('uuid',session.owner.uuid)!==session.owner)return null;
  const creator=session.owner.userData.fusion_creator;
  return typeof mark.identity==='string'&&mark.owner===session.owner.uuid&&mark.identity===creator?.definition?.identity&&Array.isArray(creator?.recipe?.shapes)&&creator.recipe.shapes.some(s=>s.id===mark.id)?session:null;
}

export function discardShapeSession(editor){
  const session=editor.creatorShapeSession;if(!session)return;
  editor.meshTools?.cancelStroke?.();editor.evaluation?.invalidate();
  session.copy.removeFromParent();session.copy.geometry.dispose();
  for(const material of [].concat(session.copy.material||[]))material.dispose();
  session.owner.visible=session.visible;editor.creatorShapeSession=null;
  if(session.project===editor.root)editor.batching=false;
}

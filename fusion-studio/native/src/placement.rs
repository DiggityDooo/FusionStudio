//! Original surface attachment for garment preplacement, not skinning or a cloth solver.
use super::*;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BindRequest {positions:Vec<V>,body:contact::Surface,body_id:String,maximum_distance:f64}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PlaceRequest {binding:Binding,body:contact::Surface,body_id:String}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Binding {version:u32,body_id:String,body_vertices:usize,body_triangles:usize,topology_fingerprint:String,attachments:Vec<Attachment>}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Attachment {triangle:usize,barycentric:V,offset:V}

// Two deterministic non-cryptographic lanes identify connectivity. Object identity
// and the document revision/input SHA are checked separately by the scene evaluator.
fn fingerprint(body:&contact::Surface)->String{let mut a=0xcbf29ce484222325u64;let mut b=0x84222325cbf29ce4u64;for i in [body.positions.len(),body.triangles.len()].into_iter().chain(body.triangles.iter().flatten().copied()){for byte in (i as u64).to_le_bytes(){a=(a^byte as u64).wrapping_mul(0x100000001b3);b=(b^(byte as u64).wrapping_add(17)).wrapping_mul(0x100000001b3);}}format!("{a:016x}{b:016x}")}
fn validate_body(body:&contact::Surface,id:&str)->Result<(),String>{contact::validate(body)?;if body.positions.is_empty()||body.triangles.is_empty()||body.previous_positions.is_some()||id.is_empty()||id.len()>100||!id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_'){return Err("Placement needs a nonempty current body and stable body identity".into())}Ok(())}
fn basis(tri:[V;3])->Option<[V;3]>{let a=sub(tri[1],tri[0]);let b=sub(tri[2],tri[0]);let n=cross(a,b);let area=norm(n);if area<1e-14||area/(norm(a)*norm(b)).max(1e-30)<1e-6{return None}Some([a,b,mul(n,1./area.sqrt())])}
fn weighted(tri:[V;3],b:V)->V{add(add(mul(tri[0],b[0]),mul(tri[1],b[1])),mul(tri[2],b[2]))}

pub fn bind(req:BindRequest)->Result<serde_json::Value,String>{
 validate_body(&req.body,&req.body_id)?;if req.positions.is_empty()||req.positions.len()>60000||req.positions.iter().any(|&p|!valid(p))||!req.maximum_distance.is_finite()||!(0.001..=1.).contains(&req.maximum_distance){return Err("Invalid garment positions or placement distance; use at most 60,000 points and a 1 mm–1 m distance limit".into())}
 let started=std::time::Instant::now();let mut triangles=Vec::new();let mut original_ids=Vec::new();
 for (i,&t) in req.body.triangles.iter().enumerate(){if basis(t.map(|j|req.body.positions[j])).is_some(){triangles.push(t);original_ids.push(i);}}
 if triangles.is_empty(){return Err("Body has no usable placement triangles; repair degenerate geometry".into())}
 let skipped=req.body.triangles.len()-triangles.len();let surface=contact::Surface{positions:req.body.positions.clone(),triangles,previous_positions:None};let tree=contact::Tree::new(&surface);let mut attachments=Vec::with_capacity(req.positions.len());let mut maximum_distance=0f64;
 for (i,&p) in req.positions.iter().enumerate(){let Some((point,index))=tree.nearest(p,&surface)else{return Err("No placement surface found".into())};let distance=norm(sub(p,point));maximum_distance=maximum_distance.max(distance);if distance>req.maximum_distance{return Err(format!("Garment vertex {i} is {:.1} mm from the body, beyond the {:.1} mm placement limit; arrange it closer first",distance*1000.,req.maximum_distance*1000.))}
  let tri=surface.triangles[index].map(|j|surface.positions[j]);let(_,barycentric)=contact::closest(p,tri[0],tri[1],tri[2]);let [a,b,c]=basis(tri).unwrap();let delta=sub(p,weighted(tri,barycentric));let det=dot(a,cross(b,c));let offset=[dot(delta,cross(b,c))/det,dot(a,cross(delta,c))/det,dot(a,cross(b,delta))/det];if offset.iter().any(|v|!v.is_finite()||v.abs()>10000.){return Err(format!("Ill-conditioned attachment at garment vertex {i}; repair body triangles"))}attachments.push(Attachment{triangle:original_ids[index],barycentric,offset});
 }
 let binding=Binding{version:1,body_id:req.body_id,body_vertices:req.body.positions.len(),body_triangles:req.body.triangles.len(),topology_fingerprint:fingerprint(&req.body),attachments};
 Ok(serde_json::json!({"binding":binding,"metrics":{"milliseconds":started.elapsed().as_secs_f64()*1000.,"vertices":req.positions.len(),"bodyTriangles":req.body.triangles.len(),"skippedDegenerateTriangles":skipped,"maximumDistance":maximum_distance},"method":"Fusion surface attachment 1"}))
}

pub fn place(req:PlaceRequest)->Result<serde_json::Value,String>{
 validate_body(&req.body,&req.body_id)?;let started=std::time::Instant::now();let b=&req.binding;
 if b.version!=1||b.body_id!=req.body_id||b.body_vertices!=req.body.positions.len()||b.body_triangles!=req.body.triangles.len()||b.topology_fingerprint!=fingerprint(&req.body){return Err("The garment attachment belongs to a different body or topology; re-fit from the retained panels".into())}
 if b.attachments.is_empty()||b.attachments.len()>60000{return Err("Invalid garment attachment count".into())}let mut positions=Vec::with_capacity(b.attachments.len());
 for (i,a) in b.attachments.iter().enumerate(){if a.triangle>=req.body.triangles.len()||a.barycentric.iter().any(|v|!v.is_finite()||*v< -1e-8||*v>1.+1e-8)||(a.barycentric.iter().sum::<f64>()-1.).abs()>1e-7||a.offset.iter().any(|v|!v.is_finite()||v.abs()>10000.){return Err(format!("Invalid garment attachment at vertex {i}"))}let tri=req.body.triangles[a.triangle].map(|j|req.body.positions[j]);let Some(frame)=basis(tri)else{return Err(format!("Posed body triangle {} collapsed; adjust the pose or re-fit a working copy",a.triangle))};let mut p=weighted(tri,a.barycentric);for k in 0..3{p=add(p,mul(frame[k],a.offset[k]));}if !valid(p){return Err(format!("Garment placement diverged at vertex {i}; retain the last valid garment"))}positions.push(p);}
 Ok(serde_json::json!({"positions":positions,"metrics":{"milliseconds":started.elapsed().as_secs_f64()*1000.,"vertices":b.attachments.len(),"bodyTriangles":req.body.triangles.len()},"method":"Fusion surface attachment 1"}))
}

#[cfg(test)]
mod tests {use super::*;
 fn body()->contact::Surface{contact::Surface{positions:vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]],triangles:vec![[0,1,2]],previous_positions:None}}
 #[test]fn rigid_pose_and_uniform_scale_preserve_surface_offsets(){let p=[0.2,0.3,0.1];let r=bind(BindRequest{positions:vec![p],body:body(),body_id:"figure".into(),maximum_distance:0.5}).unwrap();let binding:Binding=serde_json::from_value(r["binding"].clone()).unwrap();let map=|p:V|[2.-p[1]*1.5,3.+p[0]*1.5,4.+p[2]*1.5];let mut target=body();target.positions=target.positions.into_iter().map(map).collect();let result=place(PlaceRequest{binding,body:target,body_id:"figure".into()}).unwrap();let q:V=serde_json::from_value(result["positions"][0].clone()).unwrap();assert!(norm(sub(q,map(p)))<1e-12);}
 #[test]fn stale_identity_topology_and_collapsed_pose_are_rejected(){let r=bind(BindRequest{positions:vec![[0.2,0.3,0.1]],body:body(),body_id:"figure".into(),maximum_distance:0.5}).unwrap();let b:Binding=serde_json::from_value(r["binding"].clone()).unwrap();assert!(place(PlaceRequest{binding:b.clone(),body:body(),body_id:"other".into()}).is_err());let mut t=body();t.triangles[0]=[1,0,2];assert!(place(PlaceRequest{binding:b.clone(),body:t,body_id:"figure".into()}).is_err());let mut t=body();t.positions[2]=t.positions[1];assert!(place(PlaceRequest{binding:b,body:t,body_id:"figure".into()}).is_err());}
}

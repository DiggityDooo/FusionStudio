mod edit;
mod contact;
mod cloth_contact;
mod surface_audit;
mod face_support;
mod fabric;
mod material;
mod material_solver;
mod material_sparse;
mod material_preconditioner;
mod placement;
#[cfg(test)]
mod garment_trace;
#[cfg(test)]
mod self_contact_tests;
// Original, bounded geometry/cloth foundation. Units are meters and seconds.
mod bvh;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
type V = [f64; 3];
fn sub(a:V,b:V)->V{[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
fn add(a:V,b:V)->V{[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
fn mul(a:V,s:f64)->V{[a[0]*s,a[1]*s,a[2]*s]}
fn dot(a:V,b:V)->f64{a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
fn norm(a:V)->f64{dot(a,a).sqrt()}
fn cross(a:V,b:V)->V{[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
fn valid(v:V)->bool{v.iter().all(|x|x.is_finite()&&x.abs()<=100.)}

#[derive(Deserialize)]
struct Mesh { positions:Vec<V>, faces:Vec<[usize;3]> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct Topology { half_edges:usize, edges:usize, boundary_edges:usize, twins:Vec<i32>, components:usize }
fn topology(mesh:&Mesh)->Result<Topology,String>{
 if mesh.positions.is_empty()||mesh.positions.len()>100000||mesh.faces.is_empty()||mesh.faces.len()>200000||!mesh.positions.iter().all(|v|valid(*v)){return Err("Mesh size or positions are invalid".into())}
 let mut edges:BTreeMap<(usize,usize),Vec<(usize,usize,usize)>>=BTreeMap::new();
 for (f,t) in mesh.faces.iter().enumerate(){
  if t.iter().any(|&v|v>=mesh.positions.len())||t[0]==t[1]||t[1]==t[2]||t[2]==t[0]{return Err("Invalid face indices".into())}
  if norm(cross(sub(mesh.positions[t[1]],mesh.positions[t[0]]),sub(mesh.positions[t[2]],mesh.positions[t[0]])))<1e-12{return Err("Degenerate triangle".into())}
  for i in 0..3{let a=t[i];let b=t[(i+1)%3];edges.entry((a.min(b),a.max(b))).or_default().push((f*3+i,a,b));}
 }
 let mut twins=vec![-1;mesh.faces.len()*3];let mut boundary=0;
 for e in edges.values(){match e.len(){1=>boundary+=1,2=>{if e[0].1==e[1].1{return Err("Inconsistent face winding".into())}twins[e[0].0]=e[1].0 as i32;twins[e[1].0]=e[0].0 as i32},_=>return Err("Non-manifold edge".into())}}
 let mut seen=vec![false;mesh.faces.len()];let mut components=0;
 for f in 0..seen.len(){if seen[f]{continue}components+=1;let mut pending=vec![f];seen[f]=true;while let Some(i)=pending.pop(){for h in i*3..i*3+3{if twins[h]>=0{let next=twins[h] as usize/3;if !seen[next]{seen[next]=true;pending.push(next)}}}}}
 Ok(Topology{half_edges:twins.len(),edges:edges.len(),boundary_edges:boundary,twins,components})
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Collider { center:V, axes:[V;3], radii:V, half_length:Option<f64>, #[serde(skip)] bounds:V }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Drape { #[serde(default)] fabric_material:Option<material::Material>, #[serde(default)] gravity:Option<V>, #[serde(default)] forces:Vec<material::Load>, #[serde(default)] seam_topology:bool, #[serde(default)] initialize_outside:bool, #[serde(default)] solid_contact:bool, #[serde(default)] triangle_collider:Option<contact::Surface>, #[serde(default)] material_coordinates:Option<Vec<[f64;2]>>, #[serde(default)] fabric_compliance:Option<[f64;3]>, #[serde(default)] friction:f64, #[serde(default)] triangle_self_collision:bool, positions:Vec<V>,rest_positions:Option<Vec<V>>,faces:Vec<[usize;3]>,sewing:Vec<[usize;2]>,pins:Vec<usize>,colliders:Vec<Collider>,steps:usize,iterations:usize,stretch:f64,bend:f64,thickness:f64,self_collision:bool }
struct Constraint{a:usize,b:usize,rest:f64,compliance:f64,lambda:f64}
fn constraint(a:usize,b:usize,p:&[V],compliance:f64)->Constraint{Constraint{a,b,rest:norm(sub(p[a],p[b])),compliance,lambda:0.}}
fn solve(c:&mut Constraint,p:&mut[V],w:&[f64],dt:f64){
 let d=sub(p[c.a],p[c.b]);let len=norm(d);let inv=w[c.a]+w[c.b];if len<1e-12||inv==0.{return}
 let alpha=c.compliance/(dt*dt);let dl=(-(len-c.rest)-alpha*c.lambda)/(inv+alpha);c.lambda+=dl;
 let correction=mul(d,dl/len);p[c.a]=add(p[c.a],mul(correction,w[c.a]));p[c.b]=sub(p[c.b],mul(correction,w[c.b]));
}
// Sewing duplicates remain distinct for UV/material/2D editing, but collision
// adjacency must see the same local topology as a welded sewn surface.
fn sewing_groups(n:usize,sewing:&[[usize;2]])->BTreeMap<usize,Vec<usize>>{
 fn root(parents:&mut[usize],mut i:usize)->usize{while parents[i]!=i{parents[i]=parents[parents[i]];i=parents[i];}i}
 let mut parents:Vec<_>=(0..n).collect();for &[a,b] in sewing{let a=root(&mut parents,a);let b=root(&mut parents,b);parents[a.max(b)]=a.min(b);}
 let mut groups:BTreeMap<usize,Vec<usize>>=BTreeMap::new();for i in 0..n{let r=root(&mut parents,i);groups.entry(r).or_default().push(i);}groups
}
fn sewn_exclusions(n:usize,original:&HashSet<(usize,usize)>,sewing:&[[usize;2]])->Result<HashSet<(usize,usize)>,String>{
 let groups=sewing_groups(n,sewing);let mut roots=vec![0;n];for (&r,g) in &groups{for &i in g{roots[i]=r;}}
 let mut pairs=HashSet::new();for &(a,b) in original{let a=roots[a];let b=roots[b];if a!=b{pairs.insert((a.min(b),a.max(b)));}}
 let count=groups.values().map(|g|g.len()*(g.len()-1)/2).sum::<usize>()+pairs.iter().map(|(a,b)|groups[a].len()*groups[b].len()).sum::<usize>();if count>2_000_000{return Err("Sewn collision adjacency exceeds its two-million-pair budget. Simplify sewing junctions.".into())}
 let mut result=HashSet::with_capacity(count);for g in groups.values(){for i in 0..g.len(){for j in i+1..g.len(){result.insert((g[i],g[j]));}}}for (a,b) in pairs{for &i in &groups[&a]{for &j in &groups[&b]{result.insert((i.min(j),i.max(j)));}}}Ok(result)
}
fn penetration(p:V,c:&Collider,thickness:f64)->Option<V>{
 let d=sub(p,c.center);if d[0].abs()>c.bounds[0]+thickness||d[1].abs()>c.bounds[1]+thickness||d[2].abs()>c.bounds[2]+thickness{return None}
 let q=[dot(d,c.axes[0]),dot(d,c.axes[1]),dot(d,c.axes[2])];
 if let Some(half)=c.half_length{
  let center=[0.,q[1].clamp(-half,half),0.];let delta=sub(q,center);let distance=norm(delta);let radius=c.radii[0]+thickness;if distance>=radius{return None}
  let local=add(center,if distance>1e-9{mul(delta,radius/distance)}else{[0.,0.,radius]});
  return Some(add(c.center,add(add(mul(c.axes[0],local[0]),mul(c.axes[1],local[1])),mul(c.axes[2],local[2]))));
 }
 let radii=c.radii.map(|r|r+thickness);let distance=((q[0]/radii[0]).powi(2)+(q[1]/radii[1]).powi(2)+(q[2]/radii[2]).powi(2)).sqrt();
 if distance>=1.{return None}
 let local=if distance>1e-9{mul(q,1./distance)}else{[0.,0.,radii[2]]};
 Some(add(c.center,add(add(mul(c.axes[0],local[0]),mul(c.axes[1],local[1])),mul(c.axes[2],local[2]))))
}
fn project_point(mut p:V,colliders:&[Collider],tree:&bvh::Bvh,thickness:f64)->(V,usize){
 let mut out=[0;160];let mut first=0;let mut contacts=0;
 loop{let count=tree.query(p,thickness*2.,first,&mut out);let mut changed=false;
  for &i in &out[..count]{if let Some(next)=penetration(p,&colliders[i],thickness){p=next;contacts+=1;first=i+1;changed=true;break}}
  if !changed{break}
 }
 (p,contacts)
}
fn drape(mut req:Drape)->Result<serde_json::Value,String>{
 let topo=topology(&Mesh{positions:req.positions.clone(),faces:req.faces.clone()})?;
 let n=req.positions.len();
 if n>60000||req.faces.len()>100000||req.steps<1||req.steps>240||req.iterations<1||req.iterations>24||req.colliders.len()>160||req.sewing.len()>4000||req.pins.len()>n||req.pins.iter().any(|&i|i>=n)||req.sewing.iter().any(|e|e[0]>=n||e[1]>=n||e[0]==e[1]){return Err("Cloth request exceeds supported limits".into())}
 if (n+req.faces.len()*3)*req.steps*req.iterations*req.colliders.len().max(1)>600_000_000{return Err("Cloth work budget exceeded; reduce density or steps".into())}
 if !req.stretch.is_finite()||req.stretch<0.||req.stretch>0.01||!req.bend.is_finite()||req.bend<0.||req.bend>1.||!req.thickness.is_finite()||req.thickness<0.001||req.thickness>0.02{return Err("Invalid cloth settings".into())}
 for c in &req.colliders{if !valid(c.center)||c.radii.iter().any(|r|!r.is_finite()||*r<0.001||*r>10.)||c.axes.iter().any(|a|!valid(*a)||(norm(*a)-1.).abs()>1e-5)||dot(c.axes[0],c.axes[1]).abs()>1e-5||dot(c.axes[0],c.axes[2]).abs()>1e-5||dot(c.axes[1],c.axes[2]).abs()>1e-5{return Err("Invalid collision proxy".into())}}
 for c in &mut req.colliders{if c.half_length.is_some_and(|h|!h.is_finite()||h<0.||h>10.){return Err("Invalid capsule length".into())}for i in 0..3{c.bounds[i]=if let Some(h)=c.half_length{c.axes[1][i].abs()*h+c.radii[0]}else{((c.axes[0][i]*c.radii[0]).powi(2)+(c.axes[1][i]*c.radii[1]).powi(2)+(c.axes[2][i]*c.radii[2]).powi(2)).sqrt()};}}
 let tree=bvh::Bvh::new(req.colliders.iter().map(|c|bvh::Bounds{min:sub(c.center,c.bounds),max:add(c.center,c.bounds)}).collect());
 let rest=req.rest_positions.unwrap_or_else(||req.positions.clone());if rest.len()!=n||!rest.iter().all(|v|valid(*v)){return Err("Invalid cloth rest positions".into())}
 if !req.friction.is_finite()||!(0.0..=1.0).contains(&req.friction){return Err("Friction must be between zero and one".into())}
 let contact_tree=if let Some(s)=&req.triangle_collider{contact::validate(s)?;Some(contact::Tree::new(s))}else{None};
 if (req.solid_contact||req.initialize_outside)&&req.triangle_collider.as_ref().map_or(true,|s|s.positions.is_empty()||s.triangles.is_empty()){return Err("Solid contact and outside placement require a nonempty triangle collider".into())}
 let physical=req.fabric_material.as_ref();if let Some(m)=physical{m.validate()?;if (n+req.faces.len()*3).saturating_mul(req.steps).saturating_mul(req.iterations).saturating_mul(m.linear_iterations)>4_000_000_000usize{return Err("Physical material work budget exceeded; reduce density, steps or solve iterations".into())}if req.pins.iter().copied().collect::<HashSet<_>>().len()!=req.pins.len(){return Err("Physical pins must be unique".into())}if req.material_coordinates.is_none(){return Err("Physical fabric requires metre-scale material coordinates".into())}}
 if physical.is_none()&&(req.gravity.is_some()||!req.forces.is_empty()){return Err("Gravity/force controls require an explicit physical fabric model".into())}
 let gravity=req.gravity.unwrap_or([0.,-9.81,0.]);if gravity.iter().any(|v|!v.is_finite()||v.abs()>100.)||req.forces.len()>n{return Err("Invalid physical gravity or force budget".into())}
 let mut loads=vec![[0.;3];n];let mut loaded=HashSet::new();let mut force_total=0.;for f in &req.forces{if f.vertex>=n||!loaded.insert(f.vertex)||f.force.iter().any(|v|!v.is_finite()||v.abs()>1000.){return Err("Physical forces need unique valid vertices and finite components up to 1000 N".into())}force_total+=norm(f.force);loads[f.vertex]=f.force;}if force_total>10000.{return Err("Physical external forces exceed 10,000 N".into())}
 let surface_mass=if let Some(m)=physical{Some(material::surface_mass(&rest,&req.faces,m.density_kg_m2)?)}else{None};
 let mut fabric=Vec::new();let compliance=req.fabric_compliance.unwrap_or([req.stretch,req.stretch,req.stretch*2.]);if compliance.iter().any(|v|!v.is_finite()||*v<0.||*v>1.){return Err("Invalid directional fabric compliance".into())}
 if let Some(uv)=&req.material_coordinates{if uv.len()!=n||uv.iter().flatten().any(|v|!v.is_finite()){return Err("Invalid material coordinates".into())}for &t in &req.faces{let triangle=fabric::FabricTriangle::new(t,uv)?;if physical.is_some()&&triangle.sample(&rest).0.iter().any(|v|!v.is_finite()||v.abs()>1e-4){return Err("Physical rest geometry and metre-scale grain coordinates disagree. Apply uniform scale to both rest and grain coordinates".into())}fabric.push(triangle);}}
 let started=std::time::Instant::now();let mut initial=req.positions;let mut placement_adjustments=0;
 if req.initialize_outside{if let (Some(surface),Some(tree))=(&req.triangle_collider,&contact_tree){for point in &mut initial{let(next,hit)=contact::solid_project(*point,surface,tree,req.thickness);if hit{*point=next;placement_adjustments+=1;}}}}
 let mut p=initial.clone();let mut velocities=vec![[0.;3];n];let mut w=surface_mass.as_ref().map_or_else(||vec![1.;n],|m|m.masses.iter().map(|v|1./v).collect());for &pin in &req.pins{w[pin]=0.}
 let mut structural=Vec::new();let mut bending=Vec::new();let mut hinges=Vec::new();
 for h in 0..topo.half_edges{let t=req.faces[h/3];let i=h%3;let twin=topo.twins[h];if twin>=0&&(twin as usize)<h{continue}structural.push(constraint(t[i],t[(i+1)%3],&rest,req.stretch));if twin>=0{let j=twin as usize;bending.push(constraint(t[(i+2)%3],req.faces[j/3][(j%3+2)%3],&rest,req.bend));if let Some(m)=physical{hinges.push(material::Hinge::new([t[i],t[(i+1)%3],t[(i+2)%3],req.faces[j/3][(j%3+2)%3]],&rest,m.bending_nm)?);}}}
 let seam_compliances=if let Some(m)=physical{material::seam_compliances(&rest,&req.faces,&topo,&req.sewing,m.seam_npm2)?}else{vec![1e-9;req.sewing.len()]};
 let mut seams:Vec<_>=req.sewing.iter().zip(seam_compliances).map(|(e,c)|constraint(e[0],e[1],&p,c)).collect();
 let mut sparse_fallback=None;
 let mut sparse_solver=if let Some(m)=physical{if m.linear_solver==material::LinearSolver::Pcg{None}else{match material_sparse::SparseSolver::new(n,&fabric,&hinges,&seams){Ok(s)=>Some(s),Err(e)=>{if m.linear_solver==material::LinearSolver::Sparse{return Err(e)}sparse_fallback=Some(e);None}}}}else{None};
 let seam_rest:Vec<_>=seams.iter().map(|c|c.rest).collect();
 let excluded:HashSet<_>=structural.iter().chain(bending.iter()).chain(seams.iter()).map(|c|(c.a.min(c.b),c.a.max(c.b))).collect();
 let excluded=if req.seam_topology{sewn_exclusions(n,&excluded,&req.sewing)?}else{excluded};
 let cloth_edges:Vec<_>=structural.iter().map(|e|[e.a,e.b]).collect();
 let sewn_roots=cloth_contact::root_map(n,&req.sewing,req.seam_topology);
 let mut linear_iterations=0usize;let mut linear_residual=0f64;let mut linear_absolute_residual=0f64;let mut stalled_projections=0usize;let mut contact_active_set_iterations=0usize;let mut unconverged_contact_sets=0usize;
 let dt=physical.map_or(1./120.,|m|m.time_step);let damping=physical.map_or(0.98,|m|(-m.damping_per_second*dt).exp());let mut contacts=0usize;let mut face_contacts=0usize;
 let mut face_supports=face_support::Supports::new();
 let mut support_cache=material_solver::SupportCache::new(n);let mut warm_starts=0usize;let mut cold_restarts=0usize;
 let mut motion_trace=None;let mut phase_times=[0f64;5];
 #[cfg(test)] let mut stage_trace=garment_trace::Trace::new();
 for step in 0..req.steps{
  if physical.is_some()&&step+1==req.steps{motion_trace=Some(material::MotionTrace::new(&p));}
  for (i,c) in seams.iter_mut().enumerate(){c.rest=seam_rest[i]*(1.-((step+1) as f64/40.).min(1.));}
  let old=p.clone();for i in 0..n{if w[i]>0.{if let Some(m)=&surface_mass{velocities[i]=add(mul(velocities[i],damping),mul(add(gravity,mul(loads[i],1./m.masses[i])),dt));}else{velocities[i][1]-=9.81*dt;velocities[i]=mul(velocities[i],damping);}p[i]=add(p[i],mul(velocities[i],dt));}}
  let predicted=if physical.is_some(){p.clone()}else{Vec::new()};if physical.is_some(){p.clone_from(&old);}
  for t in &mut fabric{t.reset();}
  for c in structural.iter_mut().chain(bending.iter_mut()).chain(seams.iter_mut()){c.lambda=0.;}
  for iteration in 0..req.iterations{
   // Throttling contact work must never skip the final constraint projection.
   // Otherwise changing the iteration count can leave the last fabric solve
   // inside a body or cloth layer until a timestep that will never run.
   let contact_pass=iteration%3==0||iteration+1==req.iterations;
   #[cfg(test)] stage_trace.record("before constraints",step,iteration,req.iterations,&p,&structural);
   let mut phase_started=std::time::Instant::now();
   if let (Some(m),Some(mass))=(physical,&surface_mass){let normals:Vec<_>=p.iter().map(|&v|if v[1]<=req.thickness+1e-7{Some([0.,1.,0.])}else if let (Some(s),Some(t))=(&req.triangle_collider,&contact_tree){contact::support_normal(v,s,t,req.thickness)}else{None}).collect();if let Some(body)=&req.triangle_collider{face_supports.prune(&p,body,req.thickness);}let contact_planes=face_supports.list();let solved=material_solver::project_cached(&mut p,&predicted,&w,mass,dt,&fabric,m,&hinges,&seams,&normals,&contact_planes,sparse_solver.as_mut(),Some(&mut support_cache))?;if solved.warm_start{warm_starts+=1;}cold_restarts+=solved.cold_restarts;linear_iterations+=solved.linear_iterations;contact_active_set_iterations+=solved.active_set_iterations;if !solved.active_set_converged{unconverged_contact_sets+=1;}linear_residual=solved.relative_residual;linear_absolute_residual=solved.absolute_residual;if solved.stalled{stalled_projections+=1;}}else{if fabric.is_empty(){for c in &mut structural{solve(c,&mut p,&w,dt)}}else{for t in &mut fabric{t.solve(&mut p,&w,compliance,dt)}}for c in &mut bending{solve(c,&mut p,&w,dt)}for c in &mut seams{solve(c,&mut p,&w,dt)}}
   if physical.is_some(){phase_times[0]+=phase_started.elapsed().as_secs_f64()*1000.;phase_started=std::time::Instant::now();}
   if let Some(trace)=&mut motion_trace{trace.record(0,&p);}
   #[cfg(test)] stage_trace.record("material bend seams",step,iteration,req.iterations,&p,&structural);
   for i in 0..n{if w[i]==0.{continue}let(next,count)=project_point(p[i],&req.colliders,&tree,req.thickness);p[i]=next;contacts+=count;if p[i][1]<req.thickness{p[i][1]=req.thickness;}}
   // Include triangle interiors: vertex-only tests miss a torso passing through a face.
   for t in &req.faces{
    let inv=w[t[0]]+w[t[1]]+w[t[2]];if inv==0.{continue}
    let center=mul(add(add(p[t[0]],p[t[1]]),p[t[2]]),1./3.);let(next,count)=project_point(center,&req.colliders,&tree,req.thickness);if count>0{let delta=mul(sub(next,center),3./inv);for &i in t{p[i]=add(p[i],mul(delta,w[i]));}contacts+=count;}
   }
   for e in &structural{let inv=w[e.a]+w[e.b];if inv==0.{continue}let center=mul(add(p[e.a],p[e.b]),0.5);let(next,count)=project_point(center,&req.colliders,&tree,req.thickness);if count>0{let delta=mul(sub(next,center),2./inv);p[e.a]=add(p[e.a],mul(delta,w[e.a]));p[e.b]=add(p[e.b],mul(delta,w[e.b]));contacts+=count;}}
   if physical.is_some(){phase_times[1]+=phase_started.elapsed().as_secs_f64()*1000.;phase_started=std::time::Instant::now();}
   #[cfg(test)] stage_trace.record("floor and proxies",step,iteration,req.iterations,&p,&structural);
   if let (Some(surface),Some(tree))=(&req.triangle_collider,&contact_tree){for i in 0..n{if w[i]>0.{let(next,count)=if physical.is_some(){contact::project_physical(old[i],p[i],surface,tree,req.thickness,req.friction)}else{contact::project(old[i],p[i],surface,tree,req.thickness,req.friction)};p[i]=next;contacts+=count;}}}
   if physical.is_some(){phase_times[2]+=phase_started.elapsed().as_secs_f64()*1000.;phase_started=std::time::Instant::now();}
   if let Some(trace)=&mut motion_trace{trace.record(1,&p);}
   #[cfg(test)] stage_trace.record("body vertices",step,iteration,req.iterations,&p,&structural);
   if req.solid_contact&&contact_pass{if let (Some(surface),Some(tree))=(&req.triangle_collider,&contact_tree){if physical.is_some(){face_supports.discover(&p,&req.faces,surface,tree,req.thickness)?;}face_contacts+=if physical.is_some(){contact::project_physical_faces(&mut p,&req.faces,&w,surface,tree,req.thickness)}else{contact::project_faces(&mut p,&req.faces,&w,surface,tree,req.thickness)};}}
   if physical.is_some(){phase_times[3]+=phase_started.elapsed().as_secs_f64()*1000.;phase_started=std::time::Instant::now();}
   if let Some(trace)=&mut motion_trace{trace.record(2,&p);}
   #[cfg(test)] stage_trace.record("body faces",step,iteration,req.iterations,&p,&structural);
   if req.triangle_self_collision&&iteration+1==req.iterations{contacts+=contact::self_project_faces(&mut p,&old,&req.faces,&w,&sewn_roots,req.thickness*2.)?;}
   if req.triangle_self_collision&&contact_pass{contacts+=contact::self_project(&mut p,&old,&req.faces,&w,req.thickness*2.,&excluded);contacts+=contact::edge_project(&mut p,&old,&cloth_edges,&w,req.thickness*2.,&excluded);}
   // Vertex separation is a preview approximation, not triangle-level self collision.
   if req.self_collision&&contact_pass{
    let cell=req.thickness*2.;let key=|v:V|[(v[0]/cell).floor() as i32,(v[1]/cell).floor() as i32,(v[2]/cell).floor() as i32];let mut hash:HashMap<[i32;3],Vec<usize>>=HashMap::new();
    for i in 0..n{let k=key(p[i]);for x in -1..=1{for y in -1..=1{for z in -1..=1{if let Some(list)=hash.get(&[k[0]+x,k[1]+y,k[2]+z]){for &j in list{if excluded.contains(&(j,i)){continue}let d=sub(p[i],p[j]);let len=norm(d);let inv=w[i]+w[j];if len>1e-8&&len<cell&&inv>0.{let shift=mul(d,(cell-len)/len/inv);p[i]=add(p[i],mul(shift,w[i]));p[j]=sub(p[j],mul(shift,w[j]));}}}}}}hash.entry(k).or_default().push(i);
    }
   }
   if physical.is_some(){phase_times[4]+=phase_started.elapsed().as_secs_f64()*1000.;}
   if let Some(trace)=&mut motion_trace{trace.record(3,&p);}
   #[cfg(test)] stage_trace.record("self contacts",step,iteration,req.iterations,&p,&structural);
  }
  for i in 0..n{velocities[i]=mul(sub(p[i],old[i]),1./dt);if !valid(p[i]){return Err("Cloth diverged; reduce pattern strain".into())}}
 }
 let cloth_contact=if physical.is_some()||req.triangle_self_collision{Some(cloth_contact::inspect(&p,&req.faces,&sewn_roots,&excluded,req.thickness*2.,2_000_000))}else{None};
 let mean_gap=|pos:&[V]|->f64{if seams.is_empty(){0.}else{seams.iter().map(|c|norm(sub(pos[c.a],pos[c.b]))).sum::<f64>()/seams.len() as f64}};
 let strain:Vec<f64>=structural.iter().map(|c|(norm(sub(p[c.a],p[c.b]))/c.rest-1.).abs()).collect();
 let triangle_penetrations=if let (Some(s),Some(t))=(&req.triangle_collider,&contact_tree){contact::penetrations(&p,s,t,req.thickness)}else{0};
 let body_inside_vertices=if req.solid_contact{if let (Some(s),Some(t))=(&req.triangle_collider,&contact_tree){p.iter().filter(|&&p|t.inside(p,s)).count()}else{0}}else{0};
 let penetrations=p.iter().filter(|v|req.colliders.iter().any(|c|penetration(**v,c,0.).is_some())).count();
 let body_face_intersections=if let (Some(s),Some(t))=(&req.triangle_collider,&contact_tree){contact::face_intersections(&p,&req.faces,s,t)}else{0};
 let mut output=serde_json::json!({"positions":p,"topology":topo,"metrics":{"milliseconds":started.elapsed().as_secs_f64()*1000.,"vertices":n,"triangles":req.faces.len(),"seamGapBefore":mean_gap(&initial),"seamGapAfter":mean_gap(&p),"maxStrain":strain.iter().copied().fold(0.,f64::max),"meanStrain":strain.iter().sum::<f64>()/strain.len().max(1) as f64,"proxyPenetrations":penetrations,"triangleClearanceViolations":triangle_penetrations,"bodyFaceIntersections":body_face_intersections,"bodyInsideVertices":body_inside_vertices,"solidContact":req.solid_contact,"seamTopology":req.seam_topology,"collisionExcludedPairs":excluded.len(),"placementAdjustments":placement_adjustments,"faceContacts":face_contacts,"triangleContact":req.triangle_collider.is_some(),"triangleSelfCollision":req.triangle_self_collision,"directionalFabric":!fabric.is_empty(),"contacts":contacts,"pinDrift":req.pins.iter().map(|&i|norm(sub(p[i],initial[i]))).fold(0.,f64::max)},"solver":"Fusion Rust XPBD preview 1"});
 if let Some(audit)=cloth_contact{output["metrics"]["clothContact"]=serde_json::to_value(audit).map_err(|e|e.to_string())?;}
 if let (Some(m),Some(mass))=(physical,&surface_mass){let mut forces:Vec<_>=mass.masses.iter().zip(&loads).map(|(&weight,&f)|add(mul(gravity,weight),f)).collect();let mut energy=0.;let mut maximum_strain=[0f64;3];for (i,t) in fabric.iter().enumerate(){energy+=t.add_forces(&p,mass.areas[i],m.stiffness(),&mut forces);let(e,_)=t.sample(&p);for k in 0..3{maximum_strain[k]=maximum_strain[k].max(e[k].abs());}}let bending_energy=hinges.iter().map(|h|h.energy(&p)).sum::<f64>();for h in &hinges{h.add_forces(&p,&mut forces);}let mut seam_energy=0.;for c in &seams{let d=sub(p[c.a],p[c.b]);let len=norm(d);if len>1e-12{let f=mul(d,-(len-c.rest)/(c.compliance*len));forces[c.a]=add(forces[c.a],f);forces[c.b]=sub(forces[c.b],f);}seam_energy+=0.5*(len-c.rest).powi(2)/c.compliance;}
 let reaction=req.pins.iter().map(|&i|mul(forces[i],-1.)).fold([0.;3],add);let residual=(0..n).filter(|&i|w[i]>0.).map(|i|norm(forces[i])).fold(0.,f64::max);let kinetic=0.5*(0..n).map(|i|mass.masses[i]*dot(velocities[i],velocities[i])).sum::<f64>();let speed=velocities.iter().map(|&v|norm(v)).fold(0.,f64::max);
 output["solver"]=serde_json::json!("Fusion Rust surface energy 1");output["metrics"]["physicalFabric"]=serde_json::json!({"version":1,"supportWarmStarts":warm_starts,"supportColdRestarts":cold_restarts,"phaseMilliseconds":{"materialAndSupports":phase_times[0],"floorAndProxies":phase_times[1],"bodyVertexContact":phase_times[2],"bodyFaceContact":phase_times[3],"selfContact":phase_times[4]},"restAreaM2":mass.area,"massKg":mass.mass,"membraneEnergyJ":energy,"bendingEnergyJ":bending_energy,"seamEnergyJ":seam_energy,"kineticEnergyJ":kinetic,"maximumSpeedMps":speed,"maximumDirectionalStrain":maximum_strain,"pinnedReactionN":reaction,"maximumFreeForceResidualN":residual,"forceResidualIncludesContacts":false,"timeStep":dt,"simulationSeconds":dt*req.steps as f64,"calibrated":false,"linearIterations":linear_iterations,"linearSolver":if sparse_solver.is_some(){"sparse-cholesky"}else{"pcg"},"sparseFallback":sparse_fallback,"sparseFactorizationKind":sparse_solver.as_ref().map(|s|s.factorization_kind),"sparsePhaseMilliseconds":sparse_solver.as_ref().map(|s|serde_json::json!({"assembly":s.phase_milliseconds[0],"factorization":s.phase_milliseconds[1],"substitution":s.phase_milliseconds[2]})),"sparseFactorizations":sparse_solver.as_ref().map_or(0,|s|s.factorizations),"sparseRefinements":sparse_solver.as_ref().map_or(0,|s|s.refinements),"sparseWorkspaceBytes":sparse_solver.as_ref().map_or(0,|s|s.workspace_bytes),"lastLinearRelativeResidual":linear_residual,"lastLinearAbsoluteResidualN":linear_absolute_residual,"stalledProjections":stalled_projections,"contactActiveSetIterations":contact_active_set_iterations,"unconvergedContactSets":unconverged_contact_sets,"retainedFaceContacts":face_supports.list().len(),"bodyContactPenaltyEnergyJ":face_supports.energy(&p,m.contact_npm),"lastStepMotion":motion_trace.as_ref().map(|trace|trace.summary(&p,&velocities))});}
 Ok(output)
}
#[napi]
pub fn analyze_mesh(json:String)->napi::Result<String>{let mesh:Mesh=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=topology(&mesh).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}
#[napi]
pub fn drape_garment(json:String)->napi::Result<String>{if json.len()>32_000_000{return Err(napi::Error::from_reason("Cloth payload too large"))}let req:Drape=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=drape(req).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}

#[napi]
pub fn audit_cloth_contacts(json:String)->napi::Result<String>{if json.len()>32_000_000{return Err(napi::Error::from_reason("Cloth inspection payload too large"))}let q:cloth_contact::Request=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=cloth_contact::run(q).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}
#[napi]
pub fn audit_surface_contacts(json:String)->napi::Result<String>{if json.len()>64_000_000{return Err(napi::Error::from_reason("Surface inspection payload too large"))}let q:surface_audit::Request=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=surface_audit::run(q).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}
#[napi]
pub fn bind_garment(json:String)->napi::Result<String>{if json.len()>64_000_000{return Err(napi::Error::from_reason("Placement payload too large"))}let req:placement::BindRequest=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=placement::bind(req).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}
#[napi]
pub fn place_garment(json:String)->napi::Result<String>{if json.len()>64_000_000{return Err(napi::Error::from_reason("Placement payload too large"))}let req:placement::PlaceRequest=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let result=placement::place(req).map_err(napi::Error::from_reason)?;serde_json::to_string(&result).map_err(|e|napi::Error::from_reason(e.to_string()))}

#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn open_quad(){let t=topology(&Mesh{positions:vec![[0.,0.,0.],[1.,0.,0.],[1.,1.,0.],[0.,1.,0.]],faces:vec![[0,1,2],[0,2,3]]}).unwrap();assert_eq!((t.edges,t.boundary_edges,t.components),(5,4,1));assert_eq!(t.twins[2],3);}
 #[test] fn rejects_winding(){assert!(topology(&Mesh{positions:vec![[0.,0.,0.],[1.,0.,0.],[1.,1.,0.],[0.,1.,0.]],faces:vec![[0,1,2],[0,3,2]]}).is_err());}
 #[test]fn sewn_topology_keeps_local_adjacency_and_unrelated_layers_separate(){let base=HashSet::from([(0,1),(1,2),(3,4)]);let mask=sewn_exclusions(6,&base,&[[0,3]]).unwrap();for p in [(0,3),(1,3),(0,4),(3,4),(1,2)]{assert!(mask.contains(&p));}for p in [(0,2),(0,5),(1,5),(2,4)]{assert!(!mask.contains(&p));}assert_eq!(sewn_exclusions(6,&base,&[]).unwrap(),base);let sewing:Vec<_>=(1..3000).map(|i|[0,i]).collect();assert!(sewn_exclusions(3000,&HashSet::new(),&sewing).is_err());}
}

#[napi]
pub fn edit_mesh(json:String)->napi::Result<String>{if json.len()>96_000_000{return Err(napi::Error::from_reason("Mesh payload exceeds the 96 MB edit limit"))}let q:edit::Edit=serde_json::from_str(&json).map_err(|e|napi::Error::from_reason(e.to_string()))?;let out=edit::run(q).map_err(napi::Error::from_reason)?;serde_json::to_string(&out).map_err(|e|napi::Error::from_reason(e.to_string()))}

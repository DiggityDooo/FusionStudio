//! Gauss–Newton projection of inertia + integrated fabric energy.
//! Sparse Cholesky or PCG solves the same coupled strain Hessian approximation;
//! an energy line search prevents accepting an uphill elastic update.
use super::*;
pub(super) struct Term {pub ids:[usize;4],pub g:[V;4],pub len:usize,pub k:f64,pub value:f64}
impl Term {fn dot(&self,v:&[V])->f64{(0..self.len).map(|i|dot(self.g[i],v[self.ids[i]])).sum()}}
fn elastic(p:&[V],fabric:&[fabric::FabricTriangle],mass:&material::SurfaceMass,m:&material::Material,hinges:&[material::Hinge],seams:&[Constraint])->f64{
 let stiffness=m.stiffness();let mut energy=0.;for (i,t) in fabric.iter().enumerate(){let(e,_)=t.sample(p);energy+=0.5*mass.areas[i]*(0..3).map(|k|stiffness[k]*e[k]*e[k]).sum::<f64>();}energy+=hinges.iter().map(|h|h.energy(p)).sum::<f64>();energy+=seams.iter().map(|c|0.5*(norm(sub(p[c.a],p[c.b]))-c.rest).powi(2)/c.compliance).sum::<f64>();energy
}
fn total_energy(p:&[V],target:&[V],w:&[f64],mass:&material::SurfaceMass,dt:f64,fabric:&[fabric::FabricTriangle],m:&material::Material,hinges:&[material::Hinge],seams:&[Constraint],contacts:&[face_support::Plane])->f64{contacts.iter().map(|c|c.energy(p,m.contact_npm)).sum::<f64>()+elastic(p,fabric,mass,m,hinges,seams)+(0..p.len()).filter(|&i|w[i]>0.).map(|i|mass.masses[i]*dot(sub(p[i],target[i]),sub(p[i],target[i]))/(2.*dt*dt)).sum::<f64>()}
pub struct Solve {pub linear_iterations:usize,pub relative_residual:f64,pub absolute_residual:f64,pub stalled:bool,pub active_set_converged:bool,pub active_set_iterations:usize,pub warm_start:bool,pub cold_restarts:usize}
// Request-local initial guesses only. Every reused support is rechecked against
// the current coupled step/reaction; topology and project data never enter here.
pub struct SupportCache {states:Vec<Option<bool>>}
impl SupportCache {pub fn new(n:usize)->Self{Self{states:vec![None;n]}}}
#[cfg(test)]
pub fn project(p:&mut[V],target:&[V],w:&[f64],mass:&material::SurfaceMass,dt:f64,fabric:&[fabric::FabricTriangle],m:&material::Material,hinges:&[material::Hinge],seams:&[Constraint],contact_normals:&[Option<V>],contacts:&[face_support::Plane],mut sparse:Option<&mut material_sparse::SparseSolver>)->Result<Solve,String>{
 project_cached(p,target,w,mass,dt,fabric,m,hinges,seams,contact_normals,contacts,sparse.as_deref_mut(),None)
}
pub fn project_cached(p:&mut[V],target:&[V],w:&[f64],mass:&material::SurfaceMass,dt:f64,fabric:&[fabric::FabricTriangle],m:&material::Material,hinges:&[material::Hinge],seams:&[Constraint],contact_normals:&[Option<V>],contacts:&[face_support::Plane],mut sparse:Option<&mut material_sparse::SparseSolver>,mut cache:Option<&mut SupportCache>)->Result<Solve,String>{
 let n=p.len();let mut terms=Vec::with_capacity(fabric.len()*3+hinges.len()+seams.len());let stiffness=m.stiffness();
 for (j,t) in fabric.iter().enumerate(){let(e,g)=t.sample(p);for k in 0..3{terms.push(Term{ids:[t.ids[0],t.ids[1],t.ids[2],0],g:[g[k][0],g[k][1],g[k][2],[0.;3]],len:3,k:mass.areas[j]*stiffness[k],value:e[k]});}}
 for h in hinges{if let Some((value,g,k))=h.term(p){terms.push(Term{ids:h.ids,g,len:4,k,value});}}
 for c in seams{let d=sub(p[c.a],p[c.b]);let length=norm(d);if c.rest<=1e-12{for axis in 0..3{let mut g=[0.;3];g[axis]=1.;terms.push(Term{ids:[c.a,c.b,0,0],g:[g,mul(g,-1.),[0.;3],[0.;3]],len:2,k:1./c.compliance,value:d[axis]});}}else if length>1e-12{let g=mul(d,1./length);terms.push(Term{ids:[c.a,c.b,0,0],g:[g,mul(g,-1.),[0.;3],[0.;3]],len:2,k:1./c.compliance,value:length-c.rest});}}
 for c in contacts{let value=c.value(p);if value<0.{terms.push(Term{ids:[c.ids[0],c.ids[1],c.ids[2],0],g:[mul(c.normal,c.bary[0]),mul(c.normal,c.bary[1]),mul(c.normal,c.bary[2]),[0.;3]],len:3,k:m.contact_npm,value});}}
 let inertia:Vec<_>=mass.masses.iter().map(|v|v/(dt*dt)).collect();let mut gradient:Vec<_>=(0..n).map(|i|mul(sub(p[i],target[i]),inertia[i])).collect();
 for t in &terms{for j in 0..t.len{let i=t.ids[j];gradient[i]=add(gradient[i],mul(t.g[j],t.k*t.value));}}
 // Solve a bounded active set of unilateral tangent planes. The local
 // gradient alone cannot decide support: coupled seam/stretch forces can
 // drive an apparently separating particle into contact. Check the solved
 // step and its normal reaction before accepting each active set.
 let product=|v:&[V]|{let mut out:Vec<_>=(0..n).map(|i|mul(v[i],inertia[i])).collect();for t in &terms{let value=t.k*t.dot(v);for j in 0..t.len{let i=t.ids[j];out[i]=add(out[i],mul(t.g[j],value));}}out};
 let inner=|a:&[V],b:&[V]|a.iter().zip(b).map(|(&a,&b)|dot(a,b)).sum::<f64>();
 let cold_active:Vec<_>=(0..n).map(|i|w[i]>0.&&contact_normals.get(i).copied().flatten().is_some_and(|normal|dot(gradient[i],normal)>0.)).collect();
 let mut active=cold_active.clone();if let Some(c)=cache.as_deref(){if c.states.len()==n{for i in 0..n{if w[i]>0.&&contact_normals.get(i).copied().flatten().is_some(){if let Some(previous)=c.states[i]{active[i]=previous;}}}}}
 let warm_start=active!=cold_active;let mut cold_restarts=0;
 let mut delta=vec![[0.;3];n];let mut iterations=0;let mut relative=0.;let mut absolute=0.;let mut active_set_converged=false;let mut active_set_iterations=0;let mut projected_gradient_norm=0.;
 // Coupled contact release can propagate across several connected particles.
 // Eight bounded passes cover the manufactured seven-particle release chain;
 // exhaustion remains an explicit failed diagnostic, never a silent success.
 for pass in 0..(if warm_start{16}else{8}){
  // A poor reused guess cannot consume the cold solve's eight-pass budget.
  if pass==8{active.clone_from(&cold_active);cold_restarts=1;}
  active_set_iterations=pass+1;
  let supports:Vec<_>=(0..n).map(|i|if active[i]{contact_normals[i]}else{None}).collect();
  let filter=|i:usize,v:V|{if w[i]==0.{[0.;3]}else if active[i]{let normal=contact_normals[i].unwrap();sub(v,mul(normal,dot(v,normal)))}else{v}};
  let project=|v:Vec<V>|v.into_iter().enumerate().map(|(i,v)|filter(i,v)).collect::<Vec<V>>();
  let mut residual:Vec<_>=(0..n).map(|i|filter(i,mul(gradient[i],-1.))).collect();let rhs_norm=inner(&residual,&residual).sqrt();projected_gradient_norm=rhs_norm;delta.fill([0.;3]);
  if rhs_norm>=m.linear_absolute_tolerance_n{
   if let Some(solver)=sparse.as_deref_mut(){
    solver.factorize(&inertia,w,&terms,&supports)?;delta=project(solver.solve(&residual)?);iterations+=1;
    // Report the independently recomputed projected H*delta + gradient.
    // Bounded iterative refinement uses the same factor, never looser gates.
    for refinement in 0..=3{let reaction=product(&delta);residual=(0..n).map(|i|filter(i,mul(add(gradient[i],reaction[i]),-1.))).collect();absolute=inner(&residual,&residual).sqrt();relative=absolute/rhs_norm;if relative<=m.linear_tolerance||absolute<=m.linear_absolute_tolerance_n||refinement==3{break}let correction=project(solver.solve(&residual)?);for i in 0..n{delta[i]=add(delta[i],correction[i]);}iterations+=1;solver.refinements+=1;}
   }else{
   let blocks=material_preconditioner::Preconditioner::new(&inertia,w,&terms,seams,&supports,contacts);
   let mut z=project(blocks.apply(&residual));let mut direction=z.clone();let mut rz=inner(&residual,&z);
   for _ in 0..m.linear_iterations{let a=project(product(&direction));let denominator=inner(&direction,&a);if !denominator.is_finite()||denominator<=1e-30{break}let step=rz/denominator;for i in 0..n{delta[i]=add(delta[i],mul(direction[i],step));residual[i]=sub(residual[i],mul(a[i],step));}iterations+=1;absolute=inner(&residual,&residual).sqrt();relative=absolute/rhs_norm;if relative<=m.linear_tolerance||absolute<=m.linear_absolute_tolerance_n{break}z=project(blocks.apply(&residual));let next=inner(&residual,&z);let beta=next/rz;for i in 0..n{direction[i]=add(z[i],mul(direction[i],beta));}rz=next;}
   }
  }
  let reaction=product(&delta);let true_residual:Vec<_>=(0..n).map(|i|filter(i,add(gradient[i],reaction[i]))).collect();absolute=inner(&true_residual,&true_residual).sqrt();relative=if rhs_norm>0.{absolute/rhs_norm}else{0.};
  let mut changes=Vec::new();for i in 0..n{if w[i]==0.{continue}if let Some(normal)=contact_normals.get(i).copied().flatten(){if active[i]{if dot(add(gradient[i],reaction[i]),normal)< -absolute.max(1e-7)*2.{changes.push((i,false));}}else if dot(delta[i],normal)< -1e-9{changes.push((i,true));}}}
  if changes.is_empty(){active_set_converged=true;break}for (i,state) in changes{active[i]=state;}
 }
 if let Some(c)=cache.as_deref_mut(){c.states=(0..n).map(|i|if active_set_converged&&w[i]>0.&&contact_normals.get(i).copied().flatten().is_some(){Some(active[i])}else{None}).collect();}
 let before=total_energy(p,target,w,mass,dt,fabric,m,hinges,seams,contacts);let slope=inner(&gradient,&delta);let mut fraction=1.;let mut accepted=false;
 if slope.is_finite()&&slope<0.{for _ in 0..12{let trial:Vec<_>=p.iter().zip(&delta).map(|(&p,&d)|add(p,mul(d,fraction))).collect();let after=total_energy(&trial,target,w,mass,dt,fabric,m,hinges,seams,contacts);if after.is_finite()&&after<=before+1e-4*fraction*slope+1e-16{p.copy_from_slice(&trial);accepted=true;break}fraction*=0.5;}}
 Ok(Solve{linear_iterations:iterations,relative_residual:relative,absolute_residual:absolute,stalled:!accepted&&projected_gradient_norm>1e-8,active_set_converged,active_set_iterations,warm_start,cold_restarts})
}

#[cfg(test)]mod tests{use super::*;
 fn cache_material()->material::Material{serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01})).unwrap()}
 #[test]fn reused_support_reduces_coupled_solves_and_cannot_retain_a_lost_contact(){
  let m=cache_material();let mass=material::SurfaceMass{areas:vec![],masses:vec![1.;2],area:0.,mass:2.};let seams=[Constraint{a:0,b:1,rest:0.,compliance:1e-4,lambda:0.}];let target=[[0.,0.1,0.],[0.,-1.,0.]];let normals=[Some([0.,1.,0.]),None];
  for direct in [false,true]{let mut cache=SupportCache::new(2);let mut sparse=if direct{Some(material_sparse::SparseSolver::new(2,&[],&[],&seams).unwrap())}else{None};let mut cold=vec![[0.;3];2];let a=project_cached(&mut cold,&target,&[1.;2],&mass,0.01,&[],&m,&[],&seams,&normals,&[],sparse.as_mut(),Some(&mut cache)).unwrap();let mut warm=vec![[0.;3];2];let b=project_cached(&mut warm,&target,&[1.;2],&mass,0.01,&[],&m,&[],&seams,&normals,&[],sparse.as_mut(),Some(&mut cache)).unwrap();assert_eq!(a.active_set_iterations,2);assert_eq!(b.active_set_iterations,1);assert!(b.warm_start&&b.active_set_converged);for i in 0..2{assert!(norm(sub(cold[i],warm[i]))<1e-12);}let mut free=vec![[0.;3];2];project_cached(&mut free,&[[0.,1.,0.];2],&[1.;2],&mass,0.01,&[],&m,&[],&seams,&[],&[],sparse.as_mut(),Some(&mut cache)).unwrap();for p in free{assert!((p[1]-1.).abs()<1e-12);}assert!(cache.states.iter().all(Option::is_none));}
 }
 #[test]fn a_poor_cached_guess_preserves_the_full_cold_contact_budget(){
  let m=cache_material();let n=8;let mass=material::SurfaceMass{areas:vec![],masses:vec![1.;n],area:0.,mass:n as f64};let seams:Vec<_>=(0..n-1).map(|i|Constraint{a:i,b:i+1,rest:0.,compliance:1e-4,lambda:0.}).collect();let mut target=vec![[0.,-1e-6,0.];n];target[0][1]=1.;for direct in [false,true]{let mut p=vec![[0.;3];n];let mut cache=SupportCache{states:vec![Some(true);n]};let mut sparse=if direct{Some(material_sparse::SparseSolver::new(n,&[],&[],&seams).unwrap())}else{None};let r=project_cached(&mut p,&target,&vec![1.;n],&mass,0.01,&[],&m,&[],&seams,&vec![Some([0.,1.,0.]);n],&[],sparse.as_mut(),Some(&mut cache)).unwrap();assert!(r.active_set_converged);assert_eq!(r.cold_restarts,1);assert_eq!(r.active_set_iterations,16);for i in 0..n{let mut residual=(p[i][1]-target[i][1])*10000.;for c in &seams{if c.a==i{residual+=(p[i][1]-p[c.b][1])/c.compliance;}if c.b==i{residual+=(p[i][1]-p[c.a][1])/c.compliance;}}assert!(residual.abs()<1e-8);}}
 }
 #[test]fn coupled_support_release_propagates_beyond_four_passes_for_both_solvers(){
  let m:material::Material=serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01,"linearTolerance":1e-8})).unwrap();
  let n=7;let mass=material::SurfaceMass{areas:vec![],masses:vec![1.;n],area:0.,mass:n as f64};let seams:Vec<_>=(0..n-1).map(|i|Constraint{a:i,b:i+1,rest:0.,compliance:1e-4,lambda:0.}).collect();let mut target=vec![[0.,-1e-6,0.];n];target[0][1]=1.;
  for use_sparse in [false,true]{let mut p=vec![[0.;3];n];let mut sparse=if use_sparse{Some(material_sparse::SparseSolver::new(n,&[],&[],&seams).unwrap())}else{None};let result=project(&mut p,&target,&vec![1.;n],&mass,0.01,&[],&m,&[],&seams,&vec![Some([0.,1.,0.]);n],&[],sparse.as_mut()).unwrap();assert!(result.active_set_converged);assert_eq!(result.active_set_iterations,7);assert!(p.iter().all(|v|v[1]>0.));for i in 0..n{let mut residual=(p[i][1]-target[i][1])*10000.;for c in &seams{if c.a==i{residual+=(p[i][1]-p[c.b][1])/c.compliance;}if c.b==i{residual+=(p[i][1]-p[c.a][1])/c.compliance;}}assert!(residual.abs()<1e-8,"{i}: {residual}");}}
 }
 #[test]fn face_penalty_matches_independent_three_mass_equilibrium_and_releases_outward(){let m:material::Material=serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01,"contactNpm":1e5})).unwrap();let mass=material::SurfaceMass{areas:vec![],masses:vec![1.;3],area:0.,mass:3.};let plane=face_support::Plane{ids:[0,1,2],bary:[1./3.;3],normal:[0.,1.,0.],offset:0.,body_triangle:0};let mut p=vec![[0.,-0.1,0.];3];let targets=vec![[0.,-1.,0.];3];project(&mut p,&targets,&[1.;3],&mass,0.01,&[],&m,&[],&[],&[],&[plane.clone()],None).unwrap();let expected=-10000./(10000.+m.contact_npm/3.);for v in &p{assert!((v[1]-expected).abs()<1e-12);}let targets=vec![[0.,1.,0.];3];for _ in 0..2{project(&mut p,&targets,&[1.;3],&mass,0.01,&[],&m,&[],&[],&[],&[plane.clone()],None).unwrap();}for v in &p{assert!((v[1]-1.).abs()<1e-12);}}
 #[test]fn coupled_force_can_activate_a_contact_despite_an_outward_local_gradient(){let m:material::Material=serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01})).unwrap();let mass=material::SurfaceMass{areas:vec![],masses:vec![1.,1.],area:0.,mass:2.};let mut p=vec![[0.;3];2];let seams=[Constraint{a:0,b:1,rest:0.,compliance:1e-4,lambda:0.}];let result=project(&mut p,&[[0.,0.1,0.],[0.,-1.,0.]],&[1.,1.],&mass,0.01,&[],&m,&[],&seams,&[Some([0.,1.,0.]),None],&[],None).unwrap();assert!(result.active_set_converged);assert_eq!(result.active_set_iterations,2);assert!(p[0][1].abs()<1e-12);assert!((p[1][1]+0.5).abs()<1e-12);}
 #[test]fn contact_support_retains_tangent_motion_and_releases_under_outward_load(){let m:material::Material=serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01})).unwrap();let mass=material::SurfaceMass{areas:vec![],masses:vec![1.],area:0.,mass:1.};for (target,expected) in [([1.,-1.,2.],[1.,0.,2.]),([1.,1.,2.],[1.,1.,2.])]{let mut p=vec![[0.;3]];let result=project(&mut p,&[target],&[1.],&mass,0.01,&[],&m,&[],&[],&[Some([0.,1.,0.])],&[],None).unwrap();assert!(!result.stalled);for a in 0..3{assert!((p[0][a]-expected[a]).abs()<1e-12);}}}
 #[test]fn closed_seam_uses_the_full_vector_spring_hessian(){let m:material::Material=serde_json::from_value(serde_json::json!({"version":1,"densityKgM2":0.2,"warpNpm":1000.,"weftNpm":100.,"shearNpm":100.,"bendingNm":0.,"seamNpm2":1e6,"dampingPerSecond":12.,"timeStep":0.01})).unwrap();let mass=material::SurfaceMass{areas:vec![],masses:vec![1.,1.],area:0.,mass:2.};let mut p=vec![[0.,0.,0.],[1.,0.,0.]];let target=vec![[0.,0.,0.],[1.,1.,0.]];let seams=vec![Constraint{a:0,b:1,rest:0.,compliance:1e-4,lambda:0.}];let result=project(&mut p,&target,&[1.,1.],&mass,0.01,&[],&m,&[],&seams,&[],&[],None).unwrap();assert!(!result.stalled);for axis in 0..2{assert!((p[0][axis]-1./3.).abs()<1e-10);assert!((p[1][axis]-2./3.).abs()<1e-10);}}
}

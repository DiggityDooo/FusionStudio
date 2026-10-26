//! Original area-integrated fabric. SI units: kg/m², N/m, N·m, seconds.
//! Uncoupled warp/weft/shear energies; not a measured fabric or Poisson model.
use super::*;

#[derive(Deserialize,Clone,Copy,PartialEq,Default)]
#[serde(rename_all="lowercase")]
pub enum LinearSolver {#[default] Auto,Pcg,Sparse}

#[derive(Deserialize,Clone)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Material {
 pub version:u32,pub density_kg_m2:f64,pub warp_npm:f64,pub weft_npm:f64,
 pub shear_npm:f64,pub bending_nm:f64,pub seam_npm2:f64,
 pub damping_per_second:f64,pub time_step:f64,
 #[serde(default="contact_npm")]pub contact_npm:f64,
 #[serde(default)]pub linear_solver:LinearSolver,
 #[serde(default="linear_iterations")]pub linear_iterations:usize,
 #[serde(default="linear_tolerance")]pub linear_tolerance:f64,
 #[serde(default="linear_absolute_tolerance_n")]pub linear_absolute_tolerance_n:f64,
}
fn contact_npm()->f64{1e5}
fn linear_iterations()->usize{64}
fn linear_tolerance()->f64{1e-5}
fn linear_absolute_tolerance_n()->f64{1e-10}
impl Material {
 pub fn validate(&self)->Result<(),String>{
  let within=|v:f64,lo:f64,hi:f64|v.is_finite()&&v>=lo&&v<=hi;
  if self.version!=1||!within(self.density_kg_m2,0.01,2.)||[self.warp_npm,self.weft_npm,self.shear_npm].iter().any(|&v|!within(v,1.,1e6))||!within(self.bending_nm,0.,1.)||!within(self.seam_npm2,1e3,1e9)||!within(self.damping_per_second,0.,50.)||!within(self.contact_npm,1e3,1e8)||!within(self.time_step,1./240.,1./30.)||self.linear_iterations<4||self.linear_iterations>512||!within(self.linear_tolerance,1e-8,1e-2)||!within(self.linear_absolute_tolerance_n,1e-14,1e-3){return Err("Invalid physical fabric: use bounded SI material values, dt 1/240–1/30 s, 4–512 linear iterations and tolerance 1e-8–1e-2".into())}Ok(())
 }
 pub fn stiffness(&self)->[f64;3]{[self.warp_npm,self.weft_npm,self.shear_npm]}
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Load {pub vertex:usize,pub force:V}
pub struct SurfaceMass {pub areas:Vec<f64>,pub masses:Vec<f64>,pub area:f64,pub mass:f64}
pub fn surface_mass(rest:&[V],faces:&[[usize;3]],density:f64)->Result<SurfaceMass,String>{
 let mut masses=vec![0.;rest.len()];let mut areas=Vec::with_capacity(faces.len());let mut area=0.;
 for t in faces{let a=0.5*norm(cross(sub(rest[t[1]],rest[t[0]]),sub(rest[t[2]],rest[t[0]])));if !a.is_finite()||a<1e-12{return Err("Physical fabric needs nondegenerate flat rest triangles".into())}areas.push(a);area+=a;for &i in t{masses[i]+=a*density/3.;}}
 if masses.iter().any(|v|!v.is_finite()||*v<=1e-12)||!area.is_finite(){return Err("Physical fabric contains unused or negligible-mass vertices".into())}Ok(SurfaceMass{areas,masses,area,mass:area*density})
}
// Line quadrature follows the paired seam chain, not every boundary edge
// incident to its endpoints (which over-stiffens corners and partial seams).
pub fn seam_compliances(rest:&[V],faces:&[[usize;3]],topo:&Topology,sewing:&[[usize;2]],stiffness:f64)->Result<Vec<f64>,String>{
 let mut boundary=vec![Vec::new();rest.len()];for h in 0..topo.half_edges{if topo.twins[h]<0{let t=faces[h/3];let (a,b)=(t[h%3],t[(h%3+1)%3]);boundary[a].push(b);boundary[b].push(a);}}
 let key=|a:usize,b:usize|(a.min(b),a.max(b));let mut pair=HashMap::new();for (i,&[a,b]) in sewing.iter().enumerate(){if boundary[a].is_empty()||boundary[b].is_empty(){return Err("Physical sewing must reference panel boundary vertices".into())}if pair.insert(key(a,b),i).is_some(){return Err("Physical sewing contains a duplicate pair".into())}}
 let mut lengths=vec![0.;sewing.len()];for (i,&[a,b]) in sewing.iter().enumerate(){for &c in &boundary[a]{for &d in &boundary[b]{if let Some(&j)=pair.get(&key(c,d)){if j>i{let half=0.25*(norm(sub(rest[a],rest[c]))+norm(sub(rest[b],rest[d])));lengths[i]+=half;lengths[j]+=half;}}}}}
 lengths.into_iter().map(|length|if length>1e-12{Ok(1./(stiffness*length))}else{Err("Physical sewing needs a continuous paired boundary chain; isolated point tacks are unsupported".into())}).collect()
}
// Final-step decomposition distinguishes material motion from contact kicks.
// It is diagnostic only and never feeds positions or solver decisions back.
pub struct MotionTrace {start:Vec<V>,last:Vec<V>,corrections:[Vec<V>;4]}
impl MotionTrace {
 pub fn new(p:&[V])->Self{Self{start:p.to_vec(),last:p.to_vec(),corrections:std::array::from_fn(|_|vec![[0.;3];p.len()])}}
 pub fn record(&mut self,stage:usize,p:&[V]){for (i,&point) in p.iter().enumerate(){self.corrections[stage][i]=add(self.corrections[stage][i],sub(point,self.last[i]));}self.last.copy_from_slice(p);}
 pub fn summary(&self,p:&[V],velocity:&[V])->serde_json::Value{let vertex=(0..p.len()).max_by(|&a,&b|norm(velocity[a]).total_cmp(&norm(velocity[b])).then(b.cmp(&a))).unwrap_or(0);let maximum:Vec<_>=self.corrections.iter().map(|s|s.iter().map(|&v|norm(v)).fold(0.,f64::max)).collect();serde_json::json!({"vertex":vertex,"startPositionM":self.start[vertex],"endPositionM":p[vertex],"velocityMps":velocity[vertex],"materialCorrectionM":self.corrections[0][vertex],"bodyCorrectionM":self.corrections[1][vertex],"faceCorrectionM":self.corrections[2][vertex],"selfCorrectionM":self.corrections[3][vertex],"maximumStageCorrectionsM":maximum})}
}
pub fn wrap_angle(a:f64)->f64{a.sin().atan2(a.cos())}
pub fn angle_gradients(p:[V;4])->Option<(f64,[V;4])>{
 let [a,b,c,d]=p;let e=sub(b,a);let l2=dot(e,e);let n0=cross(e,sub(c,a));let n1=cross(sub(d,a),e);let s0=dot(n0,n0);let s1=dot(n1,n1);if l2<1e-16||s0<1e-24||s1<1e-24{return None}let l=l2.sqrt();let x=mul(n0,1./s0.sqrt());let y=mul(n1,1./s1.sqrt());let theta=dot(cross(x,y),mul(e,1./l)).atan2(dot(x,y));
 let gc=mul(n0,-l/s0);let gd=mul(n1,-l/s1);let tc=dot(sub(c,a),e)/l2;let td=dot(sub(d,a),e)/l2;let gb=add(mul(gc,-tc),mul(gd,-td));let ga=mul(add(add(gc,gd),gb),-1.);Some((theta,[ga,gb,gc,gd]))
}
pub struct Hinge {pub ids:[usize;4],rest_angle:f64,stiffness:f64}
impl Hinge {
 pub fn new(ids:[usize;4],rest:&[V],rigidity:f64)->Result<Self,String>{
  let p=ids.map(|i|rest[i]);let (rest_angle,_)=angle_gradients(p).ok_or("Degenerate physical bending hinge")?;let l2=dot(sub(p[1],p[0]),sub(p[1],p[0]));let sum_area=0.5*(norm(cross(sub(p[1],p[0]),sub(p[2],p[0])))+norm(cross(sub(p[3],p[0]),sub(p[1],p[0]))));
  // Centroidal dual width is 2(A_left+A_right)/(3*edge_length).
  Ok(Self{ids,rest_angle,stiffness:rigidity*3.*l2/(2.*sum_area)})
 }
 pub fn energy(&self,p:&[V])->f64{angle_gradients(self.ids.map(|i|p[i])).map_or(0.,|(theta,_)|0.5*self.stiffness*wrap_angle(theta-self.rest_angle).powi(2))}
 pub fn term(&self,p:&[V])->Option<(f64,[V;4],f64)>{if self.stiffness==0.{return None}angle_gradients(self.ids.map(|i|p[i])).map(|(theta,g)|(wrap_angle(theta-self.rest_angle),g,self.stiffness))}
 pub fn add_forces(&self,p:&[V],forces:&mut[V]){if let Some((theta,g))=angle_gradients(self.ids.map(|i|p[i])){let f=-self.stiffness*wrap_angle(theta-self.rest_angle);for i in 0..4{forces[self.ids[i]]=add(forces[self.ids[i]],mul(g[i],f));}}}
}

#[cfg(test)]mod tests {
 use super::*;
 #[test]fn seam_quadrature_does_not_include_unsewn_corner_edges(){let rest=vec![[0.,0.,0.],[0.2,0.,0.],[0.,0.25,0.],[0.2,0.25,0.],[0.,0.25,0.],[0.2,0.25,0.],[0.,0.5,0.],[0.2,0.5,0.]];let faces=vec![[0,1,2],[1,3,2],[4,5,6],[5,7,6]];let topo=topology(&Mesh{positions:rest.clone(),faces:faces.clone()}).unwrap();let c=seam_compliances(&rest,&faces,&topo,&[[2,4],[3,5]],1e6).unwrap();assert_eq!(c.len(),2);for v in c{assert!((v-1e-5).abs()<1e-16);}assert!(seam_compliances(&rest,&faces,&topo,&[[2,4]],1e6).unwrap_err().contains("point tacks"));assert!(seam_compliances(&rest,&faces,&topo,&[[2,4],[4,2]],1e6).unwrap_err().contains("duplicate"));}

 #[test]fn hinge_gradient_matches_finite_differences(){for p in [[[0.,0.,0.],[1.,0.,0.],[0.2,0.8,0.3],[0.7,-0.6,0.4]],[[0.1,0.2,0.3],[0.9,0.4,0.5],[0.4,1.1,-0.2],[-0.1,-0.7,0.6]]]{let (_,g)=angle_gradients(p).unwrap();for i in 0..4{for a in 0..3{let mut lo=p;let mut hi=p;lo[i][a]-=1e-6;hi[i][a]+=1e-6;let actual=wrap_angle(angle_gradients(hi).unwrap().0-angle_gradients(lo).unwrap().0)/2e-6;assert!((actual-g[i][a]).abs()<1e-7,"{i}/{a}: {actual} vs {}",g[i][a]);}}assert!(norm(g.into_iter().fold([0.;3],add))<1e-12);}}
 #[test]fn area_mass_and_rigid_bending(){let p=vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[1.,-1.,0.]];let f=vec![[0,1,2],[1,0,3]];let mass=surface_mass(&p,&f,0.2).unwrap();assert!((mass.area-1.).abs()<1e-12);assert!((mass.masses.iter().sum::<f64>()-0.2).abs()<1e-12);let hinge=Hinge::new([0,1,2,3],&p,0.1).unwrap();let moved:Vec<_>=p.iter().map(|p|[p[0]+3.,-p[2]+2.,p[1]+1.]).collect();assert!(hinge.energy(&moved)<1e-20);}
}

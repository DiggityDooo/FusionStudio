//! Original retained local body-contact planes. The numerical penalty enters
//! the same energy solve as the fabric; geometric recovery remains a fallback.
use super::*;
#[derive(Clone)]
pub struct Plane {pub ids:[usize;3],pub bary:[f64;3],pub normal:V,pub offset:f64,pub body_triangle:usize}
impl Plane {
 pub fn point(&self,p:&[V])->V{(0..3).fold([0.;3],|v,i|add(v,mul(p[self.ids[i]],self.bary[i])))}
 pub fn value(&self,p:&[V])->f64{dot(self.point(p),self.normal)-self.offset}
 pub fn energy(&self,p:&[V],stiffness:f64)->f64{0.5*stiffness*self.value(p).min(0.).powi(2)}
}
pub struct Supports {planes:BTreeMap<(usize,usize),Plane>}
impl Supports {
 pub fn new()->Self{Self{planes:BTreeMap::new()}}
 pub fn prune(&mut self,p:&[V],body:&contact::Surface,h:f64){self.planes.retain(|_,plane|{let point=plane.point(p);let t=body.triangles[plane.body_triangle];let nearest=contact::closest(point,body.positions[t[0]],body.positions[t[1]],body.positions[t[2]]).0;let cloth_size=(0..3).map(|i|norm(sub(p[plane.ids[i]],p[plane.ids[(i+1)%3]]))).fold(0.,f64::max);let body_size=(0..3).map(|i|norm(sub(body.positions[t[i]],body.positions[t[(i+1)%3]]))).fold(0.,f64::max);let radius=cloth_size.min(body_size)*1.5+2.*h;norm(sub(point,nearest))<radius&&plane.value(p)<2.*h});}
 pub fn discover(&mut self,p:&[V],faces:&[[usize;3]],body:&contact::Surface,tree:&contact::Tree,h:f64)->Result<(),String>{
  let mut candidates=Vec::new();for (f,t) in faces.iter().enumerate(){let tri=t.map(|i|p[i]);let lo=std::array::from_fn(|a|tri.iter().map(|p|p[a]).fold(f64::INFINITY,f64::min));let hi=std::array::from_fn(|a|tri.iter().map(|p|p[a]).fold(f64::NEG_INFINITY,f64::max));tree.query(lo,hi,h,&mut candidates);
   for &i in &candidates{let surface=body.triangles[i].map(|j|body.positions[j]);let Some((point,bary))=contact::face_hits_fast(tri,surface).into_iter().next()else{continue};let(target,hit)=contact::solid_project(point,body,tree,h);let delta=sub(target,point);let length=norm(delta);if !hit||length<1e-10{continue}let normal=mul(delta,1./length);self.planes.insert((f,i),Plane{ids:*t,bary,normal,offset:dot(target,normal),body_triangle:i});if self.planes.len()>24000{return Err("Body-face support exceeds 24,000 contacts. Reduce garment density or repair the source arrangement.".into())}
   }
  }Ok(())
 }
 pub fn list(&self)->Vec<Plane>{self.planes.values().cloned().collect()}
 pub fn energy(&self,p:&[V],stiffness:f64)->f64{self.planes.values().map(|c|c.energy(p,stiffness)).sum()}
}

#[cfg(test)]mod tests {use super::*;
 #[test]fn retained_body_support_detects_a_face_crossing_and_preserves_barycentric_coordinates(){let body=contact::Surface{positions:vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]],triangles:vec![[0,2,1],[0,1,3],[0,3,2],[1,2,3]],previous_positions:None};let tree=contact::Tree::new(&body);let p=vec![[-1.,-1.,0.2],[2.,-1.,0.2],[0.,2.,0.2]];let mut supports=Supports::new();supports.discover(&p,&[[0,1,2]],&body,&tree,0.003).unwrap();let planes=supports.list();assert!(!planes.is_empty());for plane in &planes{assert!((plane.bary.iter().sum::<f64>()-1.).abs()<1e-12);assert!(plane.bary.iter().all(|&v|v>=-1e-9));assert!(plane.value(&p)<0.);assert!((norm(plane.normal)-1.).abs()<1e-12);}assert!(supports.energy(&p,1e5)>0.);let moved:Vec<_>=p.iter().map(|&p|add(p,[0.,0.,5.])).collect();supports.prune(&moved,&body,0.003);assert!(supports.list().is_empty());}
}

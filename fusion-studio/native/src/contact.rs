//! Original triangle contact primitives. Broadphase includes swept bounds.
use super::*;
#[derive(Clone,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Surface {pub positions:Vec<V>,pub triangles:Vec<[usize;3]>,pub previous_positions:Option<Vec<V>>}
struct Node {min:V,max:V,children:Option<[usize;2]>,ids:Vec<usize>}
pub struct Tree {nodes:Vec<Node>}
fn bounds(points:impl Iterator<Item=V>)->(V,V){let mut lo=[f64::INFINITY;3];let mut hi=[f64::NEG_INFINITY;3];for p in points{for i in 0..3{lo[i]=lo[i].min(p[i]);hi[i]=hi[i].max(p[i]);}}(lo,hi)}
impl Tree {
 pub fn new(surface:&Surface)->Self{let old=surface.previous_positions.as_ref().unwrap_or(&surface.positions);let boxes:Vec<_>=surface.triangles.iter().map(|t|bounds(t.iter().flat_map(|&i|[surface.positions[i],old[i]]))).collect();let mut tree=Self{nodes:Vec::new()};if !boxes.is_empty(){tree.build((0..boxes.len()).collect(),&boxes);}tree}
 fn build(&mut self,mut ids:Vec<usize>,boxes:&[(V,V)])->usize{let(lo,hi)=bounds(ids.iter().flat_map(|&i|[boxes[i].0,boxes[i].1]));let at=self.nodes.len();self.nodes.push(Node{min:lo,max:hi,children:None,ids:Vec::new()});if ids.len()<=8{self.nodes[at].ids=ids;}else{let axis=(0..3).max_by(|&a,&b|(hi[a]-lo[a]).total_cmp(&(hi[b]-lo[b]))).unwrap();ids.sort_unstable_by(|&a,&b|(boxes[a].0[axis]+boxes[a].1[axis]).total_cmp(&(boxes[b].0[axis]+boxes[b].1[axis])).then(a.cmp(&b)));let right=ids.split_off(ids.len()/2);let a=self.build(ids,boxes);let b=self.build(right,boxes);self.nodes[at].children=Some([a,b]);}at}
 pub fn query(&self,a:V,b:V,margin:f64,out:&mut Vec<usize>){out.clear();if self.nodes.is_empty(){return}self.visit(0,a.map(|v|v),b,margin,out);out.sort_unstable();}
 pub fn query_limited(&self,a:V,b:V,margin:f64,out:&mut Vec<usize>,work:&mut usize,limit:usize)->bool{
  fn visit(tree:&Tree,at:usize,a:V,b:V,m:f64,out:&mut Vec<usize>,work:&mut usize,limit:usize)->bool{if *work>=limit{return false}*work+=1;let n=&tree.nodes[at];if(0..3).any(|i|a[i].min(b[i])-m>n.max[i]||a[i].max(b[i])+m<n.min[i]){return true}if let Some([x,y])=n.children{visit(tree,x,a,b,m,out,work,limit)&&visit(tree,y,a,b,m,out,work,limit)}else{out.extend(&n.ids);true}}
  out.clear();if self.nodes.is_empty(){return true}let complete=visit(self,0,a,b,margin,out,work,limit);out.sort_unstable();complete
 }
 pub fn inside_limited(&self,p:V,s:&Surface,work:&mut usize,limit:usize)->Option<bool>{
  const DIR:V=[0.9271726499455306,0.3197138310157002,0.195380674102301];
  fn visit(tree:&Tree,at:usize,p:V,s:&Surface,hits:&mut Vec<f64>,work:&mut usize,limit:usize)->bool{
   if *work>=limit{return false}*work+=1;let n=&tree.nodes[at];let mut lo=0f64;let mut hi=f64::INFINITY;for i in 0..3{lo=lo.max((n.min[i]-p[i])/DIR[i]);hi=hi.min((n.max[i]-p[i])/DIR[i]);}if lo>hi{return true}
   if let Some([a,b])=n.children{return visit(tree,a,p,s,hits,work,limit)&&visit(tree,b,p,s,hits,work,limit)}
   for &i in &n.ids{if *work>=limit{return false}*work+=1;let t=s.triangles[i];let a=s.positions[t[0]];let e=sub(s.positions[t[1]],a);let f=sub(s.positions[t[2]],a);let v=cross(DIR,f);let det=dot(e,v);if det.abs()<1e-16{continue}let delta=sub(p,a);let u=dot(delta,v)/det;if !(-1e-9..=1.+1e-9).contains(&u){continue}let q=cross(delta,e);let w=dot(DIR,q)/det;if w< -1e-9||u+w>1.+1e-9{continue}let distance=dot(f,q)/det;if distance>1e-9{hits.push(distance);}}true
  }
  if self.nodes.is_empty(){return Some(false)}let mut hits=Vec::new();if !visit(self,0,p,s,&mut hits,work,limit){return None}hits.sort_by(f64::total_cmp);hits.dedup_by(|a,b|(*a-*b).abs()<1e-7);Some(hits.len()%2==1)
 }
 pub fn nearest(&self,p:V,s:&Surface)->Option<(V,usize)>{
  fn lower(p:V,n:&Node)->f64{(0..3).map(|i|{let d=(n.min[i]-p[i]).max(0.).max(p[i]-n.max[i]);d*d}).sum()}
  fn visit(tree:&Tree,at:usize,p:V,s:&Surface,best:&mut(f64,V,usize)){let n=&tree.nodes[at];if lower(p,n)>best.0{return}if let Some([a,b])=n.children{let order=if lower(p,&tree.nodes[a])<=lower(p,&tree.nodes[b]){[a,b]}else{[b,a]};for i in order{visit(tree,i,p,s,best);}}else{for &i in &n.ids{let t=s.triangles[i];let q=closest(p,s.positions[t[0]],s.positions[t[1]],s.positions[t[2]]).0;let d=dot(sub(p,q),sub(p,q));if d<best.0{*best=(d,q,i);}}}}
  if self.nodes.is_empty(){return None}let mut best=(f64::INFINITY,[0.;3],0);visit(self,0,p,s,&mut best);Some((best.1,best.2))
 }
 pub fn inside(&self,p:V,s:&Surface)->bool{
  const DIR:V=[0.9271726499455306,0.3197138310157002,0.195380674102301];
  fn visit(tree:&Tree,at:usize,p:V,s:&Surface,hits:&mut Vec<f64>){let n=&tree.nodes[at];let mut lo=0f64;let mut hi=f64::INFINITY;for i in 0..3{lo=lo.max((n.min[i]-p[i])/DIR[i]);hi=hi.min((n.max[i]-p[i])/DIR[i]);}if lo>hi{return}if let Some([a,b])=n.children{visit(tree,a,p,s,hits);visit(tree,b,p,s,hits);}else{for &i in &n.ids{let t=s.triangles[i];let a=s.positions[t[0]];let e=sub(s.positions[t[1]],a);let f=sub(s.positions[t[2]],a);let v=cross(DIR,f);let det=dot(e,v);if det.abs()<1e-16{continue}let delta=sub(p,a);let u=dot(delta,v)/det;if !(-1e-9..=1.+1e-9).contains(&u){continue}let q=cross(delta,e);let w=dot(DIR,q)/det;if w< -1e-9||u+w>1.+1e-9{continue}let distance=dot(f,q)/det;if distance>1e-9{hits.push(distance);}}}}
  if self.nodes.is_empty(){return false}let mut hits=Vec::new();visit(self,0,p,s,&mut hits);hits.sort_by(f64::total_cmp);hits.dedup_by(|a,b|(*a-*b).abs()<1e-7);hits.len()%2==1
 }
 fn visit(&self,at:usize,a:V,b:V,m:f64,out:&mut Vec<usize>){let n=&self.nodes[at];if (0..3).any(|i|a[i].min(b[i])-m>n.max[i]||a[i].max(b[i])+m<n.min[i]){return}if let Some([x,y])=n.children{self.visit(x,a,b,m,out);self.visit(y,a,b,m,out);}else{out.extend(&n.ids);}}
}
// Closed-body placement uses ray parity, so reversed winding does not reverse
// the inside/outside decision. Open/non-manifold colliders remain a known limit.
pub fn solid_project(p:V,s:&Surface,tree:&Tree,h:f64)->(V,bool){
 let Some((point,id))=tree.nearest(p,s)else{return(p,false)};let delta=sub(p,point);let distance=norm(delta);let inside=tree.inside(p,s);if !inside&&distance>=h{return(p,false)}
 let n=if distance>1e-9{mul(delta,if inside{-1./distance}else{1./distance})}else{let t=s.triangles[id];let n=cross(sub(s.positions[t[1]],s.positions[t[0]]),sub(s.positions[t[2]],s.positions[t[0]]));let size=norm(n);if size<1e-14{return(p,false)}let n=mul(n,1./size);if tree.inside(add(point,mul(n,h*1.05)),s){mul(n,-1.)}else{n}};
 (add(point,mul(n,h*1.05)),true)
}
fn segment_hit(a:V,b:V,tri:[V;3])->Option<(V,[f64;3],f64)>{let n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));let len=norm(n);if len<1e-14{return None}let n=mul(n,1./len);let da=dot(sub(a,tri[0]),n);let db=dot(sub(b,tri[0]),n);if da*db>=-1e-16{return None}let t=da/(da-db);let point=lerp(a,b,t);let(q,bary)=closest(point,tri[0],tri[1],tri[2]);if norm(sub(q,point))<1e-8{Some((point,bary,t))}else{None}}
pub(super) fn face_hits(tri:[V;3],body:[V;3])->Vec<(V,[f64;3])>{let mut hits=Vec::new();for j in 0..3{if let Some((point,_,t))=segment_hit(tri[j],tri[(j+1)%3],body){let mut bary=[0.;3];bary[j]=1.-t;bary[(j+1)%3]=t;hits.push((point,bary));}if let Some((point,bary,_))=segment_hit(body[j],body[(j+1)%3],tri){hits.push((point,bary));}}hits}
// Conservative face-plane rejection. Near-grazing and degenerate cases retain
// the original edge/triangle path and its order/tolerances. The padding exceeds
// the narrowphase's 1e-8 m closest-point tolerance, including roundoff at scale.
fn faces_separated(a:[V;3],b:[V;3])->bool{
 let scale=a.iter().chain(&b).flatten().map(|v|v.abs()).fold(1.,f64::max);let margin=1e-7+64.*f64::EPSILON*scale;
 let separated=|plane:[V;3],points:[V;3]|{let n=cross(sub(plane[1],plane[0]),sub(plane[2],plane[0]));let size=norm(n);if size<1e-14{return false}let n=mul(n,1./size);let distances=points.map(|p|dot(sub(p,plane[0]),n));distances.iter().all(|&v|v>margin)||distances.iter().all(|&v|v< -margin)};
 separated(a,b)||separated(b,a)
}
pub(super) fn face_hits_fast(a:[V;3],b:[V;3])->Vec<(V,[f64;3])>{if faces_separated(a,b){Vec::new()}else{face_hits(a,b)}}
pub fn face_intersections(p:&[V],faces:&[[usize;3]],s:&Surface,tree:&Tree)->usize{let mut ids=Vec::new();let mut count=0;for t in faces{let tri=t.map(|i|p[i]);let(lo,hi)=bounds(tri.into_iter());tree.query(lo,hi,0.,&mut ids);if ids.iter().any(|&i|!face_hits(tri,s.triangles[i].map(|j|s.positions[j])).is_empty()){count+=1;}}count}
pub fn project_faces(p:&mut[V],faces:&[[usize;3]],w:&[f64],s:&Surface,tree:&Tree,h:f64)->usize{
 project_faces_mode(p,faces,w,s,tree,h,false)
}
pub fn project_physical_faces(p:&mut[V],faces:&[[usize;3]],w:&[f64],s:&Surface,tree:&Tree,h:f64)->usize{
 project_faces_mode(p,faces,w,s,tree,h,true)
}
fn project_faces_mode(p:&mut[V],faces:&[[usize;3]],w:&[f64],s:&Surface,tree:&Tree,h:f64,physical:bool)->usize{
 let mut ids=Vec::new();let mut count=0;for t in faces{let tri=t.map(|i|p[i]);let(lo,hi)=bounds(tri.into_iter());tree.query(lo,hi,h,&mut ids);let mut applied=0;for &i in &ids{let body=s.triangles[i].map(|j|s.positions[j]);for (point,bary) in if physical{face_hits_fast(t.map(|j|p[j]),body)}else{face_hits(t.map(|j|p[j]),body)}{let inv=(0..3).map(|j|w[t[j]]*bary[j]*bary[j]).sum::<f64>();if inv<1e-12{continue}let(target,hit)=solid_project(point,s,tree,h);if !hit{continue}let delta=sub(target,point);for j in 0..3{p[t[j]]=add(p[t[j]],mul(delta,w[t[j]]*bary[j]/inv));}count+=1;applied+=1;}if applied>=6{break}}}count
}
pub fn validate(s:&Surface)->Result<(),String>{if s.positions.len()>200000||s.triangles.len()>250000||s.positions.iter().any(|&p|!valid(p))||s.triangles.iter().flatten().any(|&i|i>=s.positions.len()){return Err("Invalid triangle collider or collider budget exceeded".into())}if let Some(old)=&s.previous_positions{if old.len()!=s.positions.len()||old.iter().any(|&p|!valid(p)){return Err("Previous collider topology does not match".into())}}Ok(())}
pub(super) fn closest(p:V,a:V,b:V,c:V)->(V,[f64;3]){
 let ab=sub(b,a);let ac=sub(c,a);let ap=sub(p,a);let d1=dot(ab,ap);let d2=dot(ac,ap);if d1<=0.&&d2<=0.{return(a,[1.,0.,0.])}
 let bp=sub(p,b);let d3=dot(ab,bp);let d4=dot(ac,bp);if d3>=0.&&d4<=d3{return(b,[0.,1.,0.])}let vc=d1*d4-d3*d2;if vc<=0.&&d1>=0.&&d3<=0.{let v=d1/(d1-d3);return(add(a,mul(ab,v)),[1.-v,v,0.])}
 let cp=sub(p,c);let d5=dot(ab,cp);let d6=dot(ac,cp);if d6>=0.&&d5<=d6{return(c,[0.,0.,1.])}let vb=d5*d2-d1*d6;if vb<=0.&&d2>=0.&&d6<=0.{let v=d2/(d2-d6);return(add(a,mul(ac,v)),[1.-v,0.,v])}
 let va=d3*d6-d5*d4;if va<=0.&&(d4-d3)>=0.&&(d5-d6)>=0.{let v=(d4-d3)/((d4-d3)+(d5-d6));return(add(b,mul(sub(c,b),v)),[0.,1.-v,v])}let total=va+vb+vc;if total.abs()<1e-20{return(a,[1.,0.,0.])}let v=vb/total;let w=vc/total;(add(a,add(mul(ab,v),mul(ac,w))),[1.-v-w,v,w])
}
fn lerp(a:V,b:V,t:f64)->V{add(a,mul(sub(b,a),t))}
// Signed tetrahedral volume is cubic for linearly moving vertices. Isolate
// roots using its derivative rather than relying on fixed temporal samples.
fn crossing_roots(p:V,q:V,old:[V;3],new:[V;3])->Vec<f64>{
 let value=|t|{let a=lerp(old[0],new[0],t);let b=lerp(old[1],new[1],t);let c=lerp(old[2],new[2],t);dot(sub(lerp(p,q,t),a),cross(sub(b,a),sub(c,a)))};
 let d=value(0.);let y1=value(1.)-d;let ym=value(-1.)-d;let y2=value(2.)-d;let b=(y1+ym)/2.;let a=(y2-2.*y1-2.*b)/6.;let c=y1-a-b;
 let mut cuts=vec![0.,1.];if a.abs()>1e-18{let disc=4.*b*b-12.*a*c;if disc>=0.{for t in [(-2.*b-disc.sqrt())/(6.*a),(-2.*b+disc.sqrt())/(6.*a)]{if t>0.&&t<1.{cuts.push(t)}}}}else if b.abs()>1e-18{let t=-c/(2.*b);if t>0.&&t<1.{cuts.push(t)}}cuts.sort_by(f64::total_cmp);
 let mut roots=Vec::new();for interval in cuts.windows(2){let(mut lo,mut hi)=(interval[0],interval[1]);let mut vlo=value(lo);let vhi=value(hi);if vlo.abs()<1e-12{roots.push(lo);}if vlo*vhi<0.{for _ in 0..45{let mid=(lo+hi)*0.5;let vm=value(mid);if vlo*vm>0.{lo=mid;vlo=vm;}else{hi=mid;}}roots.push((lo+hi)*0.5);}if vhi.abs()<1e-12{roots.push(hi);}}roots
}
fn swept(p:V,q:V,old:[V;3],new:[V;3])->Option<([f64;3],V)>{for t in crossing_roots(p,q,old,new){let tri=[lerp(old[0],new[0],t),lerp(old[1],new[1],t),lerp(old[2],new[2],t)];let v=lerp(p,q,t);let(pt,w)=closest(v,tri[0],tri[1],tri[2]);if norm(sub(v,pt))<1e-7{let n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));if norm(n)>1e-12{let normal=mul(n,1./norm(n));let sign=if dot(sub(p,old[0]),normal)<0.{-1.}else{1.};return Some((w,mul(normal,sign)))}}}None}
pub fn project(p:V,q:V,s:&Surface,tree:&Tree,h:f64,friction:f64)->(V,usize){project_mode(p,q,s,tree,h,friction,false)}
pub fn project_physical(p:V,q:V,s:&Surface,tree:&Tree,h:f64,friction:f64)->(V,usize){project_mode(p,q,s,tree,h,friction,true)}
fn project_mode(p:V,q:V,s:&Surface,tree:&Tree,h:f64,friction:f64,physical:bool)->(V,usize){let mut out=q;let mut hits=0;let mut candidates=Vec::new();tree.query(p,q,h,&mut candidates);let old=s.previous_positions.as_ref().unwrap_or(&s.positions);for i in candidates{let t=s.triangles[i];let tri=t.map(|v|s.positions[v]);let prev=t.map(|v|old[v]);let(pt,bary)=closest(out,tri[0],tri[1],tri[2]);let delta=sub(out,pt);let distance=norm(delta);let hit=if let Some((w,n))=swept(p,out,prev,tri){let target=add(add(mul(tri[0],w[0]),mul(tri[1],w[1])),mul(tri[2],w[2]));Some((target,n,w))}else if distance<h{let n=if distance>1e-10{mul(delta,1./distance)}else{let cross=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));if norm(cross)<1e-12{continue}mul(cross,1./norm(cross))};Some((pt,n,bary))}else{None};if let Some((point,n,bary))=hit{// A swept hit fixes the normal coordinate at the final contact plane.
 // Preserve end-of-step tangential motion; snapping to the impact barycentric
 // point makes frictionless oblique contacts artificially sticky.
 let desired=if physical{add(out,mul(n,h-dot(sub(out,point),n)))}else{add(point,mul(n,h))};let motion=if physical{(0..3).fold([0.;3],|a,j|add(a,mul(sub(tri[j],prev[j]),bary[j])))}else{[0.;3]};let velocity=sub(sub(desired,p),motion);let tangent=sub(velocity,mul(n,dot(velocity,n)));let factor=if physical{(friction*dot(sub(desired,out),n).abs()/norm(tangent).max(1e-12)).min(1.)}else{friction};out=sub(desired,mul(tangent,factor));hits+=1;}}(out,hits)}
// A local contact frame is sufficient for a tangent support in the coupled
// solve. Existing swept and solid projections still enforce final geometry.
pub fn support_normal(p:V,s:&Surface,tree:&Tree,h:f64)->Option<V>{let mut ids=Vec::new();tree.query(p,p,h*1.06+1e-7,&mut ids);let mut best=h*1.06+1e-7;let mut normal=None;for i in ids{let t=s.triangles[i];let point=closest(p,s.positions[t[0]],s.positions[t[1]],s.positions[t[2]]).0;let d=sub(p,point);let distance=norm(d);if distance>1e-10&&distance<best{best=distance;normal=Some(mul(d,1./distance));}}normal}
pub fn penetrations(p:&[V],s:&Surface,tree:&Tree,h:f64)->usize{p.iter().filter(|&&q|{let mut ids=Vec::new();tree.query(q,q,h,&mut ids);ids.iter().any(|&i|{let t=s.triangles[i];norm(sub(q,closest(q,s.positions[t[0]],s.positions[t[1]],s.positions[t[2]]).0))<h*0.9})}).count()}
pub fn self_project(p:&mut[V],old:&[V],faces:&[[usize;3]],w:&[f64],h:f64,excluded:&HashSet<(usize,usize)>)->usize{
 let s=Surface{positions:p.to_vec(),triangles:faces.to_vec(),previous_positions:Some(old.to_vec())};let tree=Tree::new(&s);let mut ids=Vec::new();let mut count=0;
 for i in 0..p.len(){tree.query(old[i],p[i],h,&mut ids);for &f in &ids{let t=faces[f];if t.contains(&i)||t.iter().any(|&j|excluded.contains(&(i.min(j),i.max(j)))){continue}let tri=t.map(|v|p[v]);let prev=t.map(|v|old[v]);let(point,bary)=closest(p[i],tri[0],tri[1],tri[2]);let d=sub(p[i],point);let len=norm(d);let hit=if let Some((b,n))=swept(old[i],p[i],prev,tri){let target=add(add(mul(tri[0],b[0]),mul(tri[1],b[1])),mul(tri[2],b[2]));Some((sub(add(target,mul(n,h)),p[i]),b))}else if len<h&&len>1e-10{Some((mul(d,(h-len)/len),bary))}else{None};if let Some((delta,b))=hit{let mass=w[i]+(0..3).map(|j|w[t[j]]*b[j]*b[j]).sum::<f64>();if mass==0.{continue}p[i]=add(p[i],mul(delta,w[i]/mass));for j in 0..3{p[t[j]]=sub(p[t[j]],mul(delta,w[t[j]]*b[j]/mass));}count+=1;}}
 }count
}
// A distance neighbourhood may suppress vertex/edge clearance constraints,
// but cannot excuse an actual crossing of faces with no shared sewn vertex.
// Resolve those intersections symmetrically, retaining the previous side when
// available. This is a bounded static recovery pass, not a swept-contact proof.
pub fn self_project_faces(p:&mut[V],old:&[V],faces:&[[usize;3]],w:&[f64],roots:&[usize],h:f64)->Result<usize,String>{
 let mut members=vec![Vec::new();p.len()];let mut mass=vec![0.;p.len()];let mut fixed=vec![false;p.len()];for i in 0..p.len(){members[roots[i]].push(i);if w[i]==0.{fixed[roots[i]]=true;}else{mass[roots[i]]+=1./w[i];}}let weight:Vec<_>=(0..p.len()).map(|r|if fixed[r]||mass[r]==0.{0.}else{1./mass[r]}).collect();
 let s=Surface{positions:p.to_vec(),triangles:faces.to_vec(),previous_positions:None};let tree=Tree::new(&s);let mut ids=Vec::new();let mut count=0;let mut tested=0;
 for (i,a) in faces.iter().enumerate(){let(lo,hi)=bounds(a.iter().map(|&v|p[v]));tree.query(lo,hi,h*3.,&mut ids);
  for &j in &ids{if j<=i{continue}tested+=1;if tested>2_000_000{return Err("Cloth face-contact recovery exceeded two million candidate pairs. Reduce density or overlapping panels.".into())}let b=faces[j];if a.iter().any(|&u|b.iter().any(|&v|roots[u]==roots[v])){continue}
   let ta=a.map(|v|p[v]);let tb=b.map(|v|p[v]);let hits=face_hits_fast(ta,tb);if hits.is_empty(){continue}let normal=cross(sub(tb[1],tb[0]),sub(tb[2],tb[0]));let size=norm(normal);if size<1e-14{continue}let normal=mul(normal,1./size);
   let(point,ba)=hits[0];let(_,bb)=closest(point,tb[0],tb[1],tb[2]);let weighted=|positions:&[V],t:[usize;3],b:[f64;3]|(0..3).fold([0.;3],|sum,k|add(sum,mul(positions[t[k]],b[k])));
   let previous=dot(sub(weighted(old,*a,ba),weighted(old,b,bb)),normal);let center=dot(sub(mul(add(add(ta[0],ta[1]),ta[2]),1./3.),mul(add(add(tb[0],tb[1]),tb[2]),1./3.)),normal);let sign=if previous.abs()>1e-9{previous.signum()}else if center.abs()>1e-9{center.signum()}else{1.};let n=mul(normal,sign);
   // Separate the intersecting triangles' complete projected intervals. Moving
   // only the intersection point by h can leave a deeply crossed vertex behind.
   // Choose the plane minimizing inverse-mass-weighted squared displacement;
   // fixed vertices bound its feasible interval and are never moved.
   // A sewn group is one contact degree of freedom. Moving just one duplicate
   // can remove a crossing by opening the seam at the final timestep.
   let mut nodes:Vec<(usize,f64,f64)>=Vec::new();for(t,side)in [(*a,1.),(b,-1.)]{for v in t{let r=roots[v];let scalar=dot(p[v],n);if let Some(node)=nodes.iter_mut().find(|node|node.0==r){node.1=if side>0.{node.1.min(scalar)}else{node.1.max(scalar)};}else{nodes.push((r,scalar,side));}}}
   let mut lo=nodes.iter().map(|node|node.1).fold(f64::INFINITY,f64::min)-h;let mut hi=nodes.iter().map(|node|node.1).fold(f64::NEG_INFINITY,f64::max)+h;for &(r,s,side)in &nodes{if weight[r]==0.{if side>0.{hi=hi.min(s-h/2.);}else{lo=lo.max(s+h/2.);}}}if lo>hi{continue}
   for _ in 0..48{let mid=(lo+hi)/2.;let derivative=nodes.iter().map(|&(r,s,side)|{if weight[r]==0.{0.}else if side>0.{(mid+h/2.-s).max(0.)/weight[r]}else{(mid-h/2.-s).min(0.)/weight[r]}}).sum::<f64>();if derivative>0.{hi=mid;}else{lo=mid;}}
   let plane=(lo+hi)/2.;let mut moved=false;for &(r,s,side)in &nodes{if weight[r]==0.{continue}let delta=if side>0.{(plane+h/2.-s).max(0.)}else{(plane-h/2.-s).min(0.)};if delta!=0.{for &v in &members[r]{p[v]=add(p[v],mul(n,delta));}moved=true;}}if moved{count+=1;}
  }
 }Ok(count)
}
pub(super) fn segment_pair(a:V,b:V,c:V,d:V)->(V,V,f64,f64){let u=sub(b,a);let v=sub(d,c);let r=sub(a,c);let aa=dot(u,u);let bb=dot(u,v);let cc=dot(v,v);let dd=dot(u,r);let ee=dot(v,r);let det=aa*cc-bb*bb;let mut s=if det>1e-20{((bb*ee-cc*dd)/det).clamp(0.,1.)}else{0.};let t=if cc>1e-20{((bb*s+ee)/cc).clamp(0.,1.)}else{0.};if aa>1e-20{s=((bb*t-dd)/aa).clamp(0.,1.);}(lerp(a,b,s),lerp(c,d,t),s,t)}
pub fn edge_project(p:&mut[V],old:&[V],edges:&[[usize;2]],w:&[f64],h:f64,excluded:&HashSet<(usize,usize)>)->usize{
 let s=Surface{positions:p.to_vec(),triangles:edges.iter().map(|e|[e[0],e[1],e[1]]).collect(),previous_positions:Some(old.to_vec())};let tree=Tree::new(&s);let mut ids=Vec::new();let mut count=0;
 for (i,e) in edges.iter().enumerate(){let(lo,hi)=bounds([old[e[0]],old[e[1]],p[e[0]],p[e[1]]].into_iter());tree.query(lo,hi,h,&mut ids);for &j in &ids{if j<=i{continue}let b=edges[j];if e.iter().any(|a|b.contains(a))||e.iter().any(|&a|b.iter().any(|&b|excluded.contains(&(a.min(b),a.max(b))))){continue}
  let(aq,bq,mut u,mut v)=segment_pair(p[e[0]],p[e[1]],p[b[0]],p[b[1]]);let diff=sub(aq,bq);let len=norm(diff);let mut delta=if len>1e-10&&len<h{Some(mul(diff,(h-len)/len))}else{None};
  if delta.is_none(){for t in crossing_roots(old[e[0]],p[e[0]],[old[e[1]],old[b[0]],old[b[1]]],[p[e[1]],p[b[0]],p[b[1]]]){let(a,bp,x,y)=segment_pair(lerp(old[e[0]],p[e[0]],t),lerp(old[e[1]],p[e[1]],t),lerp(old[b[0]],p[b[0]],t),lerp(old[b[1]],p[b[1]],t));if norm(sub(a,bp))<1e-7{let normal=sub(lerp(old[e[0]],old[e[1]],x),lerp(old[b[0]],old[b[1]],y));if norm(normal)>1e-10{u=x;v=y;delta=Some(sub(mul(normal,h/norm(normal)),sub(lerp(p[e[0]],p[e[1]],u),lerp(p[b[0]],p[b[1]],v))));break}}}}
  if let Some(d)=delta{let k=[1.-u,u,-(1.-v),-v];let ids=[e[0],e[1],b[0],b[1]];let mass=(0..4).map(|j|w[ids[j]]*k[j]*k[j]).sum::<f64>();if mass>0.{for j in 0..4{p[ids[j]]=add(p[ids[j]],mul(d,w[ids[j]]*k[j]/mass));}count+=1;}}
 }}count
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn nonadjacent_face_recovery_resolves_crossings_and_keeps_pins(){
  let old=vec![[-1.,-1.,0.],[1.,-1.,0.],[0.,1.,0.],[0.,-0.5,1.],[0.5,-0.5,1.],[0.,0.5,1.]];let mut p=old.clone();p[3][2]=-0.25;let faces=[[0,1,2],[3,4,5]];let w=[0.,0.,0.,1.,1.,1.];let roots=[0,1,2,3,4,5];assert!(!face_hits(p[..3].try_into().unwrap(),p[3..].try_into().unwrap()).is_empty());
  let mut hits=0;for _ in 0..8{hits+=self_project_faces(&mut p,&old,&faces,&w,&roots,0.006).unwrap();}assert!(hits>0);assert!(face_hits(p[..3].try_into().unwrap(),p[3..].try_into().unwrap()).is_empty());assert_eq!(&p[..3],&old[..3]);assert!(p.iter().all(|&v|valid(v)));
  let mut fixed=old.clone();fixed[3][2]=-0.25;let before=fixed.clone();assert_eq!(self_project_faces(&mut fixed,&old,&faces,&[0.;6],&roots,0.006).unwrap(),0);assert_eq!(fixed,before);
  let mut sewn=before.clone();assert_eq!(self_project_faces(&mut sewn,&old,&faces,&w,&[0,1,2,0,4,5],0.006).unwrap(),0);assert_eq!(sewn,before);
  let mut paired=before.clone();paired.push(add(before[3],[0.00002,0.,0.]));let mut prior=old.clone();prior.push(add(old[3],[0.00002,0.,0.]));let offset=sub(paired[6],paired[3]);assert!(self_project_faces(&mut paired,&prior,&faces,&[0.,0.,0.,1.,1.,1.,1.],&[0,1,2,3,4,5,3],0.006).unwrap()>0);assert!(norm(sub(sub(paired[6],paired[3]),offset))<1e-14);
 }
 #[test]fn conservative_face_rejection_matches_unculled_intersections_across_scale_winding_and_grazing(){
  let mut seed=0x12a4b91u64;let mut sample=||{seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1);((seed>>11)as f64/9007199254740992.)*2.-1.};let mut rejected=0;let mut intersecting=0;
  for i in 0..4096{let scale=[0.001,1.,1000.][i%3];let shift=if i%2==0{[0.;3]}else{[1000.,-1000.,500.]};let a=std::array::from_fn(|_|std::array::from_fn(|j|sample()*scale+shift[j]));let mut b=std::array::from_fn(|_|std::array::from_fn(|j|sample()*scale+shift[j]));if i%4==0{b.swap(0,2);}let raw=face_hits(a,b);if !raw.is_empty(){intersecting+=1;}if faces_separated(a,b){rejected+=1;}assert_eq!(face_hits_fast(a,b),raw,"case {i}");}
  assert!(rejected>1000&&intersecting>100);
  let a=[[-1.,-1.,0.],[1.,-1.,0.],[0.,1.,0.]];for z in [-1e-6,-1e-7,-1e-8,-1e-10,0.,1e-10,1e-8,1e-7,1e-6]{let b=[[-0.5,0.,z],[0.5,0.,z],[0.,0.5,-z]];assert_eq!(face_hits_fast(a,b),face_hits(a,b));let line=[[0.,0.,z];3];assert_eq!(face_hits_fast(a,line),face_hits(a,line));}
 }
 #[test]fn coulomb_displacement_is_bounded_by_normal_contact(){let s=Surface{positions:vec![[-1.,0.,-1.],[1.,0.,-1.],[0.,0.,1.]],triangles:vec![[0,1,2]],previous_positions:None};let tree=Tree::new(&s);let(p,n)=project_physical([0.,0.003,0.],[0.01,0.001,0.],&s,&tree,0.003,0.5);assert!(n>0);assert!((p[0]-0.009).abs()<1e-10);assert!((p[1]-0.003).abs()<1e-10);let(q,n)=project_physical([0.,0.004,0.],[0.01,0.004,0.],&s,&tree,0.003,0.5);assert_eq!(n,0);assert_eq!(q,[0.01,0.004,0.]);}

 #[test]fn physical_swept_contact_keeps_frictionless_tangential_motion(){let s=Surface{positions:vec![[-2.,0.,-2.],[2.,0.,-2.],[0.,0.,2.]],triangles:vec![[0,1,2]],previous_positions:None};let tree=Tree::new(&s);let(p,hits)=project_physical([0.,1.,0.],[0.3,-1.,0.2],&s,&tree,0.003,0.);assert!(hits>0);assert!((p[0]-0.3).abs()<1e-12);assert!((p[1]-0.003).abs()<1e-12);assert!((p[2]-0.2).abs()<1e-12);}
 #[test]fn catches_fast_vertex_crossing(){let s=Surface{positions:vec![[-1.,0.,-1.],[1.,0.,-1.],[0.,0.,1.]],triangles:vec![[0,1,2]],previous_positions:None};let tree=Tree::new(&s);let(p,n)=project([0.,2.,0.],[0.,-2.,0.],&s,&tree,0.003,0.);assert!(n>0&&p[1]>=0.0029);}
 #[test]fn moving_triangle_crosses_stationary_point(){let old=[[-1.,-1.,-1.],[1.,-1.,-1.],[0.,-1.,1.]];let new=old.map(|p|add(p,[0.,2.,0.]));assert!(swept([0.,0.,0.],[0.,0.,0.],old,new).is_some());}
 #[test]fn swept_edges(){let old=vec![[-1.,1.,0.],[1.,1.,0.],[0.,0.,-1.],[0.,0.,1.]];let mut p=old.clone();p[0][1]=-1.;p[1][1]=-1.;assert!(edge_project(&mut p,&old,&[[0,1],[2,3]],&[1.,1.,0.,0.],0.003,&HashSet::new())>0);assert!(p[0][1]>0.);}
 fn tetra()->Surface{Surface{positions:vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]],triangles:vec![[0,2,1],[0,1,3],[0,3,2],[1,2,3]],previous_positions:None}}
 #[test]fn solid_placement_uses_parity_and_exact_nearest_surface(){for reverse in [false,true]{let mut s=tetra();if reverse{for t in &mut s.triangles{t.swap(0,1);}}let tree=Tree::new(&s);assert!(tree.inside([0.1,0.1,0.1],&s));assert!(!tree.inside([1.,1.,1.],&s));let(p,hit)=solid_project([0.1,0.1,0.1],&s,&tree,0.003);assert!(hit&&!tree.inside(p,&s));let(q,_)=tree.nearest([2.,0.,0.],&s).unwrap();assert!(norm(sub(q,[1.,0.,0.]))<1e-10);}}
 #[test]fn body_crossing_a_cloth_face_is_not_hidden_by_outside_cloth_vertices(){let s=tetra();let tree=Tree::new(&s);let mut p=vec![[-1.,-1.,0.2],[2.,-1.,0.2],[0.,2.,0.2]];let faces=[[0,1,2]];assert!(p.iter().all(|&p|!tree.inside(p,&s)));assert_eq!(face_intersections(&p,&faces,&s,&tree),1);assert!(project_faces(&mut p,&faces,&[1.;3],&s,&tree,0.003)>0);assert!(p.iter().flatten().all(|v|v.is_finite()));assert_eq!(project_faces(&mut p,&faces,&[0.;3],&s,&tree,0.003),0);}
}

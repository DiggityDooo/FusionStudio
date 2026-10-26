//! Read-only, budgeted inspection of a rendered mesh against a body surface.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Request{positions:Vec<V>,faces:Vec<[usize;3]>,body:contact::Surface,clearance:f64,work_budget:Option<usize>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct BodyTopology{vertices:usize,triangles:usize,boundary_edges:usize,nonmanifold_edges:usize,degenerate_faces:usize,closed:bool,weld_tolerance_m:f64}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Audit{version:usize,complete:bool,face_scan_complete:bool,budget_exhausted:bool,work:usize,work_budget:usize,faces_inspected:usize,vertices_inspected:usize,tested_pairs:usize,crossing_faces:usize,coplanar_faces:usize,clearance_faces:usize,inside_vertices:Option<usize>,minimum_tested_gap_m:Option<f64>,required_gap_m:f64,gap_tolerance_m:f64,body_topology:Option<BodyTopology>,sample_faces:Vec<usize>,milliseconds:f64}
fn charge(work:&mut usize,limit:usize)->bool{if *work>=limit{false}else{*work+=1;true}}
fn body_topology(s:&contact::Surface,work:&mut usize,limit:usize)->Option<BodyTopology>{
 let mut weld=HashMap::new();let mut roots=Vec::with_capacity(s.positions.len());for p in &s.positions{if !charge(work,limit){return None}let key=p.map(|v|(v*1e7).round()as i64);let next=weld.len();roots.push(*weld.entry(key).or_insert(next));}
 let mut edges:HashMap<(usize,usize),usize>=HashMap::new();let mut degenerate=0;for t in &s.triangles{if !charge(work,limit){return None}let [a,b,c]=t.map(|i|roots[i]);if a==b||b==c||a==c||norm(cross(sub(s.positions[t[1]],s.positions[t[0]]),sub(s.positions[t[2]],s.positions[t[0]])))<1e-14{degenerate+=1;continue}for(a,b)in[(a,b),(b,c),(c,a)]{*edges.entry((a.min(b),a.max(b))).or_default()+=1;}}
 let boundary=edges.values().filter(|&&n|n==1).count();let nonmanifold=edges.values().filter(|&&n|n>2).count();Some(BodyTopology{vertices:weld.len(),triangles:s.triangles.len(),boundary_edges:boundary,nonmanifold_edges:nonmanifold,degenerate_faces:degenerate,closed:boundary==0&&nonmanifold==0&&degenerate==0,weld_tolerance_m:1e-7})
}
fn plane_distance(plane:[V;3],points:[V;3])->f64{let n=cross(sub(plane[1],plane[0]),sub(plane[2],plane[0]));let len=norm(n);if len<1e-14{return 0.}let d=points.map(|p|dot(sub(p,plane[0]),n)/len);if d.iter().all(|&v|v>=0.){d.into_iter().fold(f64::INFINITY,f64::min)}else if d.iter().all(|&v|v<=0.){d.into_iter().map(f64::abs).fold(f64::INFINITY,f64::min)}else{0.}}
pub fn run(q:Request)->Result<Audit,String>{
 let n=q.positions.len();let limit=q.work_budget.unwrap_or(20_000_000);if n<3||n>120000||q.faces.is_empty()||q.faces.len()>120000||!q.positions.iter().all(|&p|valid(p))||q.faces.iter().any(|t|t.iter().any(|&i|i>=n)||t[0]==t[1]||t[1]==t[2]||t[2]==t[0])||!q.clearance.is_finite()||q.clearance<0.||q.clearance>0.02||!(100..=50_000_000).contains(&limit){return Err("Surface inspection needs finite indexed geometry up to 120,000 vertices/faces, a 0–20 mm gap and a 100–50,000,000 work budget".into())}
 contact::validate(&q.body)?;if q.body.positions.is_empty()||q.body.triangles.is_empty()||q.body.previous_positions.is_some(){return Err("Surface inspection requires a nonempty stationary evaluated body".into())}
 for t in &q.faces{if norm(cross(sub(q.positions[t[1]],q.positions[t[0]]),sub(q.positions[t[2]],q.positions[t[0]])))<1e-14{return Err("Surface inspection found a collapsed rendered face".into())}}
 let start=std::time::Instant::now();let mut a=Audit{version:1,complete:false,face_scan_complete:false,budget_exhausted:false,work:0,work_budget:limit,faces_inspected:0,vertices_inspected:0,tested_pairs:0,crossing_faces:0,coplanar_faces:0,clearance_faces:0,inside_vertices:None,minimum_tested_gap_m:None,required_gap_m:q.clearance,gap_tolerance_m:1e-6f64.min(q.clearance*0.01),body_topology:None,sample_faces:Vec::new(),milliseconds:0.};
 a.body_topology=body_topology(&q.body,&mut a.work,limit);if a.body_topology.is_none(){a.budget_exhausted=true;a.milliseconds=start.elapsed().as_secs_f64()*1000.;return Ok(a)}
 let tree=contact::Tree::new(&q.body);let mut candidates=Vec::new();
 // Broadphase must cover the same 10 nm intersection tolerance as narrowphase,
 // including a zero requested gap and Float32/Float64 boundary roundoff.
 'faces:for(f,t)in q.faces.iter().enumerate(){let tri=t.map(|i|q.positions[i]);let lo=std::array::from_fn(|k|tri.iter().map(|p|p[k]).fold(f64::INFINITY,f64::min));let hi=std::array::from_fn(|k|tri.iter().map(|p|p[k]).fold(f64::NEG_INFINITY,f64::max));if !tree.query_limited(lo,hi,q.clearance.max(1e-8),&mut candidates,&mut a.work,limit){a.budget_exhausted=true;break}let mut crossing=false;let mut overlap=false;let mut minimum=f64::INFINITY;
  for &i in &candidates{if !charge(&mut a.work,limit){a.budget_exhausted=true;break 'faces}a.tested_pairs+=1;let body=q.body.triangles[i].map(|j|q.body.positions[j]);
   if !contact::face_hits_fast(tri,body).is_empty(){crossing=true;minimum=0.;continue}
   if cloth_contact::coplanar_overlap(tri,body){overlap=true;minimum=0.;continue}
   if plane_distance(tri,body).max(plane_distance(body,tri))>=q.clearance+1e-7{continue}
   // Include both vertex/face directions and every edge pair. Vertex-only
   // distance tests miss a thin limb through a rendered triangle interior.
   for (points,surface)in[(tri,body),(body,tri)]{for p in points{if !charge(&mut a.work,limit){a.budget_exhausted=true;break 'faces}minimum=minimum.min(norm(sub(p,contact::closest(p,surface[0],surface[1],surface[2]).0)));}}
   for x in 0..3{for y in 0..3{if !charge(&mut a.work,limit){a.budget_exhausted=true;break 'faces}let(p,r,_,_)=contact::segment_pair(tri[x],tri[(x+1)%3],body[y],body[(y+1)%3]);minimum=minimum.min(norm(sub(p,r)));}}
  }
  a.faces_inspected+=1;if crossing{a.crossing_faces+=1;}if overlap{a.coplanar_faces+=1;}let close=minimum<q.clearance-a.gap_tolerance_m;if close{a.clearance_faces+=1;}if minimum.is_finite(){a.minimum_tested_gap_m=Some(a.minimum_tested_gap_m.unwrap_or(f64::INFINITY).min(minimum));}if(crossing||overlap||close)&&a.sample_faces.len()<32{a.sample_faces.push(f);}
 }
 a.face_scan_complete=a.faces_inspected==q.faces.len();
 if !a.budget_exhausted&&a.body_topology.as_ref().unwrap().closed{let mut inside=0;for p in &q.positions{match tree.inside_limited(*p,&q.body,&mut a.work,limit){Some(hit)=>{a.vertices_inspected+=1;if hit{inside+=1;}},None=>{a.budget_exhausted=true;break}}}a.inside_vertices=Some(inside);}
 a.complete=a.face_scan_complete&&a.vertices_inspected==n;a.milliseconds=start.elapsed().as_secs_f64()*1000.;Ok(a)
}
#[cfg(test)]mod tests{use super::*;
 fn tetra()->contact::Surface{contact::Surface{positions:vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]],triangles:vec![[0,2,1],[0,1,3],[0,3,2],[1,2,3]],previous_positions:None}}
 fn request(p:Vec<V>)->Request{Request{positions:p,faces:vec![[0,1,2]],body:tetra(),clearance:0.001,work_budget:None}}
 #[test]fn rendered_face_interiors_cannot_hide_a_body_crossing(){let a=run(request(vec![[-1.,-1.,0.2],[2.,-1.,0.2],[0.,2.,0.2]])).unwrap();assert!(a.complete);assert_eq!(a.crossing_faces,1);assert_eq!(a.inside_vertices,Some(0));assert!(a.body_topology.unwrap().closed);}
 #[test]fn closed_body_inside_and_vertex_face_gap_are_distinct(){let a=run(request(vec![[0.1,0.1,0.1],[0.2,0.1,0.1],[0.1,0.2,0.1]])).unwrap();assert!(a.complete);assert_eq!(a.inside_vertices,Some(3));assert_eq!(a.crossing_faces,0);let a=run(request(vec![[-0.0005,0.1,0.1],[-0.0005,0.2,0.1],[-0.0005,0.1,0.2]])).unwrap();assert_eq!(a.clearance_faces,1);assert!((a.minimum_tested_gap_m.unwrap()-0.0005).abs()<1e-12);}
 #[test]fn a_coplanar_touch_is_reported_even_with_zero_requested_clearance(){let mut q=request(vec![[0.1,0.1,0.],[0.2,0.1,0.],[0.1,0.2,0.]]);q.clearance=0.;let a=run(q).unwrap();assert!(a.complete);assert_eq!(a.coplanar_faces,1);assert_eq!(a.minimum_tested_gap_m,Some(0.));}
 #[test]fn open_body_and_budget_exhaustion_are_explicit_incomplete_results(){let mut q=request(vec![[2.,2.,2.],[3.,2.,2.],[2.,3.,2.]]);q.body.triangles.pop();let a=run(q).unwrap();assert!(!a.complete);assert!(a.face_scan_complete);assert_eq!(a.inside_vertices,None);assert!(a.body_topology.unwrap().boundary_edges>0);let mut q=request(vec![[-1.,-1.,0.2],[2.,-1.,0.2],[0.,2.,0.2]]);q.positions=vec![[0.1,0.1,0.1];120000];q.positions[1]=[0.2,0.1,0.1];q.positions[2]=[0.1,0.2,0.1];q.work_budget=Some(100);let a=run(q).unwrap();assert!(!a.complete);assert!(a.budget_exhausted);assert_eq!(a.work,100);}
}

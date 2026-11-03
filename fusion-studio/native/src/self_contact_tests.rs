//! Frictionless swept self-contact invariants, independent of material tuning.
use super::*;
use super::contact::{self_project,edge_project};

fn frame(p:V,rotation:usize)->V{
 let q=match rotation{0=>p,1=>[-p[1],p[0],p[2]],_=>{let(c,s)=(0.37f64.cos(),0.37f64.sin());let x=c*p[0]-s*p[2];let z=s*p[0]+c*p[2];let(c,s)=(0.19f64.cos(),0.19f64.sin());[c*x-s*p[1],s*x+c*p[1],z]}};
 add(q,[2.,0.5,-1.])
}
fn vector_frame(p:V,rotation:usize)->V{sub(frame(p,rotation),frame([0.;3],rotation))}
fn tangent_preserved(before:&[V],after:&[V],normal:V){for (&a,&b) in before.iter().zip(after){let d=sub(b,a);assert!(norm(sub(d,mul(normal,dot(d,normal))))<1e-10,"Frictionless correction removed tangent: {a:?} -> {b:?}");}}

#[test]
fn swept_self_vertex_keeps_slide_with_moving_support_reversed_sides_and_rigid_frames(){
 for rotation in 0..3{for side in [-1.,1.]{for motion in [[0.;3],[0.07,0.01,-0.04]]{
  let old:Vec<_>=vec![[-2.,0.,-2.],[2.,0.,-2.],[0.,0.,2.],[0.,side,0.]].into_iter().map(|p|frame(p,rotation)).collect();
  let mut p:Vec<_>=vec![[-2.,0.,-2.],[2.,0.,-2.],[0.,0.,2.],[0.3,-side,0.2]].into_iter().map(|p|frame(add(p,motion),rotation)).collect();
  let fixed=p[..3].to_vec();let hits=self_project(&mut p,&old,&[[0,1,2]],&[0.,0.,0.,1.],0.003,&HashSet::new());
  assert!(hits>0);assert_eq!(&p[..3],fixed);let expected=frame(add([0.3,side*0.003,0.2],motion),rotation);
  assert!(norm(sub(p[3],expected))<1e-10,"Swept self-contact lost free slide: {:?}, expected {expected:?}",p[3]);
 }}}
}

#[test]
fn swept_self_vertex_uses_only_normal_impulses_and_conserves_mass_weighted_translation(){
 let old=vec![[-2.,0.,-2.],[2.,0.,-2.],[0.,0.,2.],[0.,1.,0.]];
 let mut_p=vec![[-2.,0.,-2.],[2.,0.,-2.],[0.,0.,2.],[0.3,-1.,0.2]];
 let mut p=mut_p.clone();let w=[0.5,1.,2.,1.];assert!(self_project(&mut p,&old,&[[0,1,2]],&w,0.003,&HashSet::new())>0);
 tangent_preserved(&mut_p,&p,[0.,1.,0.]);
 let momentum=(0..4).fold([0.;3],|sum,i|add(sum,mul(sub(p[i],mut_p[i]),1./w[i])));assert!(norm(momentum)<1e-12);
 let bary=[0.2,0.275,0.525];let support=(0..3).fold([0.;3],|sum,i|add(sum,mul(p[i],bary[i])));
 assert!((p[3][1]-support[1]-0.003).abs()<1e-12);
}

#[test]
fn swept_self_edges_keep_slide_with_moving_support_reversed_sides_and_rigid_frames(){
 for rotation in 0..3{for side in [-1.,1.]{for motion in [[0.;3],[0.07,0.01,-0.04]]{
  let old:Vec<_>=vec![[-2.,0.,0.],[2.,0.,0.],[-0.5,side,-1.],[0.5,side,1.]].into_iter().map(|p|frame(p,rotation)).collect();
  let mut p:Vec<_>=vec![[-2.,0.,0.],[2.,0.,0.],[-0.2,-side,-0.8],[0.8,-side,1.2]].into_iter().map(|p|frame(add(p,motion),rotation)).collect();
  let before=p.clone();assert!(edge_project(&mut p,&old,&[[0,1],[2,3]],&[0.,0.,1.,1.],0.003,&HashSet::new())>0);
  assert_eq!(&p[..2],&before[..2]);tangent_preserved(&before,&p,vector_frame([0.,1.,0.],rotation));
  // Independent intersection parameters at t=1/2 for these translating edges.
  let support=add(mul(p[0],0.475),mul(p[1],0.525));let moving=add(mul(p[2],0.55),mul(p[3],0.45));
  assert!((dot(sub(moving,support),vector_frame([0.,1.,0.],rotation))-side*0.003).abs()<1e-10);
 }}}
}

#[test]
fn detailed_two_layer_patch_preserves_all_free_slide_during_swept_vertex_face_contact(){
 let small=16usize;let large=64usize;let mut old=Vec::new();let mut p=Vec::new();let mut w=Vec::new();let mut faces=Vec::new();
 for z in 0..=small{for x in 0..=small{let a=[-0.45+x as f64*0.9/small as f64,0.04,-0.45+z as f64*0.9/small as f64];old.push(a);p.push(add(a,[0.01,-0.08,0.007]));w.push(1.);}}
 let free=p.len();
 for z in 0..small{for x in 0..small{let a=z*(small+1)+x;faces.push([a,a+1,a+small+2]);faces.push([a,a+small+2,a+small+1]);}}
 for z in 0..=large{for x in 0..=large{let a=[-1.+x as f64*2./large as f64,0.,-1.+z as f64*2./large as f64];old.push(a);p.push(a);w.push(0.);}}
 for z in 0..large{for x in 0..large{let a=free+z*(large+1)+x;faces.push([a,a+1,a+large+2]);faces.push([a,a+large+2,a+large+1]);}}
 // Isolate cross-layer contact. The free patch stays flat and is deliberately
 // exempt from within-layer contact; this does not certify folded adjacency.
 let mut excluded=HashSet::new();for a in 0..free{for b in a+1..free{excluded.insert((a,b));}}
 let before=p.clone();let source=old.clone();let topology=faces.clone();assert_eq!(faces.len(),8704);
 assert!(self_project(&mut p,&old,&faces,&w,0.003,&excluded)>=free);
 assert_eq!(old,source);assert_eq!(faces,topology);assert_eq!(&p[free..],&before[free..]);
 for i in 0..free{assert!((p[i][0]-before[i][0]).abs()<1e-10&&(p[i][2]-before[i][2]).abs()<1e-10,"Detailed patch lost tangential motion at {i}");assert!(p[i][1]>=0.003-1e-10);}
}

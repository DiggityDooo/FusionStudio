//! Bounded block Jacobi: keep the three spatial components and small sewing
//! junctions coupled. This changes solve efficiency, not the material energy.
use super::*;
fn contact_patches(n:usize,sewing:&[[usize;2]],contacts:&[face_support::Plane])->Vec<Vec<usize>>{
 fn root(parents:&[usize],mut i:usize)->usize{while parents[i]!=i{i=parents[i];}i}
 let mut parents:Vec<_>=(0..n).collect();let mut sizes=vec![1usize;n];for group in sewing_groups(n,sewing).into_values(){if group.len()<=8{let at=group[0];sizes[at]=group.len();for &i in &group{parents[i]=at;}}}
 for plane in contacts{let mut roots:Vec<_>=plane.ids.iter().map(|&i|root(&parents,i)).collect();roots.sort_unstable();roots.dedup();let size:usize=roots.iter().map(|&i|sizes[i]).sum();if size>8{continue}let at=roots[0];for &i in &roots[1..]{parents[i]=at;}sizes[at]=size;}
 let mut groups:BTreeMap<usize,Vec<usize>>=BTreeMap::new();for i in 0..n{groups.entry(root(&parents,i)).or_default().push(i);}groups.into_values().collect()
}
pub struct Block {ids:Vec<usize>,lower:Vec<f64>}
pub struct Preconditioner {blocks:Vec<Block>}
impl Preconditioner {
 pub fn new(inertia:&[f64],w:&[f64],terms:&[material_solver::Term],seams:&[Constraint],supports:&[Option<V>],contacts:&[face_support::Plane])->Self{
  let n=inertia.len();let sewing:Vec<_>=seams.iter().map(|s|[s.a,s.b]).collect();let mut blocks=Vec::new();let mut lookup=vec![(0,0);n];
  for group in contact_patches(n,&sewing,contacts){
   // Pathological many-way junctions cannot allocate quadratic global memory.
   let groups=if group.len()<=8{vec![group]}else{group.into_iter().map(|i|vec![i]).collect()};
   for ids in groups{let index=blocks.len();for (local,&i) in ids.iter().enumerate(){lookup[i]=(index,local);}let size=ids.len()*3;let mut lower=vec![0.;size*size];for (local,&i) in ids.iter().enumerate(){for a in 0..3{lower[(local*3+a)*size+local*3+a]=inertia[i];}}blocks.push(Block{ids,lower});}
  }
  for term in terms{for i in 0..term.len{let (block,local)=lookup[term.ids[i]];let b=&mut blocks[block];let size=b.ids.len()*3;for j in 0..term.len{let (other,column)=lookup[term.ids[j]];if block!=other{continue}for a in 0..3{for c in 0..3{b.lower[(local*3+a)*size+column*3+c]+=term.k*term.g[i][a]*term.g[j][c];}}}}}
  for b in &mut blocks{let size=b.ids.len()*3;for (local,&i) in b.ids.iter().enumerate(){if w[i]==0.{for a in 0..3{let at=local*3+a;for j in 0..size{b.lower[at*size+j]=0.;b.lower[j*size+at]=0.;}b.lower[at*size+at]=1.;}}}
   // Invert the constrained block P H P + (I-P), rather than projecting an
   // unconstrained inverse afterward. The latter is a poor approximation
   // when stiff sewing couples particles with different contact normals.
   for (local,&i) in b.ids.iter().enumerate(){if w[i]==0.{continue}if let Some(normal)=supports.get(i).copied().flatten(){let offset=local*3;
    for column in 0..size{let value=(0..3).map(|a|normal[a]*b.lower[(offset+a)*size+column]).sum::<f64>();for a in 0..3{b.lower[(offset+a)*size+column]-=normal[a]*value;}}
    for row in 0..size{let value=(0..3).map(|a|b.lower[row*size+offset+a]*normal[a]).sum::<f64>();for a in 0..3{b.lower[row*size+offset+a]-=normal[a]*value;}}
    for a in 0..3{for c in 0..3{b.lower[(offset+a)*size+offset+c]+=normal[a]*normal[c];}}
   }}
   let diagonal:Vec<_>=(0..size).map(|i|b.lower[i*size+i]).collect();let mut valid=true;
   for i in 0..size{for j in 0..=i{let value=b.lower[i*size+j]-(0..j).map(|k|b.lower[i*size+k]*b.lower[j*size+k]).sum::<f64>();if i==j{if !value.is_finite()||value<=0.{valid=false;break}b.lower[i*size+i]=value.sqrt();}else{b.lower[i*size+j]=value/b.lower[j*size+j];}}if !valid{break}}
   // Extreme legal stiffness/mass ratios may lose positive definiteness in
   // floating point; a positive diagonal remains a safe preconditioner.
   if !valid{b.lower.fill(0.);for i in 0..size{b.lower[i*size+i]=diagonal[i].sqrt();}}
  }
  Self{blocks}
 }
 pub fn apply(&self,r:&[V])->Vec<V>{let mut out=vec![[0.;3];r.len()];for b in &self.blocks{let size=b.ids.len()*3;let mut value=[0.;24];for i in 0..size{value[i]=(r[b.ids[i/3]][i%3]-(0..i).map(|j|b.lower[i*size+j]*value[j]).sum::<f64>())/b.lower[i*size+i];}for i in (0..size).rev(){value[i]=(value[i]-(i+1..size).map(|j|b.lower[j*size+i]*value[j]).sum::<f64>())/b.lower[i*size+i];out[b.ids[i/3]][i%3]=value[i];}}out}
}

#[cfg(test)]mod tests{use super::*;
 #[test]fn active_face_patch_inverse_matches_rank_one_reference_for_unequal_masses(){let bary=[0.2,0.3,0.5];let term=material_solver::Term{ids:[0,1,2,0],g:[[0.,bary[0],0.],[0.,bary[1],0.],[0.,bary[2],0.],[0.;3]],len:3,k:1e5,value:0.};let plane=face_support::Plane{ids:[0,1,2],bary,normal:[0.,1.,0.],offset:0.,body_triangle:0};let inertia=[1.,2.,3.];let r=[[1.,3.,2.],[2.,-2.,4.],[3.,1.,6.]];let result=Preconditioner::new(&inertia,&[1.;3],&[term],&[],&[],&[plane]).apply(&r);let projection=(0..3).map(|i|bary[i]*r[i][1]/inertia[i]).sum::<f64>();let denominator=1.+1e5*(0..3).map(|i|bary[i]*bary[i]/inertia[i]).sum::<f64>();for i in 0..3{let expected=r[i][1]/inertia[i]-1e5*bary[i]/inertia[i]*projection/denominator;assert!((result[i][1]-expected).abs()<1e-10);assert!((result[i][0]-r[i][0]/inertia[i]).abs()<1e-10);}}
 #[test]fn coupled_spring_inverse_matches_analytic_solution_with_fixed_and_free_particles(){let terms=[material_solver::Term{ids:[0,1,0,0],g:[[1.,0.,0.],[-1.,0.,0.],[0.;3],[0.;3]],len:2,k:10.,value:0.}];let seams=[Constraint{a:0,b:1,rest:0.,compliance:0.1,lambda:0.}];let free=Preconditioner::new(&[1.,1.],&[1.,1.],&terms,&seams,&[],&[]).apply(&[[0.,0.,0.],[1.,2.,3.]]);assert!((free[0][0]-10./21.).abs()<1e-12);assert!((free[1][0]-11./21.).abs()<1e-12);assert_eq!(free[1][1..],[2.,3.]);let fixed=Preconditioner::new(&[1.,1.],&[0.,1.],&terms,&seams,&[],&[]).apply(&[[0.;3],[1.,2.,3.]]);assert_eq!(fixed[0],[0.;3]);assert!((fixed[1][0]-1./11.).abs()<1e-12);}
}

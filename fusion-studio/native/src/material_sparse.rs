//! Coupled sparse Cholesky for the same Gauss–Newton material system as PCG.
//! Fusion assembles the matrix; MIT-licensed faer supplies ordering/factorization.
//! Symbolic analysis and bounded workspaces are reused for one drape request.
use super::*;
use faer::{Conj, MatMut, Par, Side};
use faer::dyn_stack::{MemBuffer, MemStack, StackReq};
use faer::sparse::{SparseColMatRef, SymbolicSparseColMat};
use faer::sparse::linalg::cholesky::{self, SymbolicCholesky};
use faer::sparse::linalg::SupernodalThreshold;

const MAX_VERTICES:usize=12_000;
const MAX_MATRIX_ENTRIES:usize=1_500_000;
const MAX_WORKSPACE_BYTES:usize=512*1024*1024;
pub struct SparseSolver {
 pattern:SymbolicSparseColMat<usize>,symbolic:SymbolicCholesky<usize>,
 slots:HashMap<(usize,usize),[usize;9]>,values:Vec<f64>,factor:Vec<f64>,workspace:MemBuffer,
 pub factorizations:usize,pub refinements:usize,pub workspace_bytes:usize,pub phase_milliseconds:[f64;3],pub factorization_kind:&'static str,
}
fn zeroes(n:usize)->Result<Vec<f64>,String>{let mut v=Vec::new();v.try_reserve_exact(n).map_err(|_|"Physical sparse allocation failed")?;v.resize(n,0.);Ok(v)}
impl SparseSolver {
 pub fn new(n:usize,fabric:&[fabric::FabricTriangle],hinges:&[material::Hinge],seams:&[Constraint])->Result<Self,String>{
  Self::with_threshold(n,fabric,hinges,seams,SupernodalThreshold::AUTO)
 }
 fn with_threshold(n:usize,fabric:&[fabric::FabricTriangle],hinges:&[material::Hinge],seams:&[Constraint],threshold:SupernodalThreshold)->Result<Self,String>{
  if n>MAX_VERTICES{return Err(format!("Sparse cloth solve supports at most {MAX_VERTICES} vertices; choose PCG or reduce panel density"))}
  let mut pairs=std::collections::BTreeSet::new();for i in 0..n{pairs.insert((i,i));}
  let mut patch=|ids:&[usize]|->Result<(),String>{for &i in ids{for &j in ids{if i>=j{pairs.insert((i,j));}}}if pairs.len().saturating_mul(9)>MAX_MATRIX_ENTRIES{return Err("Sparse cloth graph exceeds 1.5 million matrix entries; choose PCG or simplify the mesh".into())}Ok(())};
  for t in fabric{patch(&t.ids)?;}for h in hinges{patch(&h.ids)?;}for c in seams{patch(&[c.a,c.b])?;}
  if pairs.len().saturating_mul(9)>MAX_MATRIX_ENTRIES{return Err("Sparse cloth graph exceeds 1.5 million matrix entries; choose PCG or simplify the mesh".into())}
  let dimension=n*3;let mut entries=Vec::with_capacity(pairs.len()*9);
  for &(i,j) in &pairs{for a in 0..3{for b in 0..3{let (row,col)=(i*3+a,j*3+b);if row>=col{entries.push((col,row));}}}}
  entries.sort_unstable();let mut columns=vec![0;dimension+1];let mut rows=Vec::with_capacity(entries.len());
  for &(col,row) in &entries{columns[col+1]+=1;rows.push(row);}for i in 0..dimension{columns[i+1]+=columns[i];}
  let mut slots=HashMap::with_capacity(pairs.len());for &(i,j) in &pairs{let mut indices=[usize::MAX;9];for a in 0..3{for b in 0..3{let (row,col)=(i*3+a,j*3+b);if row>=col{indices[a*3+b]=columns[col]+rows[columns[col]..columns[col+1]].binary_search(&row).map_err(|_|"Sparse cloth pattern mismatch")?;}}}slots.insert((i,j),indices);}
  let pattern=SymbolicSparseColMat::new_checked(dimension,dimension,columns,None,rows);
  let symbolic=cholesky::factorize_symbolic_cholesky(pattern.as_ref(),Side::Lower,Default::default(),cholesky::CholeskySymbolicParams{supernodal_flop_ratio_threshold:threshold,..Default::default()}).map_err(|e|format!("Sparse cloth analysis failed: {e:?}"))?;
  let factorization_kind=match symbolic.raw(){cholesky::SymbolicCholeskyRaw::Simplicial(_)=>"simplicial",cholesky::SymbolicCholeskyRaw::Supernodal(_)=>"supernodal"};
  let scratch=StackReq::or(symbolic.factorize_numeric_llt_scratch::<f64>(Par::Seq,Default::default()),symbolic.solve_in_place_scratch::<f64>(1,Par::Seq));
  let workspace_bytes=symbolic.len_val().saturating_mul(8).saturating_add(scratch.size_bytes()).saturating_add(entries.len()*16).saturating_add(slots.len()*104);
  if workspace_bytes>MAX_WORKSPACE_BYTES{return Err("Sparse cloth factor/workspace exceeds 512 MiB; choose PCG or reduce panel density".into())}
  let workspace=MemBuffer::try_new(scratch).map_err(|_|"Sparse cloth workspace allocation failed")?;
  let values=zeroes(entries.len())?;let factor=zeroes(symbolic.len_val())?;
  Ok(Self{pattern,symbolic,slots,values,factor,workspace,factorizations:0,refinements:0,workspace_bytes,phase_milliseconds:[0.;3],factorization_kind})
 }
 fn add_block(&mut self,i:usize,j:usize,block:[[f64;3];3])->Result<(),String>{
  let slots=self.slots.get(&(i,j)).ok_or("Sparse material term exceeds its retained mesh graph")?;
  for a in 0..3{for b in 0..3{let at=slots[a*3+b];if at!=usize::MAX{self.values[at]+=block[a][b];}}}Ok(())
 }
 pub fn factorize(&mut self,inertia:&[f64],w:&[f64],terms:&[material_solver::Term],supports:&[Option<V>])->Result<(),String>{
  let phase_started=std::time::Instant::now();self.values.fill(0.);
  for i in 0..inertia.len(){let mut block=[[0.;3];3];for a in 0..3{block[a][a]=if w[i]==0.{1.}else{inertia[i]};}
   if w[i]>0.{if let Some(normal)=supports.get(i).copied().flatten(){for a in 0..3{for b in 0..3{block[a][b]+=(1.-inertia[i])*normal[a]*normal[b];}}}}self.add_block(i,i,block)?;
  }
  for t in terms{let mut g=[[0.;3];4];for j in 0..t.len{let i=t.ids[j];if w[i]>0.{g[j]=t.g[j];if let Some(normal)=supports.get(i).copied().flatten(){g[j]=sub(g[j],mul(normal,dot(g[j],normal)));}}}
   for a in 0..t.len{for b in 0..t.len{let (i,j)=(t.ids[a],t.ids[b]);if i<j{continue}let mut block=[[0.;3];3];for r in 0..3{for c in 0..3{block[r][c]=t.k*g[a][r]*g[b][c];}}self.add_block(i,j,block)?;}}
  }
  if self.values.iter().any(|v|!v.is_finite()){return Err("Sparse cloth matrix contains nonfinite values".into())}
  self.phase_milliseconds[0]+=phase_started.elapsed().as_secs_f64()*1000.;let factor_started=std::time::Instant::now();
  self.symbolic.factorize_numeric_llt::<f64>(&mut self.factor,SparseColMatRef::new(self.pattern.as_ref(),&self.values),Side::Lower,Default::default(),Par::Seq,MemStack::new(&mut self.workspace),Default::default()).map_err(|e|format!("Sparse cloth factorization failed: {e:?}; reduce stiffness or use PCG"))?;
  self.factorizations+=1;self.phase_milliseconds[1]+=factor_started.elapsed().as_secs_f64()*1000.;Ok(())
 }
 pub fn solve(&mut self,rhs:&[V])->Result<Vec<V>,String>{
  let phase_started=std::time::Instant::now();let mut values:Vec<_>=rhs.iter().flatten().copied().collect();
  cholesky::LltRef::new(&self.symbolic,&self.factor).solve_in_place_with_conj(Conj::No,MatMut::from_column_major_slice_mut(&mut values,rhs.len()*3,1),Par::Seq,MemStack::new(&mut self.workspace));
  if values.iter().any(|v|!v.is_finite()){return Err("Sparse cloth solve produced nonfinite motion".into())}
  self.phase_milliseconds[2]+=phase_started.elapsed().as_secs_f64()*1000.;Ok(values.chunks_exact(3).map(|v|[v[0],v[1],v[2]]).collect())
 }
}

#[cfg(test)]mod tests{use super::*;
 #[test]#[ignore="manual private-fixture matrix benchmark; run after preparing sparse-policy-fixtures.json"]
 fn profile_factorization_policies(){
  let inputs:Vec<serde_json::Value>=serde_json::from_str(&std::fs::read_to_string("../test-output/sparse-policy-fixtures.json").unwrap()).unwrap();let mut rows=Vec::new();
  for input in inputs{let req:Drape=serde_json::from_value(input["request"].clone()).unwrap();let m=req.fabric_material.as_ref().unwrap();let rest=req.rest_positions.as_ref().unwrap();let n=rest.len();let mass=material::surface_mass(rest,&req.faces,m.density_kg_m2).unwrap();let mesh=Mesh{positions:rest.clone(),faces:req.faces.clone()};let topo=topology(&mesh).unwrap();let fabric:Vec<_>=req.faces.iter().map(|&ids|fabric::FabricTriangle::new(ids,req.material_coordinates.as_ref().unwrap()).unwrap()).collect();let mut hinges=Vec::new();for h in 0..topo.half_edges{let twin=topo.twins[h];if twin<0||(twin as usize)<h{continue}let t=req.faces[h/3];let i=h%3;let j=twin as usize;hinges.push(material::Hinge::new([t[i],t[(i+1)%3],t[(i+2)%3],req.faces[j/3][(j%3+2)%3]],rest,m.bending_nm).unwrap());}let compliance=material::seam_compliances(rest,&req.faces,&topo,&req.sewing,m.seam_npm2).unwrap();let seams:Vec<_>=req.sewing.iter().zip(compliance).map(|(&[a,b],compliance)|Constraint{a,b,rest:0.,compliance,lambda:0.}).collect();let p:Vec<V>=if input["positions"].is_array(){serde_json::from_value(input["positions"].clone()).unwrap()}else{req.positions.clone()};
   let mut terms=Vec::new();for (j,t) in fabric.iter().enumerate(){let(e,g)=t.sample(&p);for k in 0..3{terms.push(material_solver::Term{ids:[t.ids[0],t.ids[1],t.ids[2],0],g:[g[k][0],g[k][1],g[k][2],[0.;3]],len:3,k:mass.areas[j]*m.stiffness()[k],value:e[k]});}}for h in &hinges{if let Some((value,g,k))=h.term(&p){terms.push(material_solver::Term{ids:h.ids,g,len:4,k,value});}}for c in &seams{for axis in 0..3{let mut g=[0.;3];g[axis]=1.;terms.push(material_solver::Term{ids:[c.a,c.b,0,0],g:[g,mul(g,-1.),[0.;3],[0.;3]],len:2,k:1./c.compliance,value:0.});}}
   let inertia:Vec<_>=mass.masses.iter().map(|v|v/m.time_step.powi(2)).collect();let mut w=vec![1.;n];for &i in &req.pins{w[i]=0.;}let tree=req.triangle_collider.as_ref().map(contact::Tree::new);let supports:Vec<_>=p.iter().map(|&v|if v[1]<=req.thickness+1e-7{Some([0.,1.,0.])}else if let (Some(body),Some(tree))=(&req.triangle_collider,&tree){contact::support_normal(v,body,tree,req.thickness)}else{None}).collect();let rhs:Vec<_>=(0..n).map(|i|if w[i]==0.{[0.;3]}else if let Some(normal)=supports[i]{sub([1.,2.,-1.],mul(normal,dot([1.,2.,-1.],normal)))}else{[1.,2.,-1.]}).collect();
   for (policy,threshold) in [("auto",SupernodalThreshold::AUTO),("simplicial",SupernodalThreshold::FORCE_SIMPLICIAL),("supernodal",SupernodalThreshold::FORCE_SUPERNODAL)]{let mut solver=SparseSolver::with_threshold(n,&fabric,&hinges,&seams,threshold).unwrap();for _ in 0..12{solver.factorize(&inertia,&w,&terms,&supports).unwrap();solver.solve(&rhs).unwrap();}let row=serde_json::json!({"fixture":input["name"],"vertices":n,"triangles":req.faces.len(),"policy":policy,"kind":solver.factorization_kind,"matrixEntries":solver.values.len(),"factorEntries":solver.factor.len(),"workspaceBytes":solver.workspace_bytes,"repeats":12,"phaseMilliseconds":solver.phase_milliseconds});println!("{row}");rows.push(row);}
  }
  std::fs::write("../test-output/sparse-policy-results.json",serde_json::to_string_pretty(&rows).unwrap()).unwrap();
 }
 #[test]fn coupled_sparse_system_matches_manufactured_vector_and_oblique_support(){
  let seams=vec![Constraint{a:0,b:1,rest:0.,compliance:0.1,lambda:0.},Constraint{a:1,b:2,rest:0.,compliance:0.1,lambda:0.}];
  let terms=vec![material_solver::Term{ids:[0,1,0,0],g:[[1.,2.,-1.],[-2.,1.,3.],[0.;3],[0.;3]],len:2,k:100.,value:0.},material_solver::Term{ids:[1,2,0,0],g:[[3.,-2.,1.],[1.,2.,3.],[0.;3],[0.;3]],len:2,k:10.,value:0.}];
  let normal=mul([1.,2.,3.],1./14f64.sqrt());let support=[None,Some(normal),None];let w=[0.,1.,1.];let inertia=[1.,2.,3.];let exact=[[0.;3],sub([1.,0.,-2.],mul(normal,dot([1.,0.,-2.],normal))),[2.,-1.,3.]];
  let mut rhs:Vec<_>=exact.iter().zip(inertia).map(|(&v,m)|mul(v,m)).collect();for t in &terms{let s=(0..t.len).map(|j|dot(t.g[j],exact[t.ids[j]])).sum::<f64>()*t.k;for j in 0..t.len{let i=t.ids[j];rhs[i]=add(rhs[i],mul(t.g[j],s));}}rhs[0]=[0.;3];rhs[1]=sub(rhs[1],mul(normal,dot(rhs[1],normal)));
  let mut solver=SparseSolver::new(3,&[],&[],&seams).unwrap();solver.factorize(&inertia,&w,&terms,&support).unwrap();let solved=solver.solve(&rhs).unwrap();for i in 0..3{assert!(norm(sub(solved[i],exact[i]))<1e-10,"{i}: {:?} vs {:?}",solved[i],exact[i]);}assert_eq!(solver.factorizations,1);assert!(SparseSolver::new(MAX_VERTICES+1,&[],&[],&[]).is_err());
 }
}

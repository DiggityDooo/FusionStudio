//! Deterministic median-split bounding-volume hierarchy for point/proxy queries.
pub type V=[f64;3];
#[derive(Clone,Copy)]
pub struct Bounds{pub min:V,pub max:V}
struct Node{bounds:Bounds,children:Option<[usize;2]>,items:Vec<usize>}
pub struct Bvh{nodes:Vec<Node>,bounds:Vec<Bounds>}
impl Bvh{
 pub fn new(bounds:Vec<Bounds>)->Self{let mut tree=Self{nodes:Vec::new(),bounds};if !tree.bounds.is_empty(){tree.build((0..tree.bounds.len()).collect());}tree}
 fn build(&mut self,mut ids:Vec<usize>)->usize{
  let mut bounds=Bounds{min:[f64::INFINITY;3],max:[f64::NEG_INFINITY;3]};
  for &i in &ids{for a in 0..3{bounds.min[a]=bounds.min[a].min(self.bounds[i].min[a]);bounds.max[a]=bounds.max[a].max(self.bounds[i].max[a]);}}
  let index=self.nodes.len();self.nodes.push(Node{bounds,children:None,items:Vec::new()});
  if ids.len()<=4{self.nodes[index].items=ids;return index}
  let axis=(0..3).max_by(|&a,&b|(bounds.max[a]-bounds.min[a]).total_cmp(&(bounds.max[b]-bounds.min[b]))).unwrap();
  ids.sort_unstable_by(|&a,&b|(self.bounds[a].min[axis]+self.bounds[a].max[axis]).total_cmp(&(self.bounds[b].min[axis]+self.bounds[b].max[axis])).then(a.cmp(&b)));
  let right=ids.split_off(ids.len()/2);let a=self.build(ids);let b=self.build(right);self.nodes[index].children=Some([a,b]);index
 }
 pub fn query(&self,p:V,margin:f64,first:usize,out:&mut[usize;160])->usize{
  if self.nodes.is_empty(){return 0}let mut count=0;self.visit(0,p,margin,first,out,&mut count);out[..count].sort_unstable();count
 }
 fn contains(b:&Bounds,p:V,m:f64)->bool{(0..3).all(|a|p[a]>=b.min[a]-m&&p[a]<=b.max[a]+m)}
 fn visit(&self,index:usize,p:V,margin:f64,first:usize,out:&mut[usize;160],count:&mut usize){
  let node=&self.nodes[index];if !Self::contains(&node.bounds,p,margin){return}
  if let Some(children)=node.children{self.visit(children[0],p,margin,first,out,count);self.visit(children[1],p,margin,first,out,count)}
  else{for &i in &node.items{if i>=first&&Self::contains(&self.bounds[i],p,margin){out[*count]=i;*count+=1;}}}
 }
}
#[cfg(test)]
mod tests{use super::*;
 #[test]fn matches_linear(){let bounds:Vec<_>=(0..150).map(|i|{let x=(i%10) as f64;let y=(i/10) as f64;Bounds{min:[x,y,-0.1],max:[x+0.8,y+0.7,0.1]}}).collect();let tree=Bvh::new(bounds.clone());let mut out=[0;160];for i in 0..1000{let p=[(i%111) as f64/10.,(i%157) as f64/10.,0.];let first=i%150;let count=tree.query(p,0.2,first,&mut out);let expected:Vec<_>=bounds.iter().enumerate().filter(|(j,b)|*j>=first&&Bvh::contains(b,p,0.2)).map(|(j,_)|j).collect();assert_eq!(&out[..count],expected);}}
}

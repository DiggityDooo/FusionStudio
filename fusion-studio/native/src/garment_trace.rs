//! Test-only attribution; omitted entirely from application/native release builds.
use super::*;

pub struct Trace {output:Option<std::path::PathBuf>,rows:Vec<serde_json::Value>,previous:Vec<V>}
impl Trace {
 pub fn new()->Self{Self{output:std::env::var_os("FUSION_GARMENT_TRACE_OUTPUT").map(Into::into),rows:Vec::new(),previous:Vec::new()}}
 pub fn record(&mut self,phase:&str,step:usize,iteration:usize,iterations:usize,p:&[V],edges:&[Constraint]){
  if self.output.is_none()||iteration+1!=iterations{return}
  let mut maximum=0f64;let mut worst=[0;2];let mut signed=0f64;
  for e in edges{let strain=norm(sub(p[e.a],p[e.b]))/e.rest-1.;if strain.abs()>maximum{maximum=strain.abs();signed=strain;worst=[e.a,e.b];}}
  let (vertex,movement)=if phase=="before constraints"{(0,0.)}else{p.iter().zip(&self.previous).enumerate().map(|(i,(&a,&b))|(i,norm(sub(a,b)))).max_by(|a,b|a.1.total_cmp(&b.1)).unwrap_or((0,0.))};
  self.rows.push(serde_json::json!({"step":step,"iteration":iteration,"phase":phase,"maxStrain":maximum,"signedStrain":signed,"edge":worst,"edgePositions":worst.map(|i|p[i]),"maximumMovementM":movement,"movedVertex":vertex}));
  self.previous.clear();self.previous.extend_from_slice(p);
 }
}
impl Drop for Trace {fn drop(&mut self){if let Some(path)=&self.output{std::fs::write(path,serde_json::to_vec(&serde_json::json!({"scope":"Test-only final-iteration phase attribution; not a production quality pass or timing benchmark","rows":self.rows})).unwrap()).unwrap();}}}

#[test]
#[ignore = "Opt-in captured detailed fixture; requires explicit local input/output paths"]
fn captured_garment_stage_trace(){
 let input=std::env::var_os("FUSION_GARMENT_TRACE_REQUEST").expect("Set FUSION_GARMENT_TRACE_REQUEST");
 let output=std::env::var_os("FUSION_GARMENT_TRACE_RESULT").expect("Set FUSION_GARMENT_TRACE_RESULT");
 let data=std::fs::read(input).unwrap();assert!(data.len()<=32_000_000);
 let req:Drape=serde_json::from_slice(&data).unwrap();assert!(req.faces.len()>=4000,"Use a detailed garment fixture");
 let result=drape(req).unwrap();
 // Compare serialized API coordinates in Node: serde_json's default float
 // parser can round stored JS decimals differently from direct Rust Numbers.
 println!("GARMENT_TRACE_METRICS {}",result["metrics"]);
 std::fs::write(output,serde_json::to_vec(&result).unwrap()).unwrap();
}

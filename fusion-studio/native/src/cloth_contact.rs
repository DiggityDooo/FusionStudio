//! Final, static cloth-to-cloth inspection. No positions are modified.
//! Topological/sewn neighbours are excluded explicitly; incomplete work is
//! reported rather than converted into a zero-intersection success.
use super::*;
use std::cmp::Reverse;
use std::collections::BinaryHeap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample { pub face_a: usize, pub face_b: usize, pub kind: &'static str }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audit {
    pub complete: bool,
    pub tested_pairs: usize,
    pub adjacent_pairs: usize,
    pub crossings: usize,
    pub coplanar_overlaps: usize,
    pub clearance_violations: usize,
    pub degenerate_faces: usize,
    pub minimum_tested_gap_m: Option<f64>,
    pub required_gap_m: f64,
    pub gap_tolerance_m: f64,
    pub pair_budget: usize,
    pub local_exclusion_radius_m: f64,
    pub local_exclusion_pairs: usize,
    pub local_search_complete: bool,
    pub local_search_steps: usize,
    pub local_search_budget: usize,
    pub milliseconds: f64,
    pub samples: Vec<Sample>,
}

// Collision thickness is independent of tessellation. A fixed one/two-ring
// mask incorrectly treats a finely tessellated flat sheet as self contact.
// Use bounded shortest paths on its current edge graph, including sewn roots.
// Three gap widths define the explicitly excluded local surface neighbourhood;
// this is not a test of adjacent fold inversion or local bend feasibility.
struct LocalSurface { near:Vec<Vec<usize>>, complete:bool, steps:usize, pairs:usize }
fn local_surface(p:&[V],faces:&[[usize;3]],roots:&[usize],radius:f64,budget:usize)->LocalSurface {
    let n=p.len();let mut graph=vec![Vec::new();n];
    for t in faces {for k in 0..3 {
        let (a,b)=(t[k],t[(k+1)%3]);let length=norm(sub(p[a],p[b]));
        let (a,b)=(roots[a],roots[b]);
        if a!=b&&length<=radius {graph[a].push((b,length));graph[b].push((a,length));}
    }}
    for edges in &mut graph {
        edges.sort_unstable_by(|a,b|a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        edges.dedup_by(|a,b|a.0==b.0);
    }
    let mut out=LocalSurface{near:vec![Vec::new();n],complete:true,steps:0,pairs:0};
    let mut distance=vec![f64::INFINITY;n];let mut visited=vec![0;n];let mut heap=BinaryHeap::new();
    'sources:for source in 0..n {
        if roots[source]!=source||graph[source].is_empty(){continue}
        let generation=source+1;distance[source]=0.;visited[source]=generation;heap.push(Reverse((0u64,source)));
        while let Some(Reverse((bits,a)))=heap.pop() {
            let d=f64::from_bits(bits);if d>distance[a]{continue}
            out.near[source].push(a);out.pairs+=1;
            for &(b,length) in &graph[a] {
                if out.steps>=budget {out.complete=false;break 'sources}
                out.steps+=1;let next=d+length;if next>radius{continue}
                if visited[b]!=generation||next<distance[b] {
                    visited[b]=generation;distance[b]=next;heap.push(Reverse((next.to_bits(),b)));
                }
            }
        }
    }
    for near in &mut out.near {near.sort_unstable();near.dedup();}out
}

fn orient(a:[f64;2],b:[f64;2],p:[f64;2])->f64 {
    (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
}
fn twice_area(p:&[[f64;2]])->f64 {
    if p.len()<3 { return 0.; }
    (1..p.len()-1).map(|i|orient(p[0],p[i],p[i+1])).sum::<f64>().abs()
}
pub(super) fn coplanar_overlap(a:[V;3],b:[V;3])->bool {
    let normal=cross(sub(a[1],a[0]),sub(a[2],a[0]));
    let length=norm(normal);if length<1e-14{return false}
    let normal=mul(normal,1./length);
    if b.iter().any(|&p|dot(sub(p,a[0]),normal).abs()>1e-8){return false}
    let axis=(0..3).max_by(|&i,&j|normal[i].abs().total_cmp(&normal[j].abs())).unwrap();
    let project=|p:V|[p[(axis+1)%3],p[(axis+2)%3]];
    let a=a.map(project);let b=b.map(project);
    let sign=orient(b[0],b[1],b[2]).signum();if sign==0.{return false}
    let mut polygon=a.to_vec();
    for edge in 0..3 {
        if polygon.is_empty(){return false}
        let (x,y)=(b[edge],b[(edge+1)%3]);let mut next=Vec::new();
        let mut previous=*polygon.last().unwrap();let mut before=orient(x,y,previous)*sign;
        for &point in &polygon {
            let after=orient(x,y,point)*sign;
            if (before>=0.)!=(after>=0.) {
                let t=before/(before-after);
                next.push([previous[0]+t*(point[0]-previous[0]),previous[1]+t*(point[1]-previous[1])]);
            }
            if after>=0.{next.push(point)}
            previous=point;before=after;
        }
        polygon=next;
    }
    twice_area(&polygon)>1e-14f64.max(twice_area(&a).min(twice_area(&b))*1e-8)
}

pub fn root_map(n:usize,sewing:&[[usize;2]],welded:bool)->Vec<usize>{
    let mut roots:Vec<_>=(0..n).collect();if welded{for (root,group) in sewing_groups(n,sewing){for i in group{roots[i]=root;}}}roots
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Request {pub positions:Vec<V>,pub faces:Vec<[usize;3]>,#[serde(default)]pub sewing:Vec<[usize;2]>,pub thickness:f64,#[serde(default)]pub seam_topology:bool}
pub fn run(q:Request)->Result<Audit,String>{
    if q.positions.len()>60000||q.faces.len()>100000||q.sewing.len()>4000||!q.thickness.is_finite()||!(0.001..=0.02).contains(&q.thickness)||q.sewing.iter().any(|&[a,b]|a>=q.positions.len()||b>=q.positions.len()||a==b){return Err("Invalid cloth-contact inspection or supported mesh budget exceeded".into())}
    let topo=topology(&Mesh{positions:q.positions.clone(),faces:q.faces.clone()})?;
    let mut excluded=HashSet::new();let pair=|a:usize,b:usize|(a.min(b),a.max(b));
    for h in 0..topo.half_edges{let a=q.faces[h/3];let i=h%3;excluded.insert(pair(a[i],a[(i+1)%3]));let twin=topo.twins[h];if twin>=0{let t=twin as usize;excluded.insert(pair(a[(i+2)%3],q.faces[t/3][(t%3+2)%3]));}}
    for &[a,b] in &q.sewing{excluded.insert(pair(a,b));}
    if q.seam_topology{excluded=sewn_exclusions(q.positions.len(),&excluded,&q.sewing)?;}
    Ok(inspect(&q.positions,&q.faces,&root_map(q.positions.len(),&q.sewing,q.seam_topology),&excluded,q.thickness*2.,2_000_000))
}

pub fn inspect(p:&[V],faces:&[[usize;3]],roots:&[usize],excluded:&HashSet<(usize,usize)>,gap:f64,budget:usize)->Audit {
    let started=std::time::Instant::now();
    let local_radius=gap*3.;let local_budget=8_000_000;
    let local=local_surface(p,faces,roots,local_radius,local_budget);
    let surface=contact::Surface{positions:p.to_vec(),triangles:faces.to_vec(),previous_positions:None};
    let tree=contact::Tree::new(&surface);let mut candidates=Vec::new();
    let degenerate:Vec<_>=faces.iter().map(|t|norm(cross(sub(p[t[1]],p[t[0]]),sub(p[t[2]],p[t[0]])))<1e-14).collect();
    let degenerate_faces=degenerate.iter().filter(|&&v|v).count();
    let mut out=Audit{complete:degenerate_faces==0&&local.complete,tested_pairs:0,adjacent_pairs:0,crossings:0,coplanar_overlaps:0,clearance_violations:0,degenerate_faces,minimum_tested_gap_m:None,required_gap_m:gap,gap_tolerance_m:1e-6,pair_budget:budget,local_exclusion_radius_m:local_radius,local_exclusion_pairs:local.pairs,local_search_complete:local.complete,local_search_steps:local.steps,local_search_budget:local_budget,milliseconds:0.,samples:Vec::new()};
    // An incomplete local mask could misclassify ordinary sheet neighbours.
    // Report unknown coverage without inventing contact counts from that mask.
    if !local.complete {out.milliseconds=started.elapsed().as_secs_f64()*1000.;return out}
    let excluded_pair=|i:usize,j:usize|roots[i]==roots[j]||excluded.contains(&(i.min(j),i.max(j)))||local.near[roots[i]].binary_search(&roots[j]).is_ok();
    'faces:for (i,a) in faces.iter().enumerate() {
        if degenerate[i]{continue}
        let ta=a.map(|j|p[j]);
        let lo=std::array::from_fn(|k|ta.iter().map(|v|v[k]).fold(f64::INFINITY,f64::min));
        let hi=std::array::from_fn(|k|ta.iter().map(|v|v[k]).fold(f64::NEG_INFINITY,f64::max));
        tree.query(lo,hi,gap,&mut candidates);
        for &j in &candidates {
            if j<=i||degenerate[j]{continue}
            if out.tested_pairs+out.adjacent_pairs>=budget{out.complete=false;break 'faces}
            let b=faces[j];
            if a.iter().any(|&u|b.iter().any(|&v|roots[u]==roots[v])){out.adjacent_pairs+=1;continue}
            out.tested_pairs+=1;let tb=b.map(|j|p[j]);
            let crossing=!contact::face_hits_fast(ta,tb).is_empty();let overlap=coplanar_overlap(ta,tb);
            if crossing{out.crossings+=1}if overlap{out.coplanar_overlaps+=1}
            let mut minimum=f64::INFINITY;
            for (points,triangle) in [(a,&b),(&b,a)] {
                for &v in points {
                    if triangle.iter().any(|&u|excluded_pair(v,u)){continue}
                    let t=triangle.map(|u|p[u]);let q=contact::closest(p[v],t[0],t[1],t[2]).0;
                    minimum=minimum.min(norm(sub(p[v],q)));
                }
            }
            for x in 0..3 {for y in 0..3 {
                let ea=[a[x],a[(x+1)%3]];let eb=[b[y],b[(y+1)%3]];
                if ea.iter().any(|&u|eb.iter().any(|&v|excluded_pair(u,v))){continue}
                let (u,v,_,_)=contact::segment_pair(p[ea[0]],p[ea[1]],p[eb[0]],p[eb[1]]);
                minimum=minimum.min(norm(sub(u,v)));
            }}
            if crossing||overlap{minimum=0.}
            if minimum.is_finite(){out.minimum_tested_gap_m=Some(out.minimum_tested_gap_m.unwrap_or(f64::INFINITY).min(minimum));}
            let clearance=minimum<gap-out.gap_tolerance_m;
            if clearance{out.clearance_violations+=1}
            if out.samples.len()<32&&(crossing||overlap||clearance){out.samples.push(Sample{face_a:i,face_b:j,kind:if crossing{"crossing"}else if overlap{"coplanar overlap"}else{"clearance"}});}
        }
    }
    out.milliseconds=started.elapsed().as_secs_f64()*1000.;out
}

#[cfg(test)]mod tests {
    use super::*;
    fn audit(p:Vec<V>,gap:f64)->Audit{let n=p.len();inspect(&p,&[[0,1,2],[3,4,5]],&(0..n).collect::<Vec<_>>(),&HashSet::new(),gap,100)}
    #[test]fn disjoint_triangles_cross_without_coincident_vertices(){let r=audit(vec![[-1.,-1.,0.],[1.,-1.,0.],[0.,1.,0.],[0.,-0.5,-1.],[0.,-0.5,1.],[0.,0.5,0.]],0.006);assert!(r.complete);assert_eq!(r.crossings,1);assert_eq!(r.minimum_tested_gap_m,Some(0.));}
    #[test]fn coplanar_overlap_and_parallel_layer_gap_are_distinct(){let a=[[-1.,-1.,0.],[1.,-1.,0.],[0.,1.,0.]];for reverse in [false,true]{for (z,overlap,clearance) in [(0.,1,1),(0.003,0,1),(0.008,0,0)]{let mut b=a.map(|p|add(p,[0.,0.,z]));if reverse{b.swap(0,2);}let r=audit(a.into_iter().chain(b).collect(),0.006);assert_eq!(r.coplanar_overlaps,overlap);assert_eq!(r.clearance_violations,clearance);assert!((r.minimum_tested_gap_m.unwrap()-z).abs()<1e-12);}}}
    #[test]fn sewn_vertices_and_adjacency_are_explicit_and_budget_exhaustion_is_not_success(){let p=vec![[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,0.,0.003],[1.,0.,0.003],[0.,1.,0.003]];let f=[[0,1,2],[3,4,5]];let r=inspect(&p,&f,&[0,1,2,0,4,5],&HashSet::new(),0.006,100);assert_eq!(r.adjacent_pairs,1);assert_eq!(r.tested_pairs,0);assert_eq!(r.crossings,0);let r=inspect(&p,&f,&[0,1,2,3,4,5],&HashSet::new(),0.006,0);assert!(!r.complete);assert_eq!(r.tested_pairs,0);}
    #[test]fn local_surface_search_budget_is_bounded_and_not_success(){let p=[[0.,0.,0.],[0.001,0.,0.],[0.,0.001,0.]];let result=local_surface(&p,&[[0,1,2]],&[0,1,2],0.018,1);assert!(!result.complete);assert_eq!(result.steps,1);}
}

// Immutable point-position snapshot for deterministic nearest-neighbor queries.
// Median splits keep dense mirror/transfer tools out of the quadratic scan path.
export class PointIndex{
  constructor(items,pointOf=item=>item.p){
    if(!Array.isArray(items)||items.length>300000)throw Error('Point index supports at most 300,000 points.');
    this.items=items.slice();const n=items.length;this.positions=new Float64Array(n*3);this.left=new Int32Array(n).fill(-1);this.right=new Int32Array(n).fill(-1);this.axis=new Uint8Array(n);
    items.forEach((item,i)=>{const raw=pointOf(item),p=raw?.isVector3?raw.toArray():raw;if(!p||p.length!==3||![...p].every(Number.isFinite))throw Error('Point index positions must be finite XYZ.');this.positions.set(p,i*3);});
    const ids=Uint32Array.from({length:n},(_,i)=>i),coord=(id,a)=>this.positions[id*3+a];
    const select=(lo,hi,k,a)=>{
      const less=(x,y)=>coord(x,a)<coord(y,a)||(coord(x,a)===coord(y,a)&&x<y);
      while(lo<hi){const pivot=ids[(lo+hi)>>1];let i=lo,j=hi;
        while(i<=j){while(less(ids[i],pivot))i++;while(less(pivot,ids[j]))j--;if(i<=j){const v=ids[i];ids[i++]=ids[j];ids[j--]=v;}}
        if(k<=j)hi=j;else if(k>=i)lo=i;else break;
      }
    };
    const build=(lo,hi,depth)=>{if(lo>hi)return -1;const mid=(lo+hi)>>1,a=depth%3;select(lo,hi,mid,a);const id=ids[mid];this.axis[id]=a;this.left[id]=build(lo,mid-1,depth+1);this.right[id]=build(mid+1,hi,depth+1);return id;};
    this.root=build(0,n-1,0);
  }
  nearest(point,maxDistance=Infinity){
    const p=point?.isVector3?point.toArray():point;
    if(!p||p.length!==3||![...p].every(Number.isFinite)||typeof maxDistance!=='number'||!(maxDistance>=0)||Number.isNaN(maxDistance))throw Error('Nearest query needs finite XYZ and a nonnegative distance.');
    let best=-1,bestD=maxDistance*maxDistance;const stack=this.root<0?[]:[this.root];
    while(stack.length){const id=stack.pop(),offset=id*3,dx=p[0]-this.positions[offset],dy=p[1]-this.positions[offset+1],dz=p[2]-this.positions[offset+2],distance=dx*dx+dy*dy+dz*dz;
      if(distance<bestD||(distance===bestD&&(best<0||id<best))){best=id;bestD=distance;}
      const a=this.axis[id],delta=p[a]-this.positions[offset+a],near=delta<=0?this.left[id]:this.right[id],far=delta<=0?this.right[id]:this.left[id];
      if(far>=0&&delta*delta<=bestD)stack.push(far);if(near>=0)stack.push(near);
    }
    return best<0?null:{item:this.items[best],index:best,distance:Math.sqrt(bestD)};
  }
}

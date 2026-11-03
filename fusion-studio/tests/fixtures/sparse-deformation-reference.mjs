// Independent pre-optimization algorithm. Plain numeric channel IDs in probes.
export function referenceSparse(base,sourceIds,morphs,values){
 if(base.length%3||sourceIds.length!==base.length/3||sourceIds.length>2000000)throw Error('Invalid sparse deformation shape');
 const result=Float32Array.from(base),map=new Map();
 const finite=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('Expected a finite scalar');return v;};let count=0;
 for(let i=0;i<sourceIds.length;i++){const id=sourceIds[i];if(!Number.isInteger(id)||id<0||id>=2000000)throw Error('Invalid source vertex identity');if(!map.has(id))map.set(id,[]);map.get(id).push(i);}
 for(const m of morphs){const value=finite(values[m.id]??0);count+=m.deltas.length;if(count>8000000)throw Error('Sparse delta limit exceeded');for(const row of m.deltas){if(row.length!==4||!Number.isInteger(row[0])||row[0]<0)throw Error('Invalid sparse delta');row.slice(1).forEach(finite);if(value)for(const i of map.get(row[0])||[])for(let j=0;j<3;j++)result[i*3+j]+=row[j+1]*value;}}
 if(result.some(v=>!Number.isFinite(v)))throw Error('Sparse deformation overflow');
 return result;
}

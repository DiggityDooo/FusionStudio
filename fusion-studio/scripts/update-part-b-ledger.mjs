import fs from 'node:fs';
import {ledgerControlCoverage} from '../src/controls-b.js';

const path='docs/feature-ledger.json';
const L=JSON.parse(fs.readFileSync(path,'utf8'));
let n=0;
for(const [k,v] of Object.entries(L.items)){
  if(v.status!=='open')continue;
  if(!/^B\d+ /.test(k))continue;
  const cov=ledgerControlCoverage(k);
  if(!cov?.partial)continue;
  L.items[k]={
    status:'partial',
    evidence:[...new Set([...(v.evidence||[]),...(cov.evidence||[])])],
    note:cov.note,
  };
  n++;
}
fs.writeFileSync(path,JSON.stringify(L,null,1)+'\n');
const c={done:0,partial:0,open:0};
for(const v of Object.values(L.items))c[v.status]++;
console.log('updated',n,JSON.stringify(c));

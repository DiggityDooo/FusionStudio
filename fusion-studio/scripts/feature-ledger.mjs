// Tracks every item of ../3d-software-features-and-controls.md in docs/feature-ledger.json.
// Usage: node scripts/feature-ledger.mjs [--sync]   (--sync adds new reference items as "open" and drops removed ones)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const referencePath=path.join(root,'..','3d-software-features-and-controls.md'),ledgerPath=path.join(root,'docs','feature-ledger.json');
export const STATUSES=['done','partial','open'];
export function referenceItems(text=fs.readFileSync(referencePath,'utf8')){
  const items=[];let section=null;
  for(const line of text.split(/\r?\n/)){
    const heading=line.match(/^## (?:(\d+)|(B\d+))\. /);if(heading){section=heading[1]?'A'+heading[1]:heading[2];continue;}
    if(!section||/^# /.test(line))continue;
    const bullet=line.match(/^- (.+)$/),row=line.match(/^\| ([^|]+?) \|/),numbered=line.match(/^\d+\. (.+)$/);
    const text=(bullet||numbered)?.[1]??(row&&!/^(-+|Action|Scheme|App|Menu type|Tool)$/.test(row[1].trim())?row[1].trim():null);
    if(text)items.push(`${section} ${text.trim()}`);
  }
  return items;
}
export const readLedger=()=>JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
export function audit(ledger=readLedger(),items=referenceItems()){
  const problems=[],known=new Set(items);
  for(const item of items){const entry=ledger.items[item];if(!entry){problems.push('Missing ledger entry: '+item);continue;}if(!STATUSES.includes(entry.status))problems.push(`Invalid status for ${item}: ${entry.status}`);if(entry.status!=='open'&&!entry.evidence?.length)problems.push('No evidence for '+item);for(const file of entry.evidence||[])if(!fs.existsSync(path.join(root,file)))problems.push(`Missing evidence ${file} for ${item}`);}
  for(const item of Object.keys(ledger.items))if(!known.has(item))problems.push('Stale ledger entry: '+item);
  const counts=Object.fromEntries(STATUSES.map(s=>[s,items.filter(i=>ledger.items[i]?.status===s).length]));
  return {problems,counts,total:items.length};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const items=referenceItems();
  if(process.argv.includes('--sync')){const old=fs.existsSync(ledgerPath)?readLedger():{version:1,items:{}},next={version:1,items:{}};for(const item of items)next.items[item]=old.items[item]||{status:'open'};fs.writeFileSync(ledgerPath,JSON.stringify(next,null,1)+'\n');}
  const {problems,counts,total}=audit();console.log(`${total} reference items · done ${counts.done} · partial ${counts.partial} · open ${counts.open}`);for(const p of problems)console.log(p);process.exitCode=problems.length?1:0;
}

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workspace,hash} from './common.mjs';
export function prepareVariety(assets,asarSha256){
 const dir=path.join(workspace,'local/variety'),receipt=JSON.parse(fs.readFileSync(path.join(dir,'variety.json')));
 assert.ok(receipt.passed);assert.equal(receipt.asarSha256,asarSha256);
 assert.deepEqual(receipt.clips.map(c=>c.id).sort(),['bmw-orbit','bmw-wire','hair-orbit','optics-wire']);
 for(const row of receipt.clips){const source=path.join(dir,row.file);assert.equal(hash(source),row.sha256);assert.equal(row.frames,150);fs.copyFileSync(source,path.join(workspace,'public/media',row.file));assets[row.id]={...row,file:'media/'+row.file,seconds:row.frames/30};}
 return receipt;
}

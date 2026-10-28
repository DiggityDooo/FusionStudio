// Discover all unit suites so a newly added regression cannot silently be left
// out of npm test. Desktop/render workflow drivers remain explicit test scripts.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(name=>/\.test\.(?:mjs|cjs)$/.test(name)).sort().map(name=>path.join('tests',name));
if(!files.length)throw Error('No unit suites found.');
const result=spawnSync(process.execPath,['--test','--test-concurrency=4',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;

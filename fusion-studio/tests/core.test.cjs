const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {inside,writeNew,saveProject,validateProject,migrateProject,listProjects,Engine}=require('../electron/core.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'fusion-tests-'));
const doc={format:'fusion-studio',version:1,name:'Test project',scene:{object:{uuid:'legacy-scene',type:'Group',children:[]}}};
test('outputs cannot escape the data directory or overwrite a source',()=>{
  assert.equal(inside(root,path.join(root,'..','outside')),false);
  assert.equal(inside(root,root),false);
  assert.throws(()=>writeNew(root,path.join(root,'..','outside'),'oops'),/inside/);
  const dest=path.join(root,'source.txt');writeNew(root,dest,'original');
  assert.throws(()=>writeNew(root,dest,'changed'));
  assert.equal(fs.readFileSync(dest,'utf8'),'original');
});
test('saving creates independent versions and preserves prior content',()=>{
  const a=saveProject(root,doc), b=saveProject(root,{...doc,name:'Test project',extra:'new'});
  assert.notEqual(a.path,b.path);assert.equal(JSON.parse(fs.readFileSync(a.path)).extra,undefined);
  assert.equal(listProjects(root).length,2);
});
test('rejects incompatible or malformed projects',()=>{
  assert.throws(()=>validateProject({}),/supported/);
  const migrated=migrateProject(doc);assert.equal(migrated.version,2);assert.equal(migrated.projectId,'legacy-scene');assert.deepEqual(migrated.migrations,[{from:1,to:2}]);assert.equal(doc.version,1,'migration cannot mutate the legacy document');
  assert.throws(()=>validateProject({...doc,version:3}),/version/);
  assert.throws(()=>validateProject({...doc,scene:{...doc.scene,images:[{url:'file:///C:/private.png'}]}}),/embedded/);
  assert.throws(()=>validateProject({...doc,scene:{object:{uuid:'too-many',children:new Array(5001).fill({})}}}),/limit/);
});
test('worker rejects arbitrary actions before process launch',()=>{
  const e=new Engine(root,'none');assert.throws(()=>e.run({action:'exec'}),/Unsupported/);
});

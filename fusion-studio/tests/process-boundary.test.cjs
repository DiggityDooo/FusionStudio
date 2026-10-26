const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');

test('engine and DSON inspector spawn only the isolated Blender executables',async()=>{
 const root=fs.mkdtempSync(path.resolve(__dirname,'../test-output/process-boundary-')),calls=[];
 const fakeSpawn=(exe,args,options)=>{
  calls.push({exe,args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
  queueMicrotask(()=>{
   if(args.includes('--preflight'))child.stdout.write(JSON.stringify({ok:true,warnings:[]}));
   else {const spec=JSON.parse(fs.readFileSync(args.at(-1)));fs.writeFileSync(spec.output,'test-only simulated worker output',{flag:'wx'});fs.writeFileSync(path.join(spec.directory,'result.json'),'{}');}
   child.emit('close',0);
  });return child;
 };
 const load=(name,overrides={})=>{
  const module={exports:{}},filename=path.resolve(__dirname,'../electron',name);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:id=>id==='node:child_process'?{spawn:fakeSpawn}:overrides[id]||require('node:module').createRequire(filename)(id),process:{...process,env:{...process.env,FUSION_ENGINE_ONESHOT:'1'}},Buffer,setTimeout,clearTimeout,console},{filename});return module.exports;
 };
 const core=load('core.cjs'),engine=new core.Engine(root,path.resolve(__dirname,'../scripts/blender_worker.py'));
 await engine.run({action:'render',data:Buffer.from('test input').toString('base64'),name:'Boundary test'});
 const dson=load('dson.cjs',{'./core.cjs':core});await dson.preflightDson(root,path.resolve(__dirname,'../scripts/dson_importer.py'),'read-only.duf',[]);
 assert.equal(calls.length,2);
 assert.equal(path.normalize(calls[0].exe),path.normalize(core.APPS[0].path));
 assert.match(calls[1].exe,/Blender 5[.]2.*python[.]exe$/);
 for(const {options} of calls){assert.equal(options.windowsHide,true);assert.equal(options.env.PYTHONDONTWRITEBYTECODE,'1');for(const key of ['BLENDER_USER_CONFIG','BLENDER_USER_DATAFILES','BLENDER_USER_SCRIPTS','BLENDER_USER_EXTENSIONS','TEMP','TMP'])assert.ok(core.inside(root,options.env[key]),key);}
 for(const arg of ['--background','--factory-startup','--disable-autoexec'])assert.ok(calls[0].args.includes(arg));
 for(const arg of ['-I','-B'])assert.ok(calls[1].args.includes(arg));
 assert.equal(calls.some(c=>/DAZStudio|postgres|MarvelousDesigner|CharacterCreator/i.test(c.exe)),false);
});

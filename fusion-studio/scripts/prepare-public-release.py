"""Make a public ZIP from certified RC archive without changing runtime bytes."""
from pathlib import Path,PurePosixPath
import argparse,csv,hashlib,io,json,re,zipfile

parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
source_hash=hashlib.sha256(args.source.read_bytes()).hexdigest()
assert source_hash=='78c393532ed08c2de4ad690a2c95931fa1584b55a1cc4c1730d29bbb7e8f0980','Certified archive changed'
args.output.mkdir(parents=True,exist_ok=True)
archive=args.output/'FusionStudio-0.19.0-rc.1-windows-x64.zip'
payload={};runtime=[];redactions={'profilePaths':0,'credentials':0};excluded=[]
def text_clean(value):
 value,n=re.subn(r'(?i)[a-z]:[\\/]Users[\\/][^\\/\s"<>]+','<user>',value);redactions['profilePaths']+=n
 value,n=re.subn(r'(?i)Bearer\s+[A-Za-z0-9._-]{20,}','Bearer <redacted>',value);redactions['credentials']+=n
 value,n=re.subn(r'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}','<redacted>',value);redactions['credentials']+=n
 return value
def clean(value):
 if isinstance(value,dict):
  result={}
  for k,v in value.items():
   if re.fullmatch(r'(?i)api[_-]?key|password|token|secret|authorization',k) and isinstance(v,str) and v:
    result[k]='<redacted>';redactions['credentials']+=1
   else:result[k]=clean(v)
  return result
 if isinstance(value,list):return [clean(v) for v in value]
 return text_clean(value) if isinstance(value,str) else value
with zipfile.ZipFile(args.source) as z:
 expected=dict(line.split('  ',1)[::-1] for line in z.read('SHA256SUMS.txt').decode().splitlines())
 for item in z.infolist():
  name=item.filename;p=PurePosixPath(name)
  assert not p.is_absolute() and '..' not in p.parts
  if item.is_dir():continue
  data=z.read(name)
  if name in expected:assert hashlib.sha256(data).hexdigest()==expected[name],name
  if name.startswith('win-unpacked/'):
   assert not re.search(r'(?i)(?:^|/)(?:Fusion Data|app-profile|node_modules/\.cache)(?:/|$)|(?:model-connections|mcp-settings)\.json$|\.(?:blend|duf|dsf|mp3|flac|gguf|safetensors)$',name),name
   payload[name]=data;runtime.append({'file':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
  elif name.startswith('evidence/') and name.endswith(('.json','.csv')) and Path(name).name not in ['freeze-inventory.json','toolchain-verification.json']:
   if name.endswith('.json'):payload[name]=(json.dumps(clean(json.loads(data)),indent=2,ensure_ascii=False)+'\n').encode()
   else:
    stream=io.StringIO(newline='');writer=csv.writer(stream,lineterminator='\n')
    for row in csv.reader(io.StringIO(data.decode('utf-8-sig'))):writer.writerow([text_clean(c) for c in row])
    payload[name]=stream.getvalue().encode()
  else:excluded.append(name)
assert runtime
asar=next(r for r in runtime if r['file']=='win-unpacked/resources/app.asar')
assert asar['sha256']=='49f10f486e9e118d73e8b1af3ef76c585ae0a399b2e9a1aa501e4b33ac5a12f8'
payload['QUICKSTART.md']=(root/'docs/releases/2026-11-03-rc-guide.md').read_text(encoding='utf-8').encode()
payload['RELEASE-NOTES.md']=(root/'docs/releases/2026-11-04-public-rc1.md').read_text(encoding='utf-8').encode()
payload['README.txt']=b'Fusion Studio 0.19.0-rc.1 - Windows x64 prerelease\nExtract entire ZIP and launch win-unpacked/Fusion Studio.exe. Keep all files together. Installed Blender 5.2 required. Read QUICKSTART.md and RELEASE-NOTES.md.\nPrivate source assets and user settings are excluded.\n'
payload['RUNTIME-SHA256.json']=(json.dumps({'asarSha256':asar['sha256'],'files':runtime},indent=2)+'\n').encode()
for name,data in payload.items():
 if not name.startswith('win-unpacked/'):
  assert not re.search(rb'(?i)[A-Z]:[\\/]+Users[\\/]+Sean',data),name
payload['SHA256SUMS.txt']=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(payload.items())).encode()
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name,data in sorted(payload.items()):
  info=zipfile.ZipInfo(name,(2026,11,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for item in runtime:assert hashlib.sha256(z.read(item['file'])).hexdigest()==item['sha256']
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(args.output/'SHA256SUMS.txt').write_text(digest+'  '+archive.name+'\n',encoding='utf-8',newline='\n')
report={'passed':True,'version':'0.19.0-rc.1','sourceArchiveSha256':source_hash,'archiveSha256':digest,'bytes':archive.stat().st_size,'runtimeFiles':len(runtime),'runtimeUnchanged':True,'asarSha256':asar['sha256'],'entries':len(payload),'sanitizedEvidence':[n for n in payload if n.startswith('evidence/')],'redactions':redactions,'excludedEvidence':excluded,'privateSourceAssetsIncluded':False}
(args.output/'PUBLIC-RELEASE-AUDIT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['sanitizedEvidence','excludedEvidence']}))

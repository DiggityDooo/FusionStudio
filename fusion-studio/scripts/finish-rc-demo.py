"""Chapter, caption and validate actual captured footage; no app pixels replaced."""
from pathlib import Path
import hashlib,json,os,re,struct,subprocess,sys
from PIL import Image
root=Path(__file__).resolve().parents[1]
scratch=Path(sys.argv[1]).resolve()
assert scratch.is_relative_to(root/'test-output')
out=root/'docs/demo/2026-11-03'
ffmpeg=Path(os.environ.get('FUSION_MEDIA_FFMPEG',str(root/'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
manifest=json.loads((out/'capture-manifest.json').read_text())
assert manifest['passed'] and len(manifest['chapters'])==6
def run(args,check=True):
 p=subprocess.run([str(ffmpeg),'-hide_banner',*map(str,args)],cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace')
 if check and p.returncode:raise RuntimeError(p.stderr[-3000:])
 return p
def duration(file):
 text=run(['-i',file],False).stderr
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',text)
 assert m,file
 return round((int(m[1])*3600+int(m[2])*60+float(m[3]))*1000)
def cue(ms):return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
elapsed=0;meta=[';FFMETADATA1','title=Fusion Studio 0.19.0-rc.1 verified workflows'];vtt=['WEBVTT','']
for chapter in manifest['chapters']:
 ms=duration(scratch/(chapter['id']+'.mp4'));end=elapsed+ms
 meta+=['[CHAPTER]','TIMEBASE=1/1000',f'START={elapsed}',f'END={end}','title='+chapter['title']]
 vtt += [f'{cue(elapsed)} --> {cue(end)}',chapter['title'],chapter['subtitle'],'']
 chapter.update(startSeconds=elapsed/1000,endSeconds=end/1000)
 run(['-y','-loglevel','error','-ss',str(ms/1000*.7),'-i',scratch/(chapter['id']+'.mp4'),'-frames:v','1',scratch/(chapter['id']+'-review.png')])
 elapsed=end
(scratch/'chapters.txt').write_text('\n'.join(meta)+'\n',encoding='utf-8')
(out/'fusion-studio-rc1-demo.vtt').write_text('\n'.join(vtt),encoding='utf-8',newline='\n')
video=out/'fusion-studio-rc1-demo.mp4';chaptered=scratch/'chaptered.mp4'
run(['-y','-loglevel','error','-i',video,'-f','ffmetadata','-i',scratch/'chapters.txt','-map','0:v','-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',chaptered])
chaptered.replace(video)
sources=['02-render','03-edit','05-chat','06-mcp'];args=[];filters=[]
for i,name in enumerate(sources):
 file=scratch/(name+'.mp4');seconds=duration(file)/1000;start=max(.2,seconds-4)
 args+=['-i',file]
 filters.append(f'[{i}:v]trim=start={start}:end={seconds},setpts=PTS-STARTPTS,scale=640:360:flags=lanczos,fps=5,setsar=1[v{i}]')
filters+=[''.join(f'[v{i}]' for i in range(len(sources)))+'concat=n=4:v=1:a=0,split[a][b]','[a]palettegen=max_colors=128[p]','[b][p]paletteuse=dither=bayer[out]']
run(['-y','-loglevel','error',*args,'-filter_complex',';'.join(filters),'-map','[out]','-loop','0',out/'preview.gif'])
decoded=run(['-xerror','-i',video,'-f','null','-']).stderr
assert re.search(r'Video: h264[^\n]*\b1920x1080\b',decoded)
data=(root/'test-output/github-showcase/fixtures/aster-stoneware.glb').read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
assert triangles==156672,triangles
media=[]
for file in sorted(out.iterdir()):
 if file.suffix not in ('.png','.mp4','.gif','.vtt'):continue
 row=dict(file=file.name,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest())
 if file.suffix in ('.png','.gif'):
  with Image.open(file) as image:row.update(width=image.width,height=image.height,frames=getattr(image,'n_frames',1));image.verify()
 if file.suffix=='.mp4':row.update(width=1920,height=1080,codec='H.264',seconds=duration(file)/1000,decodedAllFrames=True,containerChapters=6)
 media.append(row)
manifest.update(chaptered=True,captions='fusion-studio-rc1-demo.vtt',sculptTriangles=triangles,media=media)
(out/'capture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
inventory=dict(passed=True,purpose='Recorded demonstration evidence; full release gates remain separate',seconds=duration(video)/1000,chapters=6,media=media,manifestSha256=hashlib.sha256((out/'capture-manifest.json').read_bytes()).hexdigest())
(out/'media-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(dict(passed=True,out=str(out),seconds=inventory['seconds'],videoBytes=video.stat().st_size,media=len(media))))

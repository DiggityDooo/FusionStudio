"""Decode the complete take; generate full-resolution step and caption-boundary QA."""
from pathlib import Path
import os,sys,json,re,subprocess,hashlib
from PIL import Image,ImageDraw

workspace=Path(__file__).resolve().parent.parent
root=workspace.parent.parent
out=root/'docs/demo/2026-11-04-workflow'
qa=workspace/'local/qa-workflow'
qa.mkdir(parents=True,exist_ok=True)
ffmpeg=Path(os.environ.get('FUSION_MEDIA_FFMPEG',str(root/'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
proof=json.loads((out/'provenance.json').read_text(encoding='utf-8'))
timeline=json.loads((out/'timeline.json').read_text(encoding='utf-8'))
video=out/'fusion-workflow.mp4'
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def run(args):
 p=subprocess.run([str(ffmpeg),'-hide_banner',*map(str,args)],capture_output=True,encoding='utf-8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])
 return p
assert proof['passed'] and proof['capture']['continuous']
assert proof['capture']['rate']==1 and proof['capture']['startStopPairs']==1
assert digest(video)==proof['film']['sha256']
assert video.stat().st_size<50*1024*1024,'Git media size gate'
decoded=run(['-i',video,'-map','0:v:0','-vsync','0','-progress','pipe:1','-nostats','-f','null','-'])
frames=int(re.findall(r'^frame=(\d+)',decoded.stdout,re.M)[-1])
assert frames==timeline['frames'],(frames,timeline['frames'])
assert '1920x1080' in decoded.stderr and '30 fps' in decoded.stderr and 'Video: h264' in decoded.stderr
assert 'Audio:' not in decoded.stderr,'Silent workflow expected'
input_metadata=decoded.stderr.split('Stream mapping:',1)[0]
chapters=re.findall(r'Chapter #0:\d+: start ([\d.]+), end ([\d.]+)',input_metadata)
assert len(chapters)==len(timeline['steps'])
for i,(start,end) in enumerate(chapters):
 assert abs(float(start)-timeline['steps'][i]['frame']/30)<=.001
 assert abs(float(end)-(timeline['steps'][i+1]['frame'] if i+1<len(chapters) else frames)/30)<=.001
assert abs(frames/30-proof['capture']['seconds'])<=2/30
steps=timeline['steps']
assert all(0<=s['frame']<frames for s in steps)
assert all(a['frame']<b['frame'] for a,b in zip(steps,steps[1:]))
assert all(len(s['caption'])<=115 and len(s['title'])<=50 for s in steps),'Caption design bounds'
assert (out/'captions.vtt').read_text(encoding='utf-8').count(' --> ')==len(steps)
stills={}
for i,s in enumerate(steps):
 end=steps[i+1]['frame'] if i+1<len(steps) else frames
 stills[s['id']+'-middle.png']=(s['frame']+end)//2
 stills[s['id']+'-result.png']=max(s['frame'],end-24)
needed=sorted(set(stills.values())|{f for s in steps[1:] for f in range(max(0,s['frame']-8),min(frames,s['frame']+8))})
raw=qa/'decoded';raw.mkdir(exist_ok=True)
expression='+'.join(f'eq(n\\,{frame})' for frame in needed)
run(['-y','-loglevel','error','-i',video,'-vf','select='+expression,'-vsync','0',raw/'%04d.png'])
lookup={f:raw/f'{i+1:04d}.png' for i,f in enumerate(needed)}
import shutil
for name,frame in stills.items():shutil.copyfile(lookup[frame],qa/name)
for s in steps[1:]:
 strip=Image.new('RGB',(1920,1120),'#101112')
 for i,f in enumerate(range(s['frame']-8,s['frame']+8)):
  with Image.open(lookup[f]) as im:strip.paste(im.convert('RGB').resize((480,270)),((i%4)*480,(i//4)*280))
  ImageDraw.Draw(strip).text(((i%4)*480+8,(i//4)*280+270),str(f),fill='white')
 strip.save(qa/f"boundary-{s['id']}.jpg",quality=91)
names=list(stills)
contact=Image.new('RGB',(1920,((len(names)+3)//4)*285),'#101112')
for i,name in enumerate(names):
 with Image.open(qa/name) as im:contact.paste(im.convert('RGB').resize((480,270)),((i%4)*480,(i//4)*285))
 ImageDraw.Draw(contact).text(((i%4)*480+8,(i//4)*285+271),name,fill='white')
contact.save(out/'contact-sheet.jpg',quality=92)
review_files=names+[f"boundary-{s['id']}.jpg" for s in steps[1:]]
manifest={'videoSha256':digest(video),'reviewFiles':[{'file':name,'sha256':digest(qa/name)} for name in review_files]}
(qa/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
report={'passed':False,'technicalChecksPassed':True,'videoSha256':digest(video),'decodedFrames':frames,'width':1920,'height':1080,'fps':30,'seconds':frames/30,'codec':'H.264','audio':'silent','continuous':True,'playbackRate':1,'singleSourceTake':True,'steps':len(steps),'stepStills':len(stills),'captionBoundaryStrips':len(steps)-1,'bytes':video.stat().st_size,'captureChecks':proof['checks'],'visualReview':'pending'}
(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))

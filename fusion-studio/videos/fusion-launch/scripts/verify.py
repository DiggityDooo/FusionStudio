"""Decode whole film, measure mix, and generate frame-accurate visual QA evidence."""
from pathlib import Path
import os,sys,json,re,subprocess,hashlib
from PIL import Image,ImageDraw

workspace=Path(__file__).resolve().parent.parent
app=workspace.parent.parent
out=app/'docs/demo/2026-11-03-remotion'
qa=workspace/'local/qa'
qa.mkdir(parents=True,exist_ok=True)
ffmpeg=Path(os.environ.get('FUSION_MEDIA_FFMPEG',str(app/'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe')))
preview='--preview' in sys.argv
video=out/('fusion-launch-picture-preview.mp4' if preview else 'fusion-launch.mp4')
prepared=json.loads((workspace/'public/prepared.json').read_text(encoding='utf-8'))
def run(args):
 p=subprocess.run([str(ffmpeg),'-hide_banner',*map(str,args)],capture_output=True,encoding='utf-8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])
 return p
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
decoded=run(['-i',video,'-map','0:v:0','-vsync','0','-progress','pipe:1','-nostats','-f','null','-'])
frames=int(re.findall(r'^frame=(\d+)',decoded.stdout,re.M)[-1])
assert frames==3600,frames
assert '1920x1080' in decoded.stderr
assert re.search(r'Video: h264',decoded.stderr)
assert re.search(r'30 fps',decoded.stderr)
assert 'Duration: 00:02:00.00' in decoded.stderr
audio=None
if not preview:
 assert prepared['music'],'Required music missing'
 assert re.search(r'Audio: aac',decoded.stderr)
 mix=run(['-i',video,'-vn','-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-'])
 audio=json.loads(mix.stderr[mix.stderr.rfind('{'):mix.stderr.rfind('}')+1])
 assert abs(float(audio['input_i'])+14)<=.5,audio
 assert float(audio['input_tp'])<=-1,audio
for scene in prepared['story']:
 for label,frame in [('start',scene['from']+18),('middle',(scene['from']+scene['to'])//2),('end',scene['to']-18)]:
  run(['-y','-loglevel','error','-i',video,'-vf',f'select=eq(n\\,{frame})','-frames:v','1',qa/f"{scene['id']}-{label}.png"])
for scene in prepared['story'][1:]:
 boundary=scene['from']
 folder=qa/scene['id'];folder.mkdir(exist_ok=True)
 run(['-y','-loglevel','error','-i',video,'-vf',f'select=between(n\\,{boundary-8}\\,{boundary+7})','-vsync','0','-frames:v','16',folder/'%02d.png'])
 files=sorted(folder.glob('*.png'));assert len(files)==16
 strip=Image.new('RGB',(1920,1120),'#161715')
 for i,file in enumerate(files):
  with Image.open(file) as im:strip.paste(im.convert('RGB').resize((480,270)),((i%4)*480,(i//4)*280))
  ImageDraw.Draw(strip).text(((i%4)*480+8,(i//4)*280+270),str(boundary-8+i),fill='white')
 strip.save(qa/f"transition-{scene['id']}.jpg",quality=92)
all_stills=sorted(qa.glob('*-middle.png'))
contact=Image.new('RGB',(1920,1080),'#161715')
for i,file in enumerate(all_stills):
 with Image.open(file) as im:contact.paste(im.convert('RGB').resize((640,360)),((i%3)*640,(i//3)*360))
contact.save(out/'contact-sheet.jpg',quality=94)
caption=(out/'fusion-launch.vtt').read_text(encoding='utf-8')
assert caption.startswith('WEBVTT\n') and caption.count(' --> ')==len(prepared['cues'])
for i,(start,end,text) in enumerate(prepared['cues']):
 assert 0<=start<end<=3600
 if i:assert start==prepared['cues'][i-1][1]
report={'passed':False,'technicalChecksPassed':True,'preview':preview,'frames':frames,'seconds':120,'width':1920,'height':1080,'decodedAllFrames':True,'videoCodec':'H.264','audio':audio,'captionCues':len(prepared['cues']),'transitionStrips':6,'shotStills':21,'visualReview':'pending human/agent image inspection','deterministicFrames':'pending independent still comparison','captureChecks':prepared['capture']['checks'],'sha256':digest(video)}
(out/('picture-verification.json' if preview else 'verification.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(report))

"""Decode whole film, measure mix, and generate frame-accurate visual QA evidence."""
from pathlib import Path
import os,sys,json,re,subprocess,hashlib
from PIL import Image,ImageDraw

workspace=Path(__file__).resolve().parent.parent
app=workspace.parent.parent
out=app/'docs/demo/2026-11-03-remotion'
qa=workspace/'local/qa-pascal'
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
audio_seconds=None
if not preview:
 assert prepared['music'],'Required music missing'
 assert re.search(r'Audio: aac',decoded.stderr)
 mix=run(['-i',video,'-vn','-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-'])
 audio=json.loads(mix.stderr[mix.stderr.rfind('{'):mix.stderr.rfind('}')+1])
 assert abs(float(audio['input_i'])+14)<=.5,audio
 assert float(audio['input_tp'])<=-1,audio
 pcm=subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-i',str(video),'-map','0:a:0','-ar','48000','-ac','2','-f','s16le','-'],capture_output=True)
 assert pcm.returncode==0
 audio_seconds=len(pcm.stdout)/(48000*2*2)
 assert abs(audio_seconds-120)<=1/30,audio_seconds
# Include every shot boundary plus any source concatenation visible inside a shot.
transitions={shot['from']:shot['id'] for shot in prepared['shots'][1:]}
for shot in prepared['shots']:
 asset=prepared['assets'][shot['asset']]
 if asset.get('kind')=='image':continue
 start=shot.get('sourceIn',0);end=shot.get('sourceOut',asset['frames']);rate=(end-start)/shot['frames'];cursor=0
 for cut in asset.get('editorialCuts',[])[:-1]:
  cursor+=round((cut['end']-cut['start'])*30)
  if start<cursor<end:transitions[shot['from']+round((cursor-start)/rate)]=shot['id']+'-source-cut'
stills={}
for scene in prepared['story']:
 for label,frame in [('start',scene['from']+18),('middle',(scene['from']+scene['to'])//2),('end',scene['to']-18)]:stills[f"{scene['id']}-{label}.png"]=frame
for shot in prepared['shots']:stills[f"shot-{shot['id']}.png"]=(shot['from']+shot['to'])//2
needed=sorted(set(stills.values())|{f for boundary in transitions for f in range(boundary-8,boundary+8)})
raw=qa/'decoded';raw.mkdir(exist_ok=True)
expression='+'.join(f'eq(n\\,{frame})' for frame in needed)
run(['-y','-loglevel','error','-i',video,'-vf','select='+expression,'-vsync','0',raw/'%04d.png'])
for i,frame in enumerate(needed):assert (raw/f'{i+1:04d}.png').exists()
lookup={f:raw/f'{i+1:04d}.png' for i,f in enumerate(needed)}
import shutil
for name,frame in stills.items():shutil.copyfile(lookup[frame],qa/name)
for boundary,name in transitions.items():
 strip=Image.new('RGB',(1920,1120),'#090a0b')
 for i,frame in enumerate(range(boundary-8,boundary+8)):
  with Image.open(lookup[frame]) as im:strip.paste(im.convert('RGB').resize((480,270)),((i%4)*480,(i//4)*280))
  ImageDraw.Draw(strip).text(((i%4)*480+8,(i//4)*280+270),str(frame),fill='white')
 strip.save(qa/f'transition-{name}.jpg',quality=92)
contact=Image.new('RGB',(1920,1080),'#090a0b')
for i,scene in enumerate(prepared['story']):
 with Image.open(qa/(scene['id']+'-middle.png')) as im:contact.paste(im.convert('RGB').resize((640,360)),((i%3)*640,(i//3)*360))
contact.save(out/'contact-sheet.jpg',quality=94)
qa_manifest={'videoSha256':digest(video),'stills':stills,'transitions':[{'frame':f,'name':n} for f,n in sorted(transitions.items())],'reviewFiles':list(stills)+['transition-'+name+'.jpg' for name in transitions.values()]}
(qa/'manifest.json').write_text(json.dumps(qa_manifest,indent=2)+'\n',encoding='utf-8')
caption=(out/'fusion-launch.vtt').read_text(encoding='utf-8')
assert caption.startswith('WEBVTT\n') and caption.count(' --> ')==len(prepared['cues'])
for i,(start,end,text) in enumerate(prepared['cues']):
 assert 0<=start<end<=3600
 if i:assert start==prepared['cues'][i-1][1]
report={'passed':False,'technicalChecksPassed':True,'preview':preview,'frames':frames,'seconds':120,'width':1920,'height':1080,'decodedAllFrames':True,'videoCodec':'H.264','audio':audio,'decodedAudioSeconds':audio_seconds,'captionCues':len(prepared['cues']),'transitionStrips':len(transitions),'shotStills':len(stills),'textBounds':'DOM overflow and composition-bound checks run on rendered frames','visualReview':'pending human/agent image inspection','deterministicFrames':'pending independent still comparison','captureChecks':prepared['capture']['checks'],'sha256':digest(video)}
(out/('picture-verification.json' if preview else 'verification.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(report))

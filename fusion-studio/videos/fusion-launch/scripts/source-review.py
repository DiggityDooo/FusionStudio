from pathlib import Path
import subprocess,math,json
from PIL import Image,ImageDraw
workspace=Path(__file__).resolve().parent.parent
app=workspace.parent.parent
ffmpeg=app/'test-output/media-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
out=workspace/'local/source-review';out.mkdir(exist_ok=True)
for name in ['blend-edit','blend-preserve','native-render','chat']:
 subprocess.run([str(ffmpeg),'-y','-loglevel','error','-i',str(workspace/'local/capture'/(name+'.mp4')),'-vf','fps=1/2,scale=640:320',str(out/(name+'-%02d.png'))],check=True)
 files=sorted(out.glob(name+'-*.png'));sheet=Image.new('RGB',(1920,math.ceil(len(files)/3)*344),'#161715')
 for i,p in enumerate(files):
  with Image.open(p) as im:sheet.paste(im,((i%3)*640,(i//3)*344))
  ImageDraw.Draw(sheet).text(((i%3)*640+12,(i//3)*344+324),str(i*2+1)+'s',fill='white')
 sheet.save(out/(name+'.jpg'),quality=94)

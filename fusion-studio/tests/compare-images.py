import json,sys
from PIL import Image,ImageChops,ImageStat
a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB')
if a.size!=b.size:raise ValueError('Image dimensions differ')
d=ImageChops.difference(a,b)
print(json.dumps({'meanAbsoluteByteDifference':sum(ImageStat.Stat(d).mean)/3,'maxByteDifference':max(v[1] for v in d.getextrema()),'pixels':a.width*a.height}))

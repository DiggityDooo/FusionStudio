"""Create tone-neutral texture variants from individually documented CC0 skins."""
import hashlib
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SELECTED = [('female','skins01','bobby_03_young_female_hairless','Young_Female_Hairless.png','bobby_03'),
            ('male','skins02','toigo_light_skin_male_bronze','young_lightskinned_male_diffuse_Bronze.png','toigo')]

def main():
    output = ROOT / 'public/characters/skins'
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for sex, pack, name, texture, author in SELECTED:
        archive = ROOT / f'test-output/character-packs/{pack}_cc0.zip'
        with zipfile.ZipFile(archive) as z:
            source = z.read(f'skins/{name}/{texture}')
            material = z.read(f'skins/{name}/{name}.mhmat')
        # Preserve the original, its own material declaration, and exact provenance.
        source_dir = ROOT / 'assets/character-sources/skins' / name
        source_dir.mkdir(parents=True, exist_ok=True)
        (source_dir / texture).write_bytes(source)
        (source_dir / (name+'.mhmat')).write_bytes(material)
        image = Image.open(io.BytesIO(source)).convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS)
        rgb = np.asarray(image,dtype=np.float32)/255
        skin = (rgb[:,:,0]>.25)&(rgb[:,:,0]>rgb[:,:,2])&(rgb[:,:,1]>.12)
        average = np.median(rgb[skin],axis=0)
        normalized = np.clip(rgb/np.maximum(average,.05)*.78,0,1)
        Image.fromarray((normalized*255).astype('uint8')).save(output/f'{sex}-detail.jpg',quality=95)
        # Bump is explicitly an approximation derived from albedo detail, not a scan.
        luminance = image.convert('L')
        highpass = np.asarray(luminance,dtype=float)-np.asarray(luminance.filter(ImageFilter.GaussianBlur(3)),dtype=float)
        Image.fromarray(np.clip(128+highpass*1.6,0,255).astype('uint8')).save(output/f'{sex}-bump.png')
        records.append({'sex':sex,'asset':name,'author':author,'license':'CC0-1.0','catalog':f'https://static.makehumancommunity.org/assets/assetpacks/{pack}.html','archiveURL':f'https://files2.makehumancommunity.org/asset_packs/{pack}/{pack}_cc0.zip','archiveSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),'sourceTexture':texture,'sourceSHA256':hashlib.sha256(source).hexdigest(),'materialSHA256':hashlib.sha256(material).hexdigest(),'derivation':'2k tone-neutral RGB detail; albedo high-pass bump approximation','outputs':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in output.glob(sex+'-*')}})
    (output/'provenance.json').write_text(json.dumps({'schema':1,'assets':records},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'skins':len(records),'directory':str(output)}))

if __name__=='__main__':main()

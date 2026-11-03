"""Register private existing DSON files; never copy asset bytes into product."""
import sys, json, gzip, hashlib
from pathlib import Path
from urllib.parse import unquote
from dson_importer import preflight_dson

project=Path(__file__).resolve().parent.parent
out=Path(sys.argv[1]).resolve()
if not out.is_relative_to(project/'test-output'):
    raise ValueError('Manifest output must stay in test-output')
library=Path('C:/Users/Public/Documents/My DAZ 3D Library')
rows,attempts=[],[]
def document(file):
    raw=file.read_bytes()
    try:
        return json.loads(gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw)
    except (ValueError, OSError) as exc:
        attempts.append({'source':str(file),'category':'selection-unreadable','ok':False,'errors':[str(exc)]})
        return {}
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def independent(file):
    doc=document(file)
    result=[]
    references=[g['url'] for n in doc.get('scene',{}).get('nodes',[]) for g in n.get('geometries',[])]
    if not references:
        references=['#'+g['id'] for g in doc.get('geometry_library',[])]
    for uri in references:
        locator,_,ident=uri.partition('#')
        if locator.startswith('name:'):continue
        source=(library/unquote(locator).lstrip('/')) if locator.startswith('/') else (file.parent/unquote(locator) if locator else file)
        source=source.resolve()
        data=document(source)
        geometry=next(g for g in data.get('geometry_library',[]) if g['id']==unquote(ident))
        vertices=geometry['vertices']['values']
        polygons=geometry['polylist']['values']
        groups=geometry.get('polygon_material_groups',{}).get('values',[])
        result.append({'geometryId':geometry['id'],'geometrySource':str(source),'sourceVertices':len(vertices),'faces':len(polygons),'triangles':sum(len(p)-4 for p in polygons),'usedMaterialGroups':sorted({groups[p[1]] for p in polygons}) if groups else []})
    return result
def register(relative,category,target=None):
    file=library/relative if not isinstance(relative,Path) else relative
    if not file.is_file():raise ValueError('Missing corpus file '+str(file))
    report=preflight_dson(file,[library],{'target_source':str(target)} if target else None)
    attempts.append({'source':str(file),'category':category,'ok':report['ok'],'errors':report['errors']})
    if not report['ok']:return False
    row={'id':'dson-'+str(len(rows)+1),'source':str(file),'family':file.suffix.lower(),'category':category,'sha256':digest(file),'capabilities':{'dson':True,'preset':bool(report.get('preset'))},'oracle':independent(file) if not target else [],'preflight':report,'dependencies':[]}
    for dep in report['dependencies']:
        p=Path(dep['path'])
        if p.is_file():row['dependencies'].append({'path':str(p),'sha256':digest(p)})
    if target:row['targetSource']=str(target)
    rows.append(row)
    return True
base_f=library/'People/Genesis 8 Female/Genesis 8 Basic Female.duf'
base_m=library/'People/Genesis 8 Male/Genesis 8 Basic Male.duf'
base_9=library/'People/Genesis 9/Genesis 9.duf'
for file in [base_f,base_m,base_9]:register(file,'base-character')
for file in ['Props/Built-in/Light Disc.duf','Props/Built-in/Light Sphere.duf']:register(file,'prop')
for file in ['People/Genesis 8 Female/Clothing/Basic Wear/Basic Wear Bra.duf','People/Genesis 8 Male/Clothing/Basic Wear/Basic Wear MuscleShirt.duf']:register(file,'clothing')
for file in ['People/Genesis 8 Female/Hair/Daz Originals/HS Brenna Braid Hair with Hat/HS BBraid Hair G8F.duf','People/Genesis 8 Male/Hair/Armani Hair/Armani Hair.duf']:register(file,'mesh-hair')
register('data/DAZ 3D/Genesis 9/Base/Genesis9.dsf','standalone-dsf')
register('People/Clothing/VOOTW/Vo Xiao Hua Armour/Vo Xiao Hua Foot Pose.duf','pose-preset',base_9)
# Pose files have static keys. Independent raw channels determine expected effects.
for folder,target in [('People/Genesis 8 Female/Poses/Daz Originals',base_f),('People/Genesis 9/Poses/Daz Originals',base_9)]:
    count=0
    for file in sorted((library/folder).rglob('*.duf')):
        doc=document(file)
        if doc.get('asset_info',{}).get('type') not in ('preset_pose','preset_hierarchical_pose'):continue
        records=doc.get('scene',{}).get('animations',[])
        if not any('rotation/' in r.get('url','') and r.get('keys',[[0,0]])[0][1]!=0 for r in records):continue
        if any(len(r.get('keys',[]))>1 for r in records):continue
        if any('translation/' in r.get('url','') and r.get('keys',[[0,0]])[0][1]!=0 for r in records):continue
        if register(file,'pose-preset',target):
            count+=1
            if sum(r['category']=='pose-preset' for r in rows)>=2:break
    if not count:attempts.append({'category':'pose-preset','folder':folder,'ok':False,'errors':['No matching static pose selected']})
# Two existing base-resolution shape presets; HD-only files are deliberately excluded.
count=0
for folder,target in [('People/Genesis 9/Shapes/Zev0',base_9),('People/Genesis 9/Shapes/SickleYield',base_9),('People/Genesis 8 Female/Shapes',base_f)]:
    for file in sorted((library/folder).rglob('*.duf')):
        if count>=2:break
        if 'hd' in file.stem.lower() or file.stat().st_size>2*1024*1024:continue
        doc=document(file)
        if doc.get('asset_info',{}).get('type')!='preset_shape':continue
        records=doc.get('scene',{}).get('animations',[])
        if not records or len(records)>8 or any(len(r.get('keys',[]))!=1 for r in records):continue
        report=preflight_dson(file,[library],{'target_source':str(target)})
        if not report.get('preset',{}).get('extra_morphs'):continue
        if register(file,'shape-preset',target):count+=1
    if count>=2:break
for folder,target in [('People/Genesis 8 Female/Clothing/Basic Wear/Materials',library/'People/Genesis 8 Female/Clothing/Basic Wear/Basic Wear Bra.duf'),('People/Genesis 8 Male/Clothing/Basic Wear/Materials',library/'People/Genesis 8 Male/Clothing/Basic Wear/Basic Wear MuscleShirt.duf')]:
    for file in sorted((library/folder).rglob('*.duf')):
        doc=document(file)
        if doc.get('asset_info',{}).get('type')=='preset_material' and doc.get('scene',{}).get('materials'):
            expected={g for m in independent(target) for g in m['usedMaterialGroups']}
            groups={g for m in doc['scene']['materials'] for g in m.get('groups',[])}
            if groups and groups.issubset(expected) and register(file,'material-preset',target):break
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'schema':1,'privateAssetsRemainLocal':True,'fixtures':rows,'selectionAttempts':attempts},indent=2),encoding='utf8')
print(json.dumps({'manifest':str(out),'count':len(rows),'categories':{key:sum(r['category']==key for r in rows) for key in sorted({r['category'] for r in rows})}}))

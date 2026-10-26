"""Extract CC0 authored hair guides as plain data, bound to verified source triangles.

Run in Blender with --factory-startup --disable-autoexec. Does not execute the
asset's node graphs, scripts or drivers, or modify the downloaded asset.
"""
import bpy
import gzip
import hashlib
import json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'test-output/character-packs/hair-inspect/hair.blend'
with bpy.data.libraries.load(str(source),link=False) as (src,dest):
    dest.objects=src.objects
human=next(o for o in dest.objects if o and o.name=='Human')
definition=json.loads(gzip.decompress((ROOT/'public/characters/makehuman-v1.json.gz').read_bytes()))
if len(human.data.vertices)!=len(definition['source']['positions'])//3:
    raise ValueError('Hair template source topology does not match HM08')
vertices=[human.matrix_world@v.co for v in human.data.vertices]
ids=definition['source']['triangles']
triangles=[ids[i:i+3] for i in range(0,len(ids),3)]
bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
styles={}
names={'basic_short_hair':'short','hedgehog':'spiked','straight_hair_to_shoulder':'long','wild_eyebrow':'brows','wild_beard':'beard','wild_moustache':'moustache','basic_lashes_upper':'lashes-upper','basic_lashes_lower':'lashes-lower'}
max_distance=0
for obj in dest.objects:
    if not obj or obj.name not in names:continue
    guides=[]
    for curve in obj.data.curves:
        points=[obj.matrix_world@p.position for p in curve.points]
        if len(points)<2:continue
        point,normal,face,distance=bvh.find_nearest(points[0])
        if distance>.02:raise ValueError('Hair guide root is too far from the reference scalp')
        max_distance=max(max_distance,distance)
        ia,ib,ic=triangles[face];a,b,c=vertices[ia],vertices[ib],vertices[ic]
        v0,v1,v2=b-a,c-a,point-a
        d00,d01,d11,d20,d21=v0.dot(v0),v0.dot(v1),v1.dot(v1),v2.dot(v0),v2.dot(v1)
        denom=d00*d11-d01*d01
        if abs(denom)<1e-18:continue
        v=(d11*d20-d01*d21)/denom;w=(d00*d21-d01*d20)/denom
        tangent=v0.normalized();normal=v0.cross(v1).normalized();bitangent=normal.cross(tangent).normalized()
        offsets=[]
        # Bound the data size while preserving endpoints along the authored polyline.
        length=len(points)
        for k in range(min(32,length)):
            t=k*(length-1)/max(1,min(32,length)-1);index=int(t)
            p=points[index].lerp(points[min(index+1,length-1)],t-index)-point
            offsets.extend(round(p.dot(axis),7) for axis in (tangent,bitangent,normal))
        guides.append({'triangle':[ia,ib,ic],'barycentric':[1-v-w,v,w],'offsets':offsets})
    styles[names[obj.name]]=guides
data={'schema':1,'family':'makehuman-hm08','styles':styles,'source':{'author':'Tomáš Klecer','license':'CC0-1.0','catalog':'https://static.makehumancommunity.org/assets/assetpacks/haireditor.html','archiveURL':'https://files2.makehumancommunity.org/functional/haireditor.zip','archiveSHA256':hashlib.sha256((ROOT/'test-output/character-packs/haireditor.zip').read_bytes()).hexdigest(),'blendSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'maximumRootDistanceMeters':max_distance,'method':'nearest verified HM08 body triangle, barycentric root, triangle-frame guide offsets; no node graph execution'}}
target=ROOT/'assets/character-sources/hair-guides.json'
target.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
print(json.dumps({'guides':{k:len(v) for k,v in styles.items()},'maximumRootDistance':max_distance,'bytes':target.stat().st_size}))

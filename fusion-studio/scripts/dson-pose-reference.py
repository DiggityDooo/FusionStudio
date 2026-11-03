"""Independent DSON transform evaluation in Blender, before glTF export."""
import sys,json,gzip,copy,hashlib
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from dson_importer import import_dson
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
project=Path(__file__).resolve().parent.parent
if not out.is_relative_to(project/'test-output'):raise ValueError('References must stay in test-output')
out.mkdir(parents=True,exist_ok=True)
library=Path('C:/Users/Public/Documents/My DAZ 3D Library')
source=library/'People/Genesis 9/Genesis 9.duf'
raw=source.read_bytes()
doc=json.loads(gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw)
rows=[]
for axis in '0xyz':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    variant=copy.deepcopy(doc)
    variant.setdefault('scene',{}).setdefault('nodes',[]).append({'id':'hip','parent':'#Genesis9','url':'/data/DAZ%203D/Genesis%209/Base/Genesis9.dsf#hip','rotation':[{'id':a,'current_value':30 if a==axis else 0} for a in 'xyz']})
    file=out/('authored-hip-'+axis+'.duf')
    file.write_text(json.dumps(variant),encoding='utf8')
    import_dson(file,[library])
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    samples=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(deps)
        mesh=evaluated.to_mesh()
        for i in range(0,len(mesh.vertices),max(1,len(mesh.vertices)//100)):
            p=obj.matrix_world @ mesh.vertices[i].co
            samples.append({'geometryId':obj['dson_geometry_id'],'vertex':i,'position':[p.x,p.z,-p.y]})
        evaluated.to_mesh_clear()
    preset=out/('hip-'+axis+'.duf')
    preset.write_text(json.dumps({'asset_info':{'type':'preset_pose','id':'/People/Genesis%209/Poses/Hip-'+axis+'.duf'},'scene':{'animations':[{'url':'name://@selection/hip:?rotation/'+a+'/value','keys':[[0,30 if a==axis else 0]]} for a in 'xyz']}}),encoding='utf8')
    rows.append({'axis':axis,'source':str(preset),'samples':samples})
(out/'references.json').write_text(json.dumps({'source':str(source),'sourceSha256':hashlib.sha256(raw).hexdigest(),'reference':'DSON source rotation overrides evaluated through Blender before glTF export','poses':rows}),encoding='utf8')
print('DSON_POSE_REFERENCES '+json.dumps({'poses':len(rows),'samples':len(rows[0]['samples'])}))

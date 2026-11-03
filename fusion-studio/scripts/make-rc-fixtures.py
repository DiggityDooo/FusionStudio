"""Independent Blender-authored import corpus and evaluated reference coordinates."""
import bpy, json, sys, math, hashlib
from pathlib import Path
from mathutils import Vector

project = Path(__file__).resolve().parent.parent
output = Path(sys.argv[sys.argv.index('--')+1]).resolve()
if not output.is_relative_to(project / 'test-output'):
    raise ValueError('Fixtures must stay inside project test-output')
output.mkdir(parents=True, exist_ok=True)
rows = []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 0, 24
    return scene

def material(name, texture=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.2, 0.4, 0.7, 1)
    bsdf.inputs['Roughness'].default_value = 0.35
    if texture:
        image = bpy.data.images.new('Authored checker', width=2, height=2)
        image.pixels = [1,0,0,1, 0,1,0,1, 0,0,1,1, 1,1,0,1]
        image.filepath_raw = str(output / 'checker.png')
        image.file_format = 'PNG'
        image.save()
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

def static(variant=0):
    scene = reset()
    parent = bpy.data.objects.new('Authored parent', None)
    scene.collection.objects.link(parent)
    parent.location = (0.25, -0.1, 0.2)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1))
    obj = bpy.context.object
    obj.name = 'Authored block'
    obj.parent = parent
    obj.scale = (1+variant*.2, .5+variant*.1, 1.5)
    obj.data.materials.append(material('Checked paint', texture=variant==0))
    if variant:
        obj.data.materials.append(material('Second surface'))
        for poly in obj.data.polygons:
            poly.material_index = poly.index % 2
    return scene

def rigged():
    scene = reset()
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
    mesh = bpy.context.object
    mesh.name = 'Authored deforming body'
    for vertex in mesh.data.vertices:
        vertex.co.x *= .4
        vertex.co.y *= .3
        vertex.co.z += 1
    mesh.data.materials.append(material('Rig surface'))
    mesh.shape_key_add(name='Basis')
    key = mesh.shape_key_add(name='Authored shape')
    for v in key.data:
        if v.co.z > 1:
            v.co.x += .25
    for frame,value in [(0,.1),(12,.5),(24,.8)]:
        key.value=value
        key.keyframe_insert('value', frame=frame)
    arm_data = bpy.data.armatures.new('Authored skeleton')
    arm = bpy.data.objects.new('Authored rig', arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    root=arm_data.edit_bones.new('root')
    root.head,root.tail=(0,0,0),(0,0,1)
    tip=arm_data.edit_bones.new('tip')
    tip.head,tip.tail=(0,0,1),(0,0,2)
    tip.parent=root
    bpy.ops.object.mode_set(mode='OBJECT')
    low=mesh.vertex_groups.new(name='root')
    high=mesh.vertex_groups.new(name='tip')
    for v in mesh.data.vertices:
        (high if v.co.z>1 else low).add([v.index],1,'REPLACE')
    modifier=mesh.modifiers.new('Authored skin','ARMATURE')
    modifier.object=arm
    for frame,value in [(0,0),(12,.4),(24,-.25)]:
        arm.pose.bones['tip'].rotation_mode='XYZ'
        arm.pose.bones['tip'].rotation_euler.y=value
        arm.pose.bones['tip'].keyframe_insert('rotation_euler', frame=frame)
    scene.frame_set(0)
    return scene

def oracle(scene, frame):
    scene.frame_set(frame)
    deps=bpy.context.evaluated_depsgraph_get()
    points=[]
    parts=[]
    for obj in scene.objects:
        if obj.type!='MESH' or obj.hide_render:
            continue
        evaluated=obj.evaluated_get(deps)
        data=evaluated.to_mesh()
        transformed=[]
        for vertex in data.vertices:
            p=obj.matrix_world @ vertex.co
            transformed.append([float(p.x),float(p.z),float(-p.y)])
        points.extend(transformed)
        parts.append({'name':obj.name,'sourceVertices':len(data.vertices),'triangles':sum(len(p.vertices)-2 for p in data.polygons),'materials':len(data.materials),'uv':bool(data.uv_layers),'points':transformed})
        evaluated.to_mesh_clear()
    return {'frame':frame,'bounds':{'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)]},'parts':parts}

def register(file, category, capabilities=None, frames=(0,), **extra):
    rows.append({'id':file.stem+'-'+file.suffix[1:],'source':str(file),'family':file.suffix.lower(),'category':category,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'independentOracle':True,'capabilities':capabilities or {},'samples':[oracle(bpy.context.scene,frame) for frame in frames],**extra})

for variant in range(3):
    scene=static(variant)
    for ext in ['glb','fbx','obj'] + (['stl','ply'] if variant<2 else []):
        file=output/f'static-{variant}.{ext}'
        if ext=='glb':
            if variant==1:
                file=file.with_suffix('.gltf')
                bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLTF_SEPARATE',export_extras=True,export_attributes=True)
            else:
                bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',export_extras=True,export_attributes=True)
        elif ext=='fbx':
            bpy.ops.export_scene.fbx(filepath=str(file),add_leaf_bones=False,path_mode='COPY',embed_textures=True)
        elif ext=='obj':
            bpy.ops.wm.obj_export(filepath=str(file),export_materials=True)
        elif ext=='stl':
            bpy.ops.wm.stl_export(filepath=str(file),ascii_format=bool(variant),global_scale=1000,apply_modifiers=True)
        elif ext=='ply':
            bpy.ops.wm.ply_export(filepath=str(file),ascii_format=bool(variant),apply_modifiers=True)
        register(file,'static-exchange',{'uv':ext not in ('stl','ply'),'texture':variant==0 and ext in ('glb','fbx','obj')})
    if variant<2:
        for ext in ['usda' if variant==0 else 'usdc','abc']:
            file=output/f'static-{variant}.{ext}'
            if ext=='abc':bpy.ops.wm.alembic_export(filepath=str(file),start=0,end=0,as_background_job=False)
            else:bpy.ops.wm.usd_export(filepath=str(file),export_materials=True,export_animation=False)
            register(file,'static-cache',{'staticSubset':True})
    if variant==0:
        file=output/'textured-hierarchy.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(file))
        register(file,'blend-authored',{'uv':True,'texture':True,'hierarchy':True},blendMode='preserved')

scene=rigged()
for ext in ['blend','glb','gltf','fbx']:
    file=output/f'rigged-animation.{ext}'
    if ext=='blend':bpy.ops.wm.save_as_mainfile(filepath=str(file))
    elif ext=='fbx':bpy.ops.export_scene.fbx(filepath=str(file),add_leaf_bones=False,bake_anim=True)
    else:bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB' if ext=='glb' else 'GLTF_SEPARATE',export_extras=True,export_attributes=True,export_animations=True)
    register(file,'rigged-animation',{'rig':True,'morph':True,'animation':True},frames=(0,12,24),blendMode='interchange')

scene=static(2)
obj=next(o for o in scene.objects if o.type=='MESH')
modifier=obj.modifiers.new('Authored mirror','MIRROR')
modifier.use_axis[0]=True
collection=bpy.data.collections.new('Authored prototypes')
scene.collection.children.link(collection)
prototype=bpy.data.objects.new('Prototype',obj.data.copy())
collection.objects.link(prototype)
prototype.location=(2,0,1)
instance=bpy.data.objects.new('Collection instance',None)
scene.collection.objects.link(instance)
instance.instance_type='COLLECTION'
instance.instance_collection=collection
instance.location=(0,2,0)
file=output/'modifiers-instances.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(file))
register(file,'blend-native-subset',{'nativeInstanceRenderOnly':True},blendMode='preserved',expectedWarning='Prototype instance')

scene=static(0)
image=next(i for i in bpy.data.images if i.name=='Authored checker')
image.filepath=str(output/'deliberately-missing.png')
file=output/'missing-dependency.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(file))
register(file,'negative-dependency',{'missingDependency':True},blendMode='preserved',expectedFailure='pack|missing|Cannot|Unable')

(output/'manifest.json').write_text(json.dumps({'schema':1,'generator':'independent Blender authoring; no Fusion import/export helpers','fixtures':rows},indent=2),encoding='utf8')
print('RC_FIXTURES '+json.dumps({'path':str(output/'manifest.json'),'count':len(rows)}))

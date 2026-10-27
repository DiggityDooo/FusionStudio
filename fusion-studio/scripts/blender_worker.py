"""Fusion's isolated worker. Runs in the user's installed Blender; never installs code there."""
import json
import math
import os
import sys
import traceback
from pathlib import Path
import bpy
import bmesh
sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_scene import capture as capture_native, render_native, settings as render_settings
from character_materials import apply_character_materials
from mathutils import Matrix, Vector

# Must list every operation in electron/mesh-operations.json (the worker cannot read the packaged archive).
MESH_ACTIONS = {'subdivide','bevel','decimate','solidify','mirror','remesh','recalculate','uv','boolean','array','wireframe','weld','triangulate','smooth','twist','bend','taper','stretch',
    'screw','radial_array','inset','bisect','quad_remesh','quads','fill_holes','edge_split','displace','cast'}


def checked(result, label):
    if 'FINISHED' not in result:
        raise RuntimeError(label + ' did not finish: ' + str(result))


def ui_axis(name):
    """Fusion's Y-up axis as a Blender-local direction (glTF import maps +Z to -Y)."""
    return {'X': Vector((1, 0, 0)), 'Y': Vector((0, 0, 1)), 'Z': Vector((0, -1, 0))}[name]


def edit_bmesh(obj, operation):
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        operation(bm)
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()


def bisect(bm, obj, options):
    normal = ui_axis(options.get('axis', 'Y'))
    centre = sum((Vector(c) for c in obj.bound_box), Vector()) / 8
    keep = options.get('keep', 'Both')
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=centre + normal * float(options.get('offset', 0)), plane_no=normal,
                                 clear_inner=keep == 'Positive', clear_outer=keep == 'Negative')
    if options.get('fill') == 'Yes':
        # Imported meshes split vertices at UV/normal seams; join the cut outline so it closes into one loop.
        bmesh.ops.remove_doubles(bm, verts=[v for v in cut['geom_cut'] if isinstance(v, bmesh.types.BMVert) and v.is_valid], dist=1e-6)
        plane = centre + normal * float(options.get('offset', 0))
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary and all(abs(normal.dot(v.co - plane)) < 1e-5 for v in e.verts)], sides=0)


def fill_holes(bm, obj, options):
    # glTF splits vertices along UV/normal seams; rejoin coincident boundary vertices so only real holes stay open.
    bmesh.ops.remove_doubles(bm, verts=list({v for e in bm.edges if e.is_boundary for v in e.verts}), dist=1e-6)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=int(options['sides']))


BMESH_OPERATIONS = {
    'inset': lambda bm, obj, o: bmesh.ops.inset_individual(bm, faces=bm.faces[:], thickness=float(o['thickness']), depth=float(o['depth']), use_even_offset=True),
    'bisect': bisect,
    'quads': lambda bm, obj, o: bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=math.radians(float(o['angle'])), angle_shape_threshold=math.radians(float(o['angle']))),
    'fill_holes': fill_holes,
}


def import_model(file, options=None):
    ext = file.suffix.lower()
    if ext == '.duf':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from dson_importer import import_dson
        options=options or {}
        return import_dson(str(file),options.get('contentRoots',[]),{'morph_values':options.get('morphValues',{}),'pose_values':options.get('poseValues',{}),'import_rig':True})
    if ext == '.blend':
        # Append data only; never open or run the source blend's scripts.
        with bpy.data.libraries.load(str(file), link=False) as (src, dst):
            dst.objects = src.objects
        for obj in dst.objects:
            if obj is not None and not obj.get('fusion_studio_helper', False):
                bpy.context.scene.collection.objects.link(obj)
        return
    ops = {
        '.glb': bpy.ops.import_scene.gltf, '.gltf': bpy.ops.import_scene.gltf,
        '.fbx': bpy.ops.import_scene.fbx, '.obj': bpy.ops.wm.obj_import,
        '.stl': bpy.ops.wm.stl_import, '.ply': bpy.ops.wm.ply_import,
        '.abc': bpy.ops.wm.alembic_import,
        '.usd': bpy.ops.wm.usd_import, '.usda': bpy.ops.wm.usd_import,
        '.usdc': bpy.ops.wm.usd_import, '.usdz': bpy.ops.wm.usd_import,
    }
    if ext not in ops:
        raise ValueError('Unsupported model: ' + ext)
    checked(ops[ext](filepath=str(file)), 'Import')


def bounds(meshes):
    coords = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    if not coords:
        raise ValueError('No meshes in the scene.')
    low = Vector(tuple(min(c[i] for c in coords) for i in range(3)))
    high = Vector(tuple(max(c[i] for c in coords) for i in range(3)))
    return low, high


def studio(meshes, options=None):
    options = options or {}
    scene = bpy.context.scene
    low, high = bounds(meshes)
    target = (low + high) / 2
    radius = max((high-low).length / 2, .1)
    bpy.ops.object.camera_add(location=target+Vector((1.6, -2.4, 1.25))*radius)
    camera=bpy.context.object
    camera['fusion_studio_helper']=True
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=radius*2.6
    if 'camera' in options:
        setting=options['camera']
        camera.location=Vector((setting['position'][0],-setting['position'][2],setting['position'][1]))
        look=Vector((setting['target'][0],-setting['target'][2],setting['target'][1]))
        camera.rotation_euler=(look-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='PERSP';camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24
        camera.data.lens=24/(2*math.tan(math.radians(max(5,min(120,float(setting.get('fov',38)))))/2))
        if setting.get('orthoHeight'):
            camera.data.type='ORTHO';camera.data.ortho_scale=max(.001,float(setting['orthoHeight']))
    scene.camera=camera
    for name,offset,power,size in [
        ('Key',(1,-1.8,2.8),220,2),('Fill',(-2,-.5,1),100,3),('Rim',(0,2,2),300,2)
    ]:
        bpy.ops.object.light_add(type='AREA',location=target+Vector(offset)*radius)
        lamp=bpy.context.object;lamp.name=name
        lamp['fusion_studio_helper']=True
        lamp.data.energy=power*max(radius*radius,.1);lamp.data.shape='DISK';lamp.data.size=size*radius
        lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=radius*200,location=(target.x,target.y,low.z-.02*radius))
    plane=bpy.context.object;plane.name='Fusion studio floor'
    plane['fusion_studio_helper']=True
    mat=bpy.data.materials.new('Studio charcoal');mat.diffuse_color=(.055,.06,.07,1);mat.use_nodes=True
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.06,.07,1)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
    plane.data.materials.append(mat)
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value=(.18,.2,.24,1)
    background.inputs['Strength'].default_value=.35
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.cycles.samples=max(8,min(256,int(options.get('samples',32))))
    scene.cycles.use_denoising=True
    scene.render.resolution_x=max(128,min(4096,int(options.get('width',1200))));scene.render.resolution_y=max(128,min(4096,int(options.get('height',1000))));scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'


def has_id(obj, target):
    current=obj
    while current is not None:
        if current.get('fusion_id') == target:
            return True
        current=current.parent
    return False


def apply_world_scale(obj):
    # All changes occur on this job's imported copy, with world placement preserved.
    world=obj.matrix_world.copy()
    obj.parent=None
    obj.matrix_world=world
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    checked(bpy.ops.object.transform_apply(location=False,rotation=False,scale=True),'Apply world scale')


def sewn_pattern(meshes, selected, options):
    pattern=options['patternCloth']
    name=selected[0].name
    for obj in selected:
        meshes.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
    data=bpy.data.meshes.new('Fusion sewn panels')
    data.from_pydata([(v[0],-v[2],v[1]) for v in pattern['vertices']],pattern['sewing'],pattern['faces']);data.update()
    uv=data.uv_layers.new(name='Pattern UV')
    for loop in data.loops:uv.data[loop.index].uv=pattern['uvs'][loop.vertex_index*2:loop.vertex_index*2+2]
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj['fusion_id']=options.get('targetId','sewn-pattern');obj['fusion_cloth']=True
    mat=bpy.data.materials.new('Pattern fabric');mat.use_nodes=True
    color=tuple(int(pattern['color'][i:i+2],16)/255 for i in (1,3,5))
    color=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
    data.materials.append(mat);meshes.append(obj)
    return [obj]


def cloth_bake(meshes, selected, options):
    scene=bpy.context.scene
    frames=max(2,min(160,int(options.get('frames',45))))
    scene.frame_start=1;scene.frame_end=frames
    for obj in meshes:
        bpy.context.view_layer.objects.active=obj
        if obj not in selected:
            # Convert the collider's current pose to a disposable static mesh.
            evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            data=bpy.data.meshes.new_from_object(evaluated)
            obj.modifiers.clear();obj.data=data
            if len(data.polygons)>15000:
                reduce=obj.modifiers.new('Collision proxy','DECIMATE');reduce.ratio=.2
                checked(bpy.ops.object.modifier_apply(modifier=reduce.name),'Collision proxy')
            obj.modifiers.new('Collision','COLLISION')
            obj.collision.thickness_outer=.004
        else:
            apply_world_scale(obj)
            pattern=options.get('patternCloth')
            if not pattern:
                bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(obj.data);bm.free()
            pin=obj.vertex_groups.new(name='Fusion pinned edge')
            # Determine pins by maximum local vertical position after glTF coordinate conversion.
            top=max(v.co.z for v in obj.data.vertices)
            vertices=pattern['pins'] if pattern else [v.index for v in obj.data.vertices if v.co.z>=top-.002]
            if vertices:pin.add(vertices,1.0,'REPLACE')
            modifier=obj.modifiers.new('Fusion cloth','CLOTH')
            modifier.settings.quality=10 if pattern else 6
            fabric=pattern or options
            modifier.settings.mass=max(.05,min(2.0,float(fabric.get('mass',.25))))
            stiffness=max(1,min(80,float(fabric.get('stiffness',12))))
            modifier.settings.tension_stiffness=stiffness;modifier.settings.compression_stiffness=stiffness
            modifier.settings.shear_stiffness=stiffness*.5;modifier.settings.bending_stiffness=float(fabric.get('bending',.25))
            if pattern:
                modifier.settings.use_sewing_springs=True;modifier.settings.sewing_force_max=float(pattern['sewingForce'])
            modifier.settings.vertex_group_mass=pin.name
            modifier.collision_settings.use_collision=True;modifier.collision_settings.distance_min=.006
            modifier.collision_settings.use_self_collision=True;modifier.collision_settings.self_distance_min=.006
            if pattern:
                modifier.collision_settings.distance_min=float(pattern['collisionDistance'])
                modifier.collision_settings.self_distance_min=float(pattern['collisionDistance'])
            modifier.point_cache.frame_start=1;modifier.point_cache.frame_end=frames
            obj.select_set(False)
    for frame in range(1,frames+1):
        scene.frame_set(frame)
        depsgraph=bpy.context.evaluated_depsgraph_get()
        for obj in selected:
            evaluated=obj.evaluated_get(depsgraph)
            temporary=evaluated.to_mesh();evaluated.to_mesh_clear()
        if frame%10==0:print('FUSION_CLOTH_FRAME '+str(frame)+'/'+str(frames),flush=True)
    movement=0.0;sewing_report=None
    for obj in selected:
        bpy.context.view_layer.objects.active=obj
        before=[v.co.copy() for v in obj.data.vertices]
        modifier=next(m for m in obj.modifiers if m.type=='CLOTH')
        checked(bpy.ops.object.modifier_apply(modifier=modifier.name),'Cloth bake')
        movement=max(movement,max((obj.data.vertices[i].co-point).length for i,point in enumerate(before)))
        if options.get('patternCloth'):
            pairs=options['patternCloth']['sewing']
            before_gap=sum((before[a]-before[b]).length for a,b in pairs)/max(1,len(pairs))
            after_gap=sum((obj.data.vertices[a].co-obj.data.vertices[b].co).length for a,b in pairs)/max(1,len(pairs))
            pin_error=max(((obj.data.vertices[i].co-before[i]).length for i in options['patternCloth']['pins']),default=0)
            sewing_report={'spring_count':len(pairs),'mean_gap_before':before_gap,'mean_gap_after':after_gap,'max_pin_displacement':pin_error}
        thickness=obj.modifiers.new('Fabric thickness','SOLIDIFY');thickness.thickness=max(.0002,min(.02,float(options.get('thickness',.002))))
        checked(bpy.ops.object.modifier_apply(modifier=thickness.name),'Fabric thickness')
        for face in obj.data.polygons:face.use_smooth=True
    return movement,sewing_report


def mesh_channels(meshes):
    return {
        'vertices':sum(len(obj.data.vertices) for obj in meshes),
        'faces':sum(len(obj.data.polygons) for obj in meshes),
        'uvLayers':sorted({layer.name for obj in meshes for layer in obj.data.uv_layers}),
        'attributes':sorted({layer.name for obj in meshes for layer in obj.data.attributes if not layer.name.startswith('.') }),
        'materials':sorted({material.name for obj in meshes for material in obj.data.materials if material}),
    }


def main(specfile=None):
    specfile=Path(specfile or sys.argv[sys.argv.index('--')+1]).resolve()
    spec=json.loads(specfile.read_text(encoding='utf-8'))
    directory=Path(spec['directory']).resolve()
    output=Path(spec['output']).resolve()
    if output.parent != directory or specfile.parent != directory or output.exists():
        raise ValueError('Output must be a new file in the job directory.')
    # Fresh scene per revision: no stale lights, animations, caches or datablocks.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute=False
    bpy.context.scene.world=bpy.data.worlds.new('Fusion world')
    options=spec.get('params',{})
    if spec['action']=='flattenPanels':
        from surface_panels import flatten_panels
        flattened=flatten_panels(json.loads(Path(spec['input']).read_text(encoding='utf-8')))
        output.write_text(json.dumps(flattened,allow_nan=False),encoding='utf-8')
        report={'blender':bpy.app.version_string,'action':spec['action'],'output':str(output),'panels':len(flattened['panels']),'vertices':len(flattened['positions']),'method':flattened['method'],'milliseconds':flattened['milliseconds']}
        (directory/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print('FUSION_RESULT '+json.dumps(report),flush=True)
        return
    if options.get('nativeScene'):
        report=render_native(options['nativeScene']['snapshot'],spec.get('input') if options['nativeScene'].get('ordinary') else None,output,options,import_model)
        report.update({'blender':bpy.app.version_string,'action':spec['action'],'output':str(output)})
        (directory/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        return
    native=None
    if spec['action']=='convert' and Path(spec['input']).suffix.lower()=='.blend' and options.get('blendMode','preserved')=='preserved':
        native=capture_native(Path(spec['input']),directory,spec.get('scale',1))
        dson=None
    else:dson=import_model(Path(spec['input']),options)
    scene=bpy.context.scene
    character_material_report=apply_character_materials(options.get('characterMaterials'))
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    factor=1 if native else spec.get('scale',1)
    for obj in scene.objects:
        if obj.parent is None:
            obj.scale *= factor
            obj.location *= factor
    bpy.context.view_layer.update()
    meshes=[o for o in scene.objects if o.type=='MESH']
    if not meshes:
        raise ValueError('The imported file contains no mesh objects.')
    action=spec['action']
    options=spec.get('params',{})
    cloth_movement=None;sewing_report=None
    selected=[o for o in meshes if has_id(o,options.get('targetId'))] if options.get('targetId') else meshes
    if not selected:
        raise ValueError('The selected mesh was not found after conversion.')
    if action=='cloth':
        if options.get('patternCloth'):selected=sewn_pattern(meshes,selected,options)
        cloth_movement,sewing_report=cloth_bake(meshes,selected,options)
    original_action=action
    original_options=options
    operations=options.get('stack',[]) if action=='stack' else [{'action':action,'enabled':True,'params':options}]
    stack_report=[]
    for entry in operations:
        before=mesh_channels(selected)
        stage={'id':entry.get('id'),'action':entry['action'],'enabled':entry.get('enabled',True),'before':before,'warnings':[]}
        if not stage['enabled']:
            stage['after']=before;stack_report.append(stage);continue
        action=entry['action'];options={**original_options,**entry.get('params',{})}
        if action in MESH_ACTIONS:
            cutter=None
            if action=='boolean':
                cutters=[o for o in meshes if has_id(o,options.get('cutterId'))]
                if not cutters:raise ValueError('Boolean cutter was not found.')
                bpy.ops.object.select_all(action='DESELECT')
                for o in cutters:o.select_set(True)
                bpy.context.view_layer.objects.active=cutters[0]
                if len(cutters)>1:checked(bpy.ops.object.join(),'Combine cutters')
                cutter=cutters[0]
            for obj in selected:
                bpy.context.view_layer.objects.active=obj
                bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
                if action in ('bevel','solidify','remesh','wireframe','weld','inset','bisect','screw','radial_array','displace'):apply_world_scale(obj)
                # UI axes are Y-up; Blender's glTF conversion uses Z-up.
                local_axis={'X':'X','Y':'Z','Z':'Y'}[options.get('axis','Y')]
                if action=='subdivide':
                    if len(obj.data.polygons)*(4**int(options.get('levels',1)))>1000000: raise ValueError('Subdivision limit: reduce this mesh below 250,000 polygons first.')
                    modifier=obj.modifiers.new('Fusion subdivision','SUBSURF');modifier.levels=int(options.get('levels',1))
                elif action=='bevel':
                    modifier=obj.modifiers.new('Fusion bevel','BEVEL');modifier.width=float(options.get('amount',.025));modifier.segments=int(options.get('segments',3))
                elif action=='decimate':
                    modifier=obj.modifiers.new('Fusion reduction','DECIMATE');modifier.ratio=float(options.get('ratio',spec['ratio']))
                elif action=='solidify':
                    checked(bpy.ops.object.transform_apply(location=False,rotation=False,scale=True),'Apply scale')
                    modifier=obj.modifiers.new('Fusion thickness','SOLIDIFY');modifier.thickness=float(options.get('amount',.02));modifier.offset=float(options.get('offset',-1))
                elif action=='mirror':
                    modifier=obj.modifiers.new('Fusion mirror','MIRROR');modifier.use_axis=tuple(a==local_axis for a in 'XYZ');modifier.use_clip=True
                elif action=='remesh':
                    voxel=max(.005,min(.2,float(options.get('voxel',.04))))
                    dims=obj.dimensions
                    cells=max(1,round(dims.x/voxel))*max(1,round(dims.y/voxel))*max(1,round(dims.z/voxel))
                    stage['estimate']={'voxelSize':voxel,'gridCells':cells}
                    if cells>8000000: raise ValueError(f"Voxel remesh estimate: {cells:,} grid cells at {voxel} m voxel size exceeds the 8,000,000-cell budget. Increase the voxel size or shrink the mesh.")
                    modifier=obj.modifiers.new('Fusion remesh','REMESH');modifier.mode='VOXEL';modifier.voxel_size=voxel
                elif action=='boolean':
                    modifier=obj.modifiers.new('Fusion difference','BOOLEAN');modifier.operation=options.get('operation','DIFFERENCE');modifier.object=cutter;modifier.solver='EXACT'
                elif action=='array':
                    count=int(options.get('count',3))
                    if len(obj.data.polygons)*count>1000000:raise ValueError('Array exceeds one million output faces. Reduce copies or simplify the input.')
                    modifier=obj.modifiers.new('Fusion array','ARRAY');modifier.count=count
                    direction=-1 if options.get('axis')=='Z' else 1
                    modifier.relative_offset_displace=tuple(direction*float(options.get('offset',1.1)) if a==local_axis else 0 for a in 'XYZ')
                elif action=='wireframe':
                    modifier=obj.modifiers.new('Fusion wireframe','WIREFRAME');modifier.thickness=float(options.get('amount',.02))
                elif action=='weld':
                    modifier=obj.modifiers.new('Fusion weld','WELD');modifier.merge_threshold=float(options.get('distance',.0001))
                elif action=='triangulate':
                    modifier=obj.modifiers.new('Fusion triangulate','TRIANGULATE')
                elif action=='smooth':
                    modifier=obj.modifiers.new('Fusion smooth','SMOOTH');modifier.factor=float(options.get('factor',.5));modifier.iterations=int(options.get('iterations',5))
                elif action in ('twist','bend','taper','stretch'):
                    modifier=obj.modifiers.new('Fusion '+action,'SIMPLE_DEFORM');modifier.deform_method=action.upper();modifier.deform_axis=local_axis
                    if action in ('twist','bend'):modifier.angle=math.radians(float(options.get('angle',45)))*(-1 if options.get('axis')=='Z' else 1)
                    else:modifier.factor=float(options.get('factor',.5))
                elif action=='screw':
                    modifier=obj.modifiers.new('Fusion screw','SCREW');modifier.axis=local_axis;modifier.angle=math.radians(float(options['angle']));modifier.steps=modifier.render_steps=int(options['steps'])
                    modifier.screw_offset=float(options['offset'])*(-1 if options.get('axis')=='Z' else 1);modifier.use_merge_vertices=True;modifier.use_normal_calculate=True
                elif action=='radial_array':
                    count=int(options['count'])
                    if len(obj.data.polygons)*count>1000000:raise ValueError('Radial array exceeds one million output faces. Reduce copies or simplify the input.')
                    radius=float(options['radius'])
                    if radius:obj.data.transform(Matrix.Translation(ui_axis(options.get('axis')=='X' and 'Y' or 'X')*radius))
                    pivot=bpy.data.objects.new('Fusion radial pivot',None);bpy.context.scene.collection.objects.link(pivot)
                    pivot.matrix_world=obj.matrix_world@Matrix.Rotation(2*math.pi/count,4,local_axis)
                    modifier=obj.modifiers.new('Fusion radial array','ARRAY');modifier.count=count;modifier.use_relative_offset=False;modifier.use_object_offset=True;modifier.offset_object=pivot
                    try:checked(bpy.ops.object.modifier_apply(modifier=modifier.name),'Modifier')
                    finally:bpy.data.objects.remove(pivot)
                    continue
                elif action in ('inset','bisect','quads','fill_holes'):
                    edit_bmesh(obj,lambda bm:BMESH_OPERATIONS[action](bm,obj,options));continue
                elif action=='quad_remesh':
                    modifier=obj.modifiers.new('Fusion quad remesh','REMESH');modifier.mode='SHARP';modifier.octree_depth=int(options['depth']);modifier.use_remove_disconnected=False
                elif action=='edge_split':
                    modifier=obj.modifiers.new('Fusion edge split','EDGE_SPLIT');modifier.split_angle=math.radians(float(options['angle']))
                elif action=='displace':
                    texture=bpy.data.textures.new('Fusion noise','CLOUDS');texture.noise_scale=float(options['scale'])
                    modifier=obj.modifiers.new('Fusion displace','DISPLACE');modifier.texture=texture;modifier.texture_coords='LOCAL';modifier.strength=float(options['strength'])
                elif action=='cast':
                    modifier=obj.modifiers.new('Fusion cast','CAST');modifier.cast_type='SPHERE';modifier.factor=float(options['factor'])
                elif action in ('uv','recalculate'):
                    checked(bpy.ops.object.mode_set(mode='EDIT'),'Edit mode');bpy.ops.mesh.select_all(action='SELECT')
                    if action=='uv':checked(bpy.ops.uv.smart_project(angle_limit=math.radians(float(options.get('angle',66))),island_margin=float(options.get('margin',.02))),'UV projection')
                    else:checked(bpy.ops.mesh.normals_make_consistent(inside=False),'Recalculate normals')
                    bpy.ops.object.mode_set(mode='OBJECT');continue
                try:
                    checked(bpy.ops.object.modifier_apply(modifier=modifier.name), 'Modifier')
                except Exception as error:
                    raise ValueError('Stack entry '+str(entry.get('id',action))+' ('+action+'): '+str(error)) from error
        stage['after']=mesh_channels(selected)
        for channel,label in [('uvLayers','UV layers'),('attributes','mesh attributes'),('materials','material slots')]:
            lost=sorted(set(before[channel])-set(stage['after'][channel]))
            if lost:stage['warnings'].append('Lost '+label+': '+', '.join(lost))
        stack_report.append(stage)
    action=original_action;options=original_options
    if action in ('render','blend'):
        studio(meshes,options)
    if action=='render':
        device_report=render_settings(scene,options)
        scene.render.filepath=str(output)
        checked(bpy.ops.render.render(write_still=True),'Render')
    elif action=='blend':
        # Pack dependencies into this new project, leaving the source files alone.
        bpy.ops.file.pack_all()
        checked(bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False),'Save')
    elif action=='obj':
        checked(bpy.ops.wm.obj_export(filepath=str(output),export_materials=True),'OBJ export')
    elif action=='fbx':
        checked(bpy.ops.export_scene.fbx(filepath=str(output),add_leaf_bones=False,path_mode='COPY',embed_textures=True),'FBX export')
    else:
        use_selection=action not in ('glb','convert')
        if use_selection:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in selected:obj.select_set(True)
        checked(bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,use_selection=use_selection,export_extras=True,export_attributes=True,export_current_frame=True,export_rest_position_armature=False),'GLB export')
    report={'blender':bpy.app.version_string,'action':action,'output':str(output),'mesh_count':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes)}
    if action=='stack':report['stack']=stack_report
    if native is not None:report['nativeBlend']=native
    if action=='render':report.update(device_report)
    if dson is not None:report['dson']=dson
    if cloth_movement is not None:report['cloth_max_displacement']=cloth_movement
    if sewing_report is not None:report['sewing']=sewing_report
    (directory/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('FUSION_RESULT '+json.dumps(report),flush=True)


def serve(root,token):
    root=Path(root).resolve()
    def reply(**payload):
        print('FUSION_RPC_'+token+' '+json.dumps({'version':1,**payload}),flush=True)
    reply(type='ready',pid=os.getpid())
    last_id=0
    for line in sys.stdin:
        request={}
        try:
            if len(line)>16384:raise ValueError('Oversized request')
            request=json.loads(line)
            revision=int(request['id'])
            if request.get('version')!=1 or revision<=last_id:raise ValueError('Invalid revision or protocol')
            last_id=revision
            spec=Path(request['spec']).resolve()
            if not spec.is_relative_to(root/'jobs') or spec.name!='job.json':raise ValueError('Job path is outside this session')
            main(spec)
            reply(id=request['id'],ok=True)
        except Exception as error:
            traceback.print_exc()
            reply(id=request.get('id'),ok=False,error=str(error))


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    if args[0]=='--serve':serve(args[1],args[2])
    else:main()


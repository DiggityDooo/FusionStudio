"""Fusion's isolated worker. Runs in the user's installed Blender; never installs code there."""
import json
import math
import os
import shutil
import sys
import traceback
from pathlib import Path
import bpy
import bmesh
sys.path.insert(0, str(Path(__file__).resolve().parent))
from native_scene import capture as capture_native, render_native, settings as render_settings, write_render
from character_materials import apply_character_materials
from surface_materials import apply_surface_materials, shader_bake
from lighting import apply_lighting, apply_world_lighting, lightmap_bake
from cameras import apply_cameras, apply_scene_camera_extras
from mathutils import Matrix, Vector

# Must list every operation in electron/mesh-operations.json (the worker cannot read the packaged archive).
MESH_ACTIONS = {'subdivide','bevel','decimate','solidify','mirror','remesh','recalculate','uv','boolean','array','wireframe','weld','triangulate','smooth','twist','bend','taper','stretch',
    'screw','radial_array','inset','bisect','quad_remesh','quads','fill_holes','edge_split','displace','cast',
    'uv_unwrap','uv_project','uv_pack','uv_average','uv_lightmap','shader_bake','lightmap_bake'}
UV_METHODS = {'Angle based': 'ANGLE_BASED', 'Conformal': 'CONFORMAL', 'Minimum stretch': 'MINIMUM_STRETCH'}


def uv_operation(obj, action, options):
    """UV unwrapping, projection, packing and lightmap layout on the whole mesh in Edit Mode."""
    if action == 'uv_project' and options['type'] == 'Planar':
        edit_bmesh(obj, lambda bm: planar_uv(bm, options['axis']))
        return
    layers = obj.data.uv_layers
    if action == 'uv_lightmap':
        # Mesh UV layers must change in Object Mode; Edit Mode keeps its own copy and overwrites them on exit.
        if not layers: layers.new(name='UVMap')
        layers.active = layers.new(name='Lightmap')
    checked(bpy.ops.object.mode_set(mode='EDIT'), 'Edit mode')
    try:
        bpy.ops.mesh.select_all(action='SELECT')
        if action == 'uv_unwrap':
            method = UV_METHODS[options['method']]
            available = [i.identifier for i in bpy.ops.uv.unwrap.get_rna_type().properties['method'].enum_items]
            if method not in available: raise ValueError(options['method'] + ' unwrapping is not available in this Blender version.')
            if options['seams'] == 'From sharp angles':
                bpy.ops.mesh.select_mode(type='EDGE'); bpy.ops.mesh.select_all(action='DESELECT')
                checked(bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(float(options['angle']))), 'Select sharp edges')
                checked(bpy.ops.mesh.mark_seam(clear=False), 'Mark seams'); bpy.ops.mesh.select_all(action='SELECT')
            checked(bpy.ops.uv.unwrap(method=method, margin=float(options['margin'])), 'Unwrap')
        elif action == 'uv_project':
            if options['type'] == 'Box': checked(bpy.ops.uv.cube_project(cube_size=float(options['size']), scale_to_bounds=False), 'Box projection')
            elif options['type'] == 'Cylinder': checked(bpy.ops.uv.cylinder_project(direction='ALIGN_TO_OBJECT', scale_to_bounds=True), 'Cylinder projection')
            else: checked(bpy.ops.uv.sphere_project(direction='ALIGN_TO_OBJECT', scale_to_bounds=True), 'Sphere projection')
        elif action == 'uv_pack':
            checked(bpy.ops.uv.pack_islands(rotate=options['rotate'] == 'Yes', margin=float(options['margin'])), 'Pack islands')
        elif action == 'uv_average':
            checked(bpy.ops.uv.average_islands_scale(), 'Average island scale')
        elif action == 'uv_lightmap':
            # A second, non-overlapping UV set for baked lighting.
            checked(bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_MARGIN_DIV=float(options['margin'])), 'Lightmap pack')
    finally:
        bpy.ops.object.mode_set(mode='OBJECT')
    if action == 'uv_lightmap': layers.active = layers[0]


def planar_uv(bm, axis):
    """Project along a Fusion axis, keeping aspect and fitting the longer side to 0..1."""
    normal = ui_axis(axis)
    u = Vector((0, 1, 0)) if abs(normal.x) < .5 and abs(normal.z) > .5 else Vector((1, 0, 0))
    if abs(normal.dot(u)) > .5: u = Vector((0, 0, 1))
    v = normal.cross(u)
    layer = bm.loops.layers.uv.verify()
    coords = [(l, l.vert.co.dot(u), l.vert.co.dot(v)) for f in bm.faces for l in f.loops]
    if not coords: return
    lu, lv = min(c[1] for c in coords), min(c[2] for c in coords)
    size = max(max(c[1] for c in coords) - lu, max(c[2] for c in coords) - lv, 1e-9)
    for loop, a, b in coords: loop[layer].uv = ((a - lu) / size, (b - lv) / size)


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
    # STL carries no units; read it as millimetres, matching Fusion's STL export and slicer convention.
    from animation_time import fusion_animation_timing, align_fusion_animation
    from gltf_bump import bump_plan, apply_bump_plan
    timing = fusion_animation_timing(file) if ext in ('.glb', '.gltf') else None
    bumps = bump_plan(file) if ext in ('.glb', '.gltf') else None
    previous_materials = set(bpy.data.materials) if bumps and bumps['materials'] else set()
    previous_actions = set(bpy.data.actions) if timing else set()
    checked(ops[ext](filepath=str(file), **({'global_scale': .001} if ext == '.stl' else {})), 'Import')
    if bumps is not None:
        result = apply_bump_plan(bumps, set(bpy.data.materials) - previous_materials)
        if options is not None:options['bumpTextures'] = result
    if timing:
        actions = set(bpy.data.actions) - previous_actions
        settings = options if options is not None else {}
        settings['animationTiming'] = align_fusion_animation(bpy.context.scene, bpy.data, actions, timing, settings.get('animation', {}).get('fps'))


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
    if options.get('sceneCamera'):
        chosen=[o for o in scene.objects if o.type=='CAMERA' and has_id(o,options['sceneCamera'])]
        if not chosen:raise ValueError('The active scene camera is not in the rendered scene. Make it visible or choose another camera.')
        scene_camera(chosen[0]);scene.camera=chosen[0]
    scene_lights=[o for o in scene.objects if o.type=='LIGHT' and not o.get('fusion_studio_helper')]
    for lamp in scene_lights:scene_light(lamp)
    # Authored scene lights replace the default studio rig.
    for name,offset,power,size in ([] if scene_lights else [
        ('Key',(1,-1.8,2.8),220,2),('Fill',(-2,-.5,1),100,3),('Rim',(0,2,2),300,2)
    ]):
        bpy.ops.object.light_add(type='AREA',location=target+Vector(offset)*radius)
        lamp=bpy.context.object;lamp.name=name
        lamp['fusion_studio_helper']=True
        lamp.data.energy=power*max(radius*radius,.1);lamp.data.shape='DISK';lamp.data.size=size*radius
        lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
    quality=options.get('render') or {}
    floor=quality.get('floor','studio')
    if floor!='none':
        bpy.ops.mesh.primitive_plane_add(size=radius*200,location=(target.x,target.y,low.z-.02*radius))
        plane=bpy.context.object;plane.name='Fusion studio floor'
        plane['fusion_studio_helper']=True
        mat=bpy.data.materials.new('Studio charcoal');mat.diffuse_color=(.055,.06,.07,1);mat.use_nodes=True
        mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.06,.07,1)
        mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
        plane.data.materials.append(mat)
        # A shadow catcher keeps only the shadows the scene casts on it, for compositing over plates.
        plane.is_shadow_catcher=floor=='shadow_catcher'
    world_settings(scene,quality.get('world') or {})
    apply_world_lighting(scene,quality)
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.cycles.samples=max(8,min(256,int(options.get('samples',32))))
    scene.cycles.use_denoising=True
    scene.render.resolution_x=max(128,min(4096,int(options.get('width',1200))));scene.render.resolution_y=max(128,min(4096,int(options.get('height',1000))));scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'


SEQUENCE_STILLS = {'png':('PNG','.png'),'jpeg':('JPEG','.jpg'),'tiff':('TIFF','.tif'),'exr':('OPEN_EXR','.exr')}

def write_animation(scene, output, options, meshes):
    """Render a frame range as an image sequence or video; a turntable orbits the camera once around the scene."""
    animation = options['animation']
    scene.frame_start, scene.frame_end = int(animation['start']), int(animation['end'])
    if animation['mode'] == 'turntable':
        low, high = bounds(meshes)
        pivot = bpy.data.objects.new('Fusion turntable pivot', None)
        scene.collection.objects.link(pivot)
        pivot.location = (low + high) / 2
        camera = scene.camera
        world = camera.matrix_world.copy()
        camera.parent = pivot
        camera.matrix_world = world
        # One full turn over the range; the end key sits one frame past the last so the loop does not repeat a frame.
        for frame, angle in ((scene.frame_start, 0.0), (scene.frame_end + 1, 2 * math.pi)):
            pivot.rotation_euler = (0, 0, angle)
            pivot.keyframe_insert('rotation_euler', index=2, frame=frame)
        for curve in action_fcurves(pivot):
            for key in curve.keyframe_points: key.interpolation = 'LINEAR'
    settings_ = scene.render.image_settings
    fmt = animation['output']
    video = fmt in ('mp4', 'prores')
    if video:
        if 'media_type' in settings_.bl_rna.properties: settings_.media_type = 'VIDEO'
        settings_.file_format = 'FFMPEG'
        codecs = {i.identifier for i in scene.render.ffmpeg.bl_rna.properties['codec'].enum_items}
        formats = {i.identifier for i in scene.render.ffmpeg.bl_rna.properties['format'].enum_items}
        if fmt == 'prores':
            if 'PRORES' not in codecs: raise ValueError('ProRes encoding is not available in this Blender build.')
            scene.render.ffmpeg.format = 'QUICKTIME' if 'QUICKTIME' in formats else next(iter(formats))
            scene.render.ffmpeg.codec = 'PRORES'
        else:
            scene.render.ffmpeg.format = 'MPEG4' if 'MPEG4' in formats else next(iter(formats))
            scene.render.ffmpeg.codec = 'H264' if 'H264' in codecs else next(iter(codecs))
            if hasattr(scene.render.ffmpeg, 'constant_rate_factor'): scene.render.ffmpeg.constant_rate_factor = 'HIGH'
        scene.render.filepath = str(Path(output).with_suffix(''))
    else:
        still = SEQUENCE_STILLS[fmt]
        if 'media_type' in settings_.bl_rna.properties: settings_.media_type = 'IMAGE'
        settings_.file_format = still[0]
        if fmt == 'exr':
            settings_.color_depth = '16'
            if hasattr(settings_, 'exr_codec'): settings_.exr_codec = 'ZIP'
        scene.render.filepath = str(Path(output).with_suffix('')) + '_'
    checked(bpy.ops.render.render(animation=True), 'Animation render')
    folder, stem = Path(output).parent, Path(output).stem
    if video:
        # Blender appends the frame range to video names; deliver the file at the requested output path.
        produced = [p for p in folder.glob(stem + '*.*') if p != Path(output) and p.suffix.lower() in ('.mp4', '.mov', '.mkv')]
        if not produced: raise RuntimeError('The video encoder produced no file.')
        produced[0].replace(output)
        return {'video': str(output), 'frames': scene.frame_end - scene.frame_start + 1, 'fps': scene.render.fps, 'mode': animation['mode'], 'format': fmt}
    suffix = SEQUENCE_STILLS[fmt][1]
    frames = sorted(str(p) for p in folder.glob(stem + '_*' + suffix))
    if not frames: frames = sorted(str(p) for p in folder.glob(stem + '_*.*') if p.suffix.lower() in (suffix, '.jpeg', '.tiff', '.exr', '.png'))
    if not frames: raise RuntimeError('The animation render produced no frames.')
    shutil.copyfile(frames[0], output)
    return {'frames': frames, 'fps': scene.render.fps, 'mode': animation['mode'], 'format': fmt}


def action_fcurves(obj):
    """F-curves of an object's action across Blender's legacy and layered (5.x) action APIs."""
    action = obj.animation_data.action
    if hasattr(action, 'fcurves') and len(action.fcurves): return list(action.fcurves)
    return [c for layer in getattr(action, 'layers', []) for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]


def world_settings(scene, world):
    """World background: a flat colour, or an equirectangular HDRI rotated about the up axis."""
    scene.world.use_nodes = True
    nodes, links = scene.world.node_tree.nodes, scene.world.node_tree.links
    background = next(n for n in nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (*world.get('color', (.18, .2, .24)), 1)
    background.inputs['Strength'].default_value = float(world.get('strength', .35))
    if world.get('hdri'):
        texture = nodes.new('ShaderNodeTexEnvironment')
        texture.image = bpy.data.images.load(world['hdri'], check_existing=True)
        mapping = nodes.new('ShaderNodeMapping')
        coordinates = nodes.new('ShaderNodeTexCoord')
        mapping.inputs['Rotation'].default_value[2] = math.radians(float(world.get('rotation', 0)))
        links.new(coordinates.outputs['Generated'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        links.new(texture.outputs['Color'], background.inputs['Color'])


def scene_light(lamp):
    """Apply Fusion light extras: viewport-matched power, soft-shadow radius and true area lights (exported as glTF spots)."""
    kind = lamp.get('fusion_light')
    if lamp.get('fusion_soft') is not None and hasattr(lamp.data, 'shadow_soft_size'):
        lamp.data.shadow_soft_size = max(0.0, float(lamp['fusion_soft']))
    area = kind in ('area', 'disk', 'tube')
    if area or lamp.get('fusion_portal'):
        lamp.data.type = 'AREA'
        shape = lamp.get('fusion_area_shape') or ('DISK' if kind == 'disk' else 'RECTANGLE' if kind == 'tube' else 'SQUARE')
        allowed = {i.identifier for i in lamp.data.bl_rna.properties['shape'].enum_items}
        if shape in allowed:
            lamp.data.shape = shape
        lamp.data.size = max(.01, float(lamp.get('fusion_area', 1)))
        if hasattr(lamp.data, 'size_y') and lamp.get('fusion_area_y') is not None:
            lamp.data.size_y = max(.01, float(lamp['fusion_area_y']))
        if lamp.get('fusion_portal') and hasattr(lamp.data, 'cycles'):
            try: lamp.data.cycles.is_portal = True
            except Exception: pass
    elif kind == 'sphere':
        lamp.data.type = 'POINT'
    # The viewport treats intensity as display-referred candela/lux; Cycles' photometric import would be ~683x darker.
    if kind and lamp.get('fusion_intensity') is not None:
        intensity = max(0.0, float(lamp['fusion_intensity']))
        lamp.data.energy = intensity if kind == 'sun' else intensity * (math.pi if area else 4 * math.pi)
    if lamp.get('fusion_light') == 'sun' and lamp.get('fusion_soft') is not None:
        lamp.data.angle = min(math.pi, float(lamp['fusion_soft']))
    group = str(lamp.get('fusion_group') or '').strip()[:64]
    if group:
        try: lamp.lightgroup = group
        except Exception: pass


def scene_camera(camera):
    """Use the authored vertical field of view and depth of field from Fusion camera extras."""
    if camera.get('fusion_vfov') is not None:
        camera.data.sensor_fit = 'VERTICAL'
        camera.data.sensor_height = 24
        camera.data.lens = 24 / (2 * math.tan(math.radians(float(camera['fusion_vfov'])) / 2))
    camera.data.dof.use_dof = bool(camera.get('fusion_dof', False))
    if camera.data.dof.use_dof:
        camera.data.dof.aperture_fstop = max(.5, float(camera.get('fusion_fstop', 2.8)))
        camera.data.dof.focus_distance = max(.01, float(camera.get('fusion_focus', 5)))
    apply_scene_camera_extras(camera)


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
    # glTF keyframe times become frames at the scene rate, so set it before importing animated scenes.
    if options.get('animation'):bpy.context.scene.render.fps=int(options['animation']['fps'])
    if spec['action']=='convert' and Path(spec['input']).suffix.lower()=='.blend' and options.get('blendMode','preserved')=='preserved':
        native=capture_native(Path(spec['input']),directory,spec.get('scale',1))
        dson=None
    else:dson=import_model(Path(spec['input']),options)
    scene=bpy.context.scene
    character_material_report=apply_character_materials(options.get('characterMaterials'))
    surface_material_report=apply_surface_materials(options.get('surfaceMaterials'))
    lighting_report={'applied':0,'meshes':0,'version':1}
    cameras_report={'applied':0,'compositor':False,'motionBlur':False,'version':1}
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
                elif action=='shader_bake':
                    shader_bake(obj,options);continue
                elif action=='lightmap_bake':
                    lightmap_bake(obj,options);continue
                elif action.startswith('uv_'):
                    uv_operation(obj,action,options);continue
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
        lighting_report=apply_lighting(options)
    elif original_options.get('lighting'):
        for lamp in [o for o in scene.objects if o.type=='LIGHT']:
            scene_light(lamp)
        lighting_report=apply_lighting(options)
    if action=='render':
        device_report=render_settings(scene,options)
        cameras_report=apply_cameras(options)
        device_report.update(write_animation(scene,output,options,meshes) if options.get('animation') else write_render(scene,output,options))
    elif action=='blend':
        cameras_report=apply_cameras(options)
        # Pack dependencies into this new project, leaving the source files alone.
        bpy.ops.file.pack_all()
        checked(bpy.ops.wm.save_as_mainfile(filepath=str(output),check_existing=False),'Save')
    elif action=='obj':
        checked(bpy.ops.wm.obj_export(filepath=str(output),export_materials=True),'OBJ export')
    elif action=='fbx':
        checked(bpy.ops.export_scene.fbx(filepath=str(output),add_leaf_bones=False,path_mode='COPY',embed_textures=True),'FBX export')
    elif action=='stl':
        # Slicers read STL units as millimetres.
        checked(bpy.ops.wm.stl_export(filepath=str(output),ascii_format=False,global_scale=1000,apply_modifiers=True),'STL export')
    elif action=='ply':
        checked(bpy.ops.wm.ply_export(filepath=str(output),ascii_format=False,apply_modifiers=True),'PLY export')
    elif action in ('usd','usdz'):
        checked(bpy.ops.wm.usd_export(filepath=str(output),export_materials=True,export_animation=False),'USD export')
    elif action=='abc':
        frame=bpy.context.scene.frame_current
        checked(bpy.ops.wm.alembic_export(filepath=str(output),start=frame,end=frame,as_background_job=False),'Alembic export')
    else:
        use_selection=action not in ('glb','convert')
        if use_selection:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in selected:obj.select_set(True)
        checked(bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,use_selection=use_selection,export_extras=True,export_attributes=True,export_current_frame=True,export_rest_position_armature=False),'GLB export')
    if original_options.get('cameras') and action not in ('render','blend'):
        cameras_report=apply_cameras(options)
    report={'blender':bpy.app.version_string,'action':action,'output':str(output),'mesh_count':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes)}
    if options.get('animationTiming'): report['animationTiming'] = options['animationTiming']
    if original_options.get('characterMaterials'):report['characterMaterials']=character_material_report
    if options.get('bumpTextures'):report['bumpTextures']=options['bumpTextures']
    if original_options.get('surfaceMaterials'):report['surfaceMaterials']=surface_material_report
    if original_options.get('lighting'):report['lighting']=lighting_report
    if original_options.get('cameras'):report['cameras']=cameras_report
    if action=='stack':report['stack']=stack_report
    if native is not None:report['nativeBlend']=native
    if action=='render':
        report.update(device_report)
        report['lights']=[{'name':o.name,'type':o.data.type,'energy':o.data.energy,'size':getattr(o.data,'size',None),'studio':bool(o.get('fusion_studio_helper'))} for o in bpy.context.scene.objects if o.type=='LIGHT']
        world_nodes=bpy.context.scene.world.node_tree.nodes
        report['world']={'hdri':next((n.image.filepath for n in world_nodes if n.type=='TEX_ENVIRONMENT' and n.image),None),'strength':next(n.inputs['Strength'].default_value for n in world_nodes if n.type=='BACKGROUND')}
        report['shadow_catchers']=[o.name for o in bpy.context.scene.objects if o.type=='MESH' and o.is_shadow_catcher]
        cam=bpy.context.scene.camera
        if cam:report['camera']={'name':cam.name,'lens':cam.data.lens,'sensorFit':cam.data.sensor_fit,'dof':cam.data.dof.use_dof,'fstop':cam.data.dof.aperture_fstop,'focus':cam.data.dof.focus_distance,'blades':cam.data.dof.aperture_blades,'type':cam.data.type,'shiftX':cam.data.shift_x,'shiftY':cam.data.shift_y,'pano':getattr(cam.data,'panorama_type',None) if cam.data.type=='PANO' else None,'motionBlur':scene.render.use_motion_blur,'shutter':scene.render.motion_blur_shutter,'exposure':scene.view_settings.exposure}
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


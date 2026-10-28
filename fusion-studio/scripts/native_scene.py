"""Preserved Blender scenes and explicit render devices. All writes are job-local."""
import bpy, hashlib, math, struct, time

def _uv_digest(mesh):
    if not mesh.uv_layers: return None
    digest=hashlib.sha256()
    for loop_uv in mesh.uv_layers[0].data:
        digest.update(struct.pack('<2f',round(loop_uv.uv.x,6),round(loop_uv.uv.y,6)))
    return digest.hexdigest()

def _material_color(material):
    if not material.use_nodes or not material.node_tree: return None
    principled=material.node_tree.nodes.get('Principled BSDF')
    if not principled: return None
    return [round(v,6) for v in principled.inputs['Base Color'].default_value]

def _points_digest(points):
    digest=hashlib.sha256()
    for point in points:
        digest.update(struct.pack('<3f',round(point.co.x,6),round(point.co.y,6),round(point.co.z,6)))
    return digest.hexdigest()
from pathlib import Path
from mathutils import Matrix, Vector

def load_scene(file):
    with bpy.data.libraries.load(str(file), link=False) as (src, dst):
        dst.scenes = src.scenes
    scenes = [s for s in dst.scenes if s]
    if not scenes: raise ValueError('The Blender file contains no scene.')
    scene = next((s for s in scenes if s.camera), scenes[0])
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    return scene

def scene_inventory(scene):
    """Ordered source-cage identity: collections, objects, parents and data-blocks.
    Used to prove a preserved scene reopens as the same hierarchy, not a rebuild."""
    collections=[]
    def walk(collection):
        collections.append({'name':collection.name,'objects':[o.name for o in collection.objects],'children':[c.name for c in collection.children]})
        for child in collection.children: walk(child)
    walk(scene.collection)
    objects=[{'name':o.name,'type':o.type,'parent':o.parent.name if o.parent else None,
              'collection':o.users_collection[0].name if o.users_collection else None,
              'location':[round(v,6) for v in o.location],
              'materials':[s.material.name if s.material else None for s in o.material_slots] if hasattr(o,'material_slots') else []}
             for o in scene.objects]
    mesh_details={}
    for mesh in bpy.data.meshes:
        keys=mesh.shape_keys.key_blocks if mesh.shape_keys else []
        mesh_details[mesh.name]={'uv_layers':[uv.name for uv in mesh.uv_layers],
                                 'shape_keys':[k.name for k in keys],
                                 'vertices':len(mesh.vertices),
                                 'basis_digest':_points_digest(mesh.vertices),
                                 'shape_key_digests':{k.name:_points_digest(k.data) for k in keys if k.name!='Basis'},
                                 'uv_digest':_uv_digest(mesh),
                                 'attributes':sorted(a.name for a in mesh.attributes if not a.name.startswith('.'))}
    for entry in objects:
        obj=scene.objects[entry['name']]
        entry['vertex_groups']=[g.name for g in obj.vertex_groups] if hasattr(obj,'vertex_groups') else []
    return {'scene':scene.name,'collections':collections,'objects':objects,'mesh_details':mesh_details,
            'materials':[{'name':m.name,'base_color':_material_color(m)} for m in bpy.data.materials],
            'meshes':[m.name for m in bpy.data.meshes],
            'cameras':[{'name':c.name,'lens':round(c.lens,6),'angle':round(c.angle,6)} for c in bpy.data.cameras],
            'lights':[l.name for l in bpy.data.lights],
            'armatures':[{'name':a.name,'bones':[{'name':b.name,'head':[round(v,6) for v in b.head_local],'tail':[round(v,6) for v in b.tail_local]} for b in a.bones]} for a in bpy.data.armatures],
            'actions':[a.name for a in bpy.data.actions],
            'images':[i.name for i in bpy.data.images]}

def configure_device(scene, backend):
    if backend == 'CPU':
        scene.cycles.device = 'CPU'
        return {'backend':'CPU','devices':[]}
    if backend not in ('CUDA','OPTIX','HIP'): raise ValueError('Unsupported render device.')
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = backend
    prefs.get_devices()
    devices = [d for d in prefs.devices if d.type == backend]
    if not devices: raise ValueError(backend + ' device unavailable. Choose CPU in Render settings.')
    for device in prefs.devices: device.use = device.type == backend
    scene.cycles.device = 'GPU'
    return {'backend':backend,'devices':[{'name':d.name,'type':d.type} for d in devices]}

def apply_engine(scene, requested='CYCLES'):
    """Select Cycles or EEVEE. Prefer direct assignment (enum_items under factory-startup can omit Cycles)."""
    try:
        import addon_utils
        addon_utils.enable('cycles', default_set=True)
    except Exception:
        pass
    aliases = {
        'CYCLES': ['CYCLES'],
        'EEVEE': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'EEVEE'],
    }
    errors = []
    for ident in aliases.get(requested, ['CYCLES']):
        try:
            scene.render.engine = ident
            if requested == 'CYCLES' and 'CYCLES' not in scene.render.engine.upper(): continue
            if requested == 'EEVEE' and 'EEVEE' not in scene.render.engine.upper(): continue
            return scene.render.engine
        except TypeError as error:
            errors.append(str(error)); continue
    items = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    raise ValueError(requested + ' render engine is unavailable. ' + ('; '.join(errors) or 'Available: ' + ', '.join(items)))

def apply_view_transform(scene, name):
    items = [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items]
    if name == 'ACES':
        match = next((i for i in items if 'aces' in i.lower()), None)
        if not match: raise ValueError('ACES view transform is not in this OCIO config.')
        scene.view_settings.view_transform = match
        return match
    scene.view_settings.view_transform = name
    return name

def apply_region(scene, region):
    if not region: return False
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    x, y, w, h = float(region['x']), float(region['y']), float(region['w']), float(region['h'])
    scene.render.border_min_x = max(0.0, min(1.0, x))
    scene.render.border_min_y = max(0.0, min(1.0, y))
    scene.render.border_max_x = max(scene.render.border_min_x + 0.01, min(1.0, x + w))
    scene.render.border_max_y = max(scene.render.border_min_y + 0.01, min(1.0, y + h))
    return True

def apply_tiles(scene, tile):
    if not tile or not hasattr(scene.cycles, 'tile_size'): return None
    if hasattr(scene.cycles, 'use_auto_tile'): scene.cycles.use_auto_tile = True
    scene.cycles.tile_size = max(8, min(4096, int(tile)))
    return scene.cycles.tile_size

def apply_holdouts(scene):
    names = []
    for obj in scene.objects:
        if obj.type != 'MESH': continue
        if obj.get('fusion_holdout'):
            obj.is_holdout = True
            names.append(obj.name)
    return names

def apply_light_groups(scene, enable=False):
    layer = scene.view_layers[0]
    groups = []
    for obj in scene.objects:
        if obj.type != 'LIGHT': continue
        name = str(obj.get('fusion_group') or '').strip()[:64]
        if not name: continue
        try: obj.lightgroup = name
        except Exception: pass
        groups.append(name)
    unique = sorted(set(groups))
    if unique and hasattr(layer, 'lightgroups'):
        existing = {lg.name for lg in layer.lightgroups}
        for name in unique:
            if name in existing: continue
            try: layer.lightgroups.add(name=name)
            except Exception:
                try: bpy.ops.scene.view_layer_add_lightgroup(name=name)
                except Exception: pass
    if enable:
        for target, prop in ((layer, 'use_pass_lightgroup'), (getattr(layer, 'cycles', None), 'use_pass_lightgroup')):
            if target is not None and hasattr(target, prop): setattr(target, prop, True)
    return unique

def apply_npr(scene, enabled):
    scene.render.use_freestyle = bool(enabled)
    layer = scene.view_layers[0]
    if hasattr(layer, 'use_freestyle'): layer.use_freestyle = bool(enabled)
    return bool(enabled)

def apply_eevee_samples(scene, options):
    samples = max(1, min(4096, int(options.get('samples', 32))))
    eevee = getattr(scene, 'eevee', None)
    if not eevee: return samples
    for attr in ('taa_render_samples', 'taa_samples'):
        if hasattr(eevee, attr): setattr(eevee, attr, samples); break
    return samples

# Render pass id -> (owner, property). Owner 'layer' is the view layer, 'cycles' its Cycles settings.
PASSES = {
    'z': [('layer', 'use_pass_z')], 'normal': [('layer', 'use_pass_normal')], 'position': [('layer', 'use_pass_position')],
    'ao': [('layer', 'use_pass_ambient_occlusion')], 'mist': [('layer', 'use_pass_mist')], 'uv': [('layer', 'use_pass_uv')],
    'diffuse': [('layer', 'use_pass_diffuse_direct'), ('layer', 'use_pass_diffuse_indirect'), ('layer', 'use_pass_diffuse_color')],
    'glossy': [('layer', 'use_pass_glossy_direct'), ('layer', 'use_pass_glossy_indirect'), ('layer', 'use_pass_glossy_color')],
    'emission': [('layer', 'use_pass_emit')], 'vector': [('layer', 'use_pass_vector')],
    'object_index': [('layer', 'use_pass_object_index')], 'material_index': [('layer', 'use_pass_material_index')],
    'crypto_object': [('layer', 'use_pass_cryptomatte_object')], 'crypto_material': [('layer', 'use_pass_cryptomatte_material')],
    'shadow_catcher': [('cycles', 'use_pass_shadow_catcher')],
    'shadow': [('layer', 'use_pass_shadow')],
}


def settings(scene, options):
    quality = options.get('render') or {}
    engine = apply_engine(scene, quality.get('engine') or 'CYCLES')
    cycles = 'CYCLES' in scene.render.engine.upper()
    device = configure_device(scene, options.get('device','CPU')) if cycles else {'backend':engine,'devices':[]}
    if cycles:
        scene.cycles.samples = max(1,min(4096,int(options.get('samples',32))))
        scene.cycles.use_denoising = quality.get('denoise', True)
        denoiser = quality.get('denoiser')
        prop = scene.cycles.bl_rna.properties.get('denoiser')
        if denoiser and prop:
            mapped = 'OPENIMAGEDENOISE' if denoiser == 'OIDN' else 'OPTIX'
            allowed = {i.identifier for i in prop.enum_items}
            if mapped in allowed: scene.cycles.denoiser = mapped
        scene.cycles.use_adaptive_sampling = float(quality.get('adaptive', 0)) > 0
        if scene.cycles.use_adaptive_sampling: scene.cycles.adaptive_threshold = float(quality['adaptive'])
        scene.cycles.time_limit = float(quality.get('timeLimit', 0))
        if quality.get('caustics'):
            scene.cycles.caustics_reflective = True
            scene.cycles.caustics_refractive = True
        if (quality.get('contactShadows') or quality.get('lightCache')) and hasattr(scene.cycles, 'use_fast_gi'):
            scene.cycles.use_fast_gi = True
        if quality.get('lightCache') and hasattr(scene.render, 'use_persistent_data'):
            scene.render.use_persistent_data = True
        if quality.get('outOfCore') and hasattr(scene.cycles, 'use_auto_tile'):
            scene.cycles.use_auto_tile = True
    else:
        apply_eevee_samples(scene, options)
    scene.render.film_transparent = bool(quality.get('transparent', False))
    view_transform = apply_view_transform(scene, quality['viewTransform']) if quality.get('viewTransform') else scene.view_settings.view_transform
    if quality.get('exposure') is not None: scene.view_settings.exposure = float(quality['exposure'])
    iso = quality.get('iso')
    if iso and not (options or {}).get('cameras'):
        scene.view_settings.exposure += math.log2(max(50.0, float(iso)) / 100.0)
    if quality.get('motionBlur'):
        scene.render.use_motion_blur = True
        scene.render.motion_blur_shutter = max(.01, min(1.0, float(quality.get('shutter', 180)) / 360.0))
    kelvin = quality.get('whiteBalance')
    if kelvin is not None:
        for attr in ('white_balance_temperature', 'temperature'):
            if hasattr(scene.view_settings, attr):
                setattr(scene.view_settings, attr, max(1000.0, min(12000.0, float(kelvin))))
                break
    layer = scene.view_layers[0]
    passes = list(quality.get('passes', []))
    for name in passes:
        if name in ('light_groups', 'wireframe'): continue
        for owner, prop in PASSES[name]:
            target = layer.cycles if owner == 'cycles' else layer
            if hasattr(target, prop): setattr(target, prop, True)
    groups = apply_light_groups(scene, 'light_groups' in passes)
    npr = apply_npr(scene, quality.get('npr') or 'wireframe' in passes)
    holdouts = apply_holdouts(scene)
    border = apply_region(scene, quality.get('region'))
    tile = apply_tiles(scene, quality.get('tileSize') or (64 if quality.get('outOfCore') else 0))
    scene.render.resolution_x = max(128,min(4096,int(options.get('width',1200))))
    scene.render.resolution_y = max(128,min(4096,int(options.get('height',1000))))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if scene.render.film_transparent else 'RGB'
    # Compositor file-output nodes must never write to paths stored in an imported file.
    muted = 0
    tree=getattr(scene,'compositing_node_group',None) or getattr(scene,'node_tree',None)
    if tree:
        for node in tree.nodes:
            if node.bl_idname == 'CompositorNodeOutputFile': node.mute=True;muted+=1
    samples = scene.cycles.samples if cycles else apply_eevee_samples(scene, options)
    return {**device,'muted_file_outputs':muted,'samples':samples,'denoise':getattr(scene.cycles,'use_denoising',False) if cycles else False,'adaptive':getattr(scene.cycles,'use_adaptive_sampling',False) if cycles else False,'transparent':scene.render.film_transparent,'passes':passes,'view_transform':view_transform,'exposure':scene.view_settings.exposure,'engine':engine,'holdouts':holdouts,'border':border,'tileSize':tile,'npr':npr,'lightGroups':groups,'denoiser':getattr(scene.cycles,'denoiser',None) if cycles else None}

def write_render(scene, output, options):
    """Render the still PNG and, when requested, a multilayer EXR with every enabled pass beside it."""
    scene.render.filepath = str(output)
    result = bpy.ops.render.render(write_still=True)
    if 'FINISHED' not in result: raise RuntimeError('Render did not finish: ' + str(result))
    report = {}
    exr = (options.get('render') or {}).get('exr')
    if exr:
        settings_ = scene.render.image_settings
        # Blender 5 selects multilayer output with media_type; earlier versions had a separate file format.
        multilayer = 'media_type' in settings_.bl_rna.properties
        if multilayer: settings_.media_type = 'MULTI_LAYER_IMAGE'
        settings_.file_format = 'OPEN_EXR_MULTILAYER'
        settings_.color_depth = exr; settings_.exr_codec = 'ZIP'
        path = Path(output).with_suffix('.exr')
        bpy.data.images['Render Result'].save_render(filepath=str(path), scene=scene)
        if multilayer: settings_.media_type = 'IMAGE'
        settings_.file_format = 'PNG'
        report['exr'] = str(path)
    return report


def capture(file, directory, scale):
    scene = load_scene(file)
    # Preserve native shaders and dependencies before making evaluated viewport proxies.
    for index,obj in enumerate(scene.objects): obj['fusion_native_object'] = 'native_'+str(index)
    snapshot = Path(directory)/'native-scene.blend'
    bpy.ops.file.pack_all()
    bpy.data.libraries.write(str(snapshot), {scene}, fake_user=True, compress=True)
    camera = None
    if scene.camera:
        p=scene.camera.matrix_world.translation
        t=p+scene.camera.matrix_world.to_quaternion()@Vector((0,0,-1))
        camera={'position':[p.x*scale,p.z*scale,-p.y*scale],'target':[t.x*scale,t.z*scale,-t.y*scale],'fov':math.degrees(scene.camera.data.angle_y)}
    warnings=[]
    for obj in scene.objects:
        if obj.instance_type!='NONE':
            warnings.append(f"Prototype instance '{obj.name}' ({obj.instance_type}) is expanded only by the preserved Blender render. The Fusion viewport lists source objects once; prototype transforms are render-only here, not editable rigs.")
        if obj.library:
            warnings.append(f"Linked object '{obj.name}' is preserved from library '{obj.library.filepath}'. It is not converted; edit the source library in Blender.")
    original={'scene':scene.name,'frame':scene.frame_current,'camera':camera,'snapshot':str(snapshot),'scale':scale,'objects':len(scene.objects),'view_transform':scene.view_settings.view_transform,'warnings':warnings[:20]}
    depsgraph=bpy.context.evaluated_depsgraph_get()
    proxies=[]
    for obj in list(scene.objects):
        if obj.type not in ('MESH','CURVE','SURFACE','FONT','META') or obj.hide_render: continue
        evaluated=obj.evaluated_get(depsgraph)
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
        if not mesh or not mesh.vertices: continue
        proxy=bpy.data.objects.new(obj.name+'_Fusion',mesh)
        proxy['fusion_native_object']=obj['fusion_native_object']
        proxy.matrix_world=obj.matrix_world.copy()
        proxy.matrix_world.translation*=scale
        proxy.scale*=scale
        proxies.append(proxy)
    viewport=bpy.data.scenes.new('Fusion evaluated viewport')
    for proxy in proxies: viewport.collection.objects.link(proxy)
    bpy.context.window.scene=viewport
    bpy.context.view_layer.update()
    return original

def render_native(snapshot, ordinary_input, output, options, import_model):
    scene=load_scene(snapshot)
    transform=options['nativeScene']['matrix']
    # Three matrices are column-major, Y-up. Blender uses Z-up.
    m=Matrix(tuple(tuple(transform[c*4+r] for c in range(4)) for r in range(4)))
    basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    m=basis@m@basis.inverted()
    scene.view_layers[0].update()
    transform_error=0.0;frozen_constraints=0
    if any(abs(m[r][c]-(1 if r==c else 0))>1e-8 for r in range(4) for c in range(4)):
        # A transformed static scene freezes evaluated object constraints at this frame.
        # Preserve every evaluated world matrix before changing parents' channels.
        world=[(obj,obj.matrix_world.copy()) for obj in scene.objects]
        for obj,_ in world:
            for constraint in obj.constraints:constraint.mute=True;frozen_constraints+=1
            if obj.animation_data:obj.animation_data_clear()
        def depth(obj):
            value=0
            while obj.parent:value+=1;obj=obj.parent
            return value
        for obj,matrix in sorted(world,key=lambda item:depth(item[0])):
            obj.matrix_world=m@matrix
            scene.view_layers[0].update()
        transform_error=max((max(abs(obj.matrix_world[r][c]-(m@matrix)[r][c]) for r in range(4) for c in range(4)) for obj,matrix in world),default=0)
        if transform_error>1e-4:raise ValueError('This native object hierarchy cannot be transformed reliably. Undo the scene transform or use a converted copy.')
    # Additional Fusion geometry is imported into the preserved scene, so edits are rendered.
    if ordinary_input:
        import_model(Path(ordinary_input))
        if options.get('characterMaterials'):
            from character_materials import apply_character_materials
            apply_character_materials(options['characterMaterials'])
        if options.get('surfaceMaterials'):
            from surface_materials import apply_surface_materials
            apply_surface_materials(options['surfaceMaterials'])
        if options.get('lighting'):
            from lighting import apply_lighting, apply_world_lighting
            apply_lighting(options)
            apply_world_lighting(scene, options.get('render') or {})
    if options.get('cameraMode','source')=='viewport':
        setting=options['camera']
        bpy.ops.object.camera_add(location=(setting['position'][0],-setting['position'][2],setting['position'][1]))
        camera=bpy.context.object
        look=Vector((setting['target'][0],-setting['target'][2],setting['target'][1]))
        camera.rotation_euler=(look-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24
        camera.data.lens=24/(2*math.tan(math.radians(float(setting.get('fov',38)))/2))
        if setting.get('orthoHeight'):
            camera.data.type='ORTHO';camera.data.ortho_scale=max(.001,float(setting['orthoHeight']))
        scene.camera=camera
    if not scene.camera: raise ValueError('This preserved scene has no camera. Choose viewport camera.')
    report=settings(scene,options)
    if options.get('cameras'):
        from cameras import apply_cameras
        report['cameras']=apply_cameras(options)
    start=time.perf_counter()
    report.update(write_render(scene,output,options))
    return {**report,'native_scene':scene.name,'transform_max_error':transform_error,'frozen_constraints':frozen_constraints,'render_seconds':time.perf_counter()-start,'camera_mode':options.get('cameraMode','source'),'additional_meshes':sum(o.type=='MESH' and 'fusion_native_object' not in o for o in scene.objects)}

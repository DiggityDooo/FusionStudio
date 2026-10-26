"""Preserved Blender scenes and explicit render devices. All writes are job-local."""
import bpy, math, time
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

def configure_device(scene, backend):
    if backend == 'CPU':
        scene.cycles.device = 'CPU'
        return {'backend':'CPU','devices':[]}
    if backend not in ('CUDA','OPTIX'): raise ValueError('Unsupported render device.')
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = backend
    prefs.get_devices()
    devices = [d for d in prefs.devices if d.type == backend]
    if not devices: raise ValueError(backend + ' device unavailable. Choose CPU in Render settings.')
    for device in prefs.devices: device.use = device.type == backend
    scene.cycles.device = 'GPU'
    return {'backend':backend,'devices':[{'name':d.name,'type':d.type} for d in devices]}

def settings(scene, options):
    scene.render.engine = 'CYCLES'
    device = configure_device(scene, options.get('device','CPU'))
    scene.cycles.samples = max(8,min(256,int(options.get('samples',32))))
    scene.cycles.use_denoising = True
    scene.render.resolution_x = max(128,min(4096,int(options.get('width',1200))))
    scene.render.resolution_y = max(128,min(4096,int(options.get('height',1000))))
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    # Compositor file-output nodes must never write to paths stored in an imported file.
    muted = 0
    tree=getattr(scene,'compositing_node_group',None) or getattr(scene,'node_tree',None)
    if tree:
        for node in tree.nodes:
            if node.bl_idname == 'CompositorNodeOutputFile': node.mute=True;muted+=1
    return {**device,'muted_file_outputs':muted}

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
    original={'scene':scene.name,'frame':scene.frame_current,'camera':camera,'snapshot':str(snapshot),'scale':scale,'objects':len(scene.objects),'view_transform':scene.view_settings.view_transform}
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
    if options.get('cameraMode','source')=='viewport':
        setting=options['camera']
        bpy.ops.object.camera_add(location=(setting['position'][0],-setting['position'][2],setting['position'][1]))
        camera=bpy.context.object
        look=Vector((setting['target'][0],-setting['target'][2],setting['target'][1]))
        camera.rotation_euler=(look-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24
        camera.data.lens=24/(2*math.tan(math.radians(float(setting.get('fov',38)))/2))
        scene.camera=camera
    if not scene.camera: raise ValueError('This preserved scene has no camera. Choose viewport camera.')
    report=settings(scene,options)
    scene.render.filepath=str(output)
    start=time.perf_counter()
    bpy.ops.render.render(write_still=True)
    return {**report,'native_scene':scene.name,'transform_max_error':transform_error,'frozen_constraints':frozen_constraints,'render_seconds':time.perf_counter()-start,'camera_mode':options.get('cameraMode','source'),'additional_meshes':sum(o.type=='MESH' and 'fusion_native_object' not in o for o in scene.objects)}

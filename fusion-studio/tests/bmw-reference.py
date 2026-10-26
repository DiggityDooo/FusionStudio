"""Read-only reference renders for user-supplied BMW .blend fixtures."""
import bpy, json, sys, time, math
from pathlib import Path
from mathutils import Vector
spec=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
with bpy.data.libraries.load(spec['source'],link=False) as (src,dst):
    dst.scenes=src.scenes
scene=next(s for s in dst.scenes if s.camera)
bpy.context.window.scene=scene
scene.view_layers[0].update()
original={'engine':scene.render.engine,'device':scene.cycles.device,'samples':scene.cycles.samples,'width':scene.render.resolution_x,'height':scene.render.resolution_y,'percentage':scene.render.resolution_percentage,'camera':scene.camera.name,'world':scene.world.name if scene.world else None,'view_transform':scene.view_settings.view_transform,'objects':len(scene.objects)}
camera=scene.camera;position=camera.matrix_world.translation;target=position+camera.matrix_world.to_quaternion()@Vector((0,0,-1))
to_fusion=lambda p:[p.x,p.z,-p.y]
settings={'position':to_fusion(position),'target':to_fusion(target),'fov':math.degrees(camera.data.angle_y)}
devices=[];backend='CPU'
prefs=bpy.context.preferences.addons['cycles'].preferences
if spec['device']=='GPU':
    for candidate in ['OPTIX','CUDA']:
        try:
            prefs.compute_device_type=candidate;prefs.get_devices()
            matching=[d for d in prefs.devices if d.type==candidate]
            if matching:
                for device in prefs.devices:device.use=device.type==candidate
                devices=[{'name':d.name,'type':d.type} for d in matching];backend=candidate;break
        except Exception:pass
    if backend=='CPU':raise RuntimeError('No supported GPU backend was detected for the GPU reference.')
scene.render.engine='CYCLES';scene.cycles.device='CPU' if backend=='CPU' else 'GPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=360;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=spec['output'];scene.render.use_file_extension=True
start=time.perf_counter();bpy.ops.render.render(write_still=True);elapsed=time.perf_counter()-start
Path(spec['report']).write_text(json.dumps({'original':original,'camera':settings,'backend':backend,'devices':devices,'render_seconds':elapsed,'width':640,'height':360,'samples':16,'output':spec['output']},indent=2))

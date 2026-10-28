"""Apply Fusion camera extras on the job-local Blender copy."""
import math
import bpy

PANO = {'equirect': 'EQUIRECTANGULAR', 'fisheye': 'FISHEYE_EQUISOLID', 'mirror': 'MIRRORBALL'}

def _id(obj):
    return obj.get('fusion_id') or obj.get('fusion_render_object_id')

def _find(object_id):
    for obj in bpy.context.scene.objects:
        if _id(obj) == object_id:
            return obj
    return None

def apply_scene_camera_extras(camera):
    """Ortho, bokeh blades, tilt-shift, panoramic type and stereo from Fusion extras."""
    data = camera.data
    if camera.get('fusion_ortho'):
        data.type = 'ORTHO'
        data.ortho_scale = max(.001, float(camera.get('fusion_ortho_height', 4)))
    if camera.get('fusion_blades') is not None:
        data.dof.aperture_blades = max(0, min(16, int(camera['fusion_blades'])))
    if camera.get('fusion_bokeh_rot') is not None:
        data.dof.aperture_rotation = math.radians(float(camera['fusion_bokeh_rot']))
    if camera.get('fusion_shift_x') is not None:
        data.shift_x = max(-2.0, min(2.0, float(camera['fusion_shift_x'])))
    if camera.get('fusion_shift_y') is not None:
        data.shift_y = max(-2.0, min(2.0, float(camera['fusion_shift_y'])))
    pano = camera.get('fusion_pano')
    if pano in PANO:
        data.type = 'PANO'
        if hasattr(data, 'panorama_type'):
            allowed = {i.identifier for i in data.bl_rna.properties['panorama_type'].enum_items}
            if PANO[pano] in allowed:
                data.panorama_type = PANO[pano]
    if camera.get('fusion_stereo') and hasattr(data, 'stereo'):
        data.stereo.interocular_distance = max(.001, float(camera.get('fusion_eye_sep', .065)))

def _tree(scene):
    if getattr(scene, 'use_nodes', None) is not None:
        try:
            scene.use_nodes = True
        except Exception:
            pass
    return getattr(scene, 'node_tree', None) or getattr(scene, 'compositing_node_group', None)

def apply_lens_compositor(scene, rec):
    """Lens distortion, chromatic aberration, vignette and glare as compositor nodes when the tree exists."""
    dist, chroma, vig, flare = float(rec.get('distortion') or 0), float(rec.get('chromatic') or 0), float(rec.get('vignette') or 0), float(rec.get('flare') or 0)
    if not (dist or chroma or vig or flare):
        return False
    tree = _tree(scene)
    if tree is None:
        return False
    nodes, links = tree.nodes, tree.links
    composite = next((n for n in nodes if n.type == 'COMPOSITE' or n.bl_idname == 'CompositorNodeComposite'), None)
    render = next((n for n in nodes if n.type == 'R_LAYERS' or n.bl_idname == 'CompositorNodeRLayers'), None)
    if composite is None:
        try:
            composite = nodes.new('CompositorNodeComposite')
        except RuntimeError:
            return False
    if render is None:
        try:
            render = nodes.new('CompositorNodeRLayers')
        except RuntimeError:
            return False
    image_out = render.outputs.get('Image') or render.outputs[0]
    current = image_out
    if dist or chroma:
        try:
            lens = nodes.new('CompositorNodeLensdist')
            lens.inputs['Distort'].default_value = dist
            if 'Dispersion' in lens.inputs:
                lens.inputs['Dispersion'].default_value = chroma
            links.new(current, lens.inputs['Image'] if 'Image' in lens.inputs else lens.inputs[0])
            current = lens.outputs['Image'] if 'Image' in lens.outputs else lens.outputs[0]
        except RuntimeError:
            pass
    if vig:
        try:
            mix = nodes.new('CompositorNodeMixRGB') if 'CompositorNodeMixRGB' in dir(bpy.types) else nodes.new('CompositorNodeMix')
            if hasattr(mix, 'blend_type'):
                mix.blend_type = 'MULTIPLY'
            fac = mix.inputs.get('Fac') or mix.inputs.get('Factor')
            if fac is not None:
                fac.default_value = vig
            links.new(current, mix.inputs.get('Image1') or mix.inputs.get('A') or mix.inputs[1])
            current = mix.outputs.get('Image') or mix.outputs.get('Result') or mix.outputs[0]
        except RuntimeError:
            pass
    if flare:
        try:
            glare = nodes.new('CompositorNodeGlare')
            if hasattr(glare, 'glare_type'):
                glare.glare_type = 'GHOSTS'
            if 'Mix' in glare.inputs:
                glare.inputs['Mix'].default_value = max(-1.0, min(1.0, flare * 2 - 1))
            links.new(current, glare.inputs['Image'] if 'Image' in glare.inputs else glare.inputs[0])
            current = glare.outputs['Image'] if 'Image' in glare.outputs else glare.outputs[0]
        except RuntimeError:
            pass
    try:
        links.new(current, composite.inputs['Image'] if 'Image' in composite.inputs else composite.inputs[0])
        scene.render.use_compositing = True
    except Exception:
        return False
    return True

def apply_white_balance(scene, kelvin):
    """Shift view-transform temperature when Blender exposes it; otherwise leave colour management unchanged."""
    if kelvin is None or abs(float(kelvin) - 6500) < 1:
        return False
    vs = scene.view_settings
    for attr in ('white_balance_temperature', 'temperature'):
        if hasattr(vs, attr):
            setattr(vs, attr, max(1000.0, min(12000.0, float(kelvin))))
            return True
    return False

def apply_cameras(options):
    payload = (options or {}).get('cameras')
    scene = bpy.context.scene
    quality = (options or {}).get('render') or {}
    report = {'applied': 0, 'compositor': False, 'motionBlur': False, 'whiteBalance': False, 'version': 1}
    cameras = (payload or {}).get('cameras') or []
    for rec in cameras:
        cam = _find(rec.get('objectId'))
        if cam is None or cam.type != 'CAMERA':
            continue
        apply_from_record(cam, rec)
        report['applied'] += 1
        if rec.get('motionBlur'):
            scene.render.use_motion_blur = True
            scene.render.motion_blur_shutter = max(.01, min(1.0, float(rec.get('shutter', 180)) / 360.0))
            report['motionBlur'] = True
        iso = float(rec.get('iso') or 100)
        if iso != 100:
            base = float(quality.get('exposure') or 0)
            scene.view_settings.exposure = base + math.log2(max(50.0, iso) / 100.0)
        if apply_white_balance(scene, rec.get('whiteBalance')):
            report['whiteBalance'] = True
        if rec.get('stereo'):
            scene.render.use_multiview = True
            try:
                scene.render.views_format = 'STEREO_3D'
            except TypeError:
                pass
        try:
            if apply_lens_compositor(scene, rec):
                report['compositor'] = True
        except Exception:
            pass
        track = rec.get('track')
        if track:
            _keyframe_track(cam, track)
    return report

def apply_from_record(cam, rec):
    data = cam.data
    if rec.get('ortho'):
        data.type = 'ORTHO'
        data.ortho_scale = max(.001, float(rec.get('orthoHeight', 4)))
    if rec.get('blades') is not None:
        data.dof.aperture_blades = max(0, min(16, int(rec['blades'])))
    if rec.get('bokehRotation') is not None:
        data.dof.aperture_rotation = math.radians(float(rec['bokehRotation']))
    if rec.get('shiftX') is not None:
        data.shift_x = float(rec['shiftX'])
    if rec.get('shiftY') is not None:
        data.shift_y = float(rec['shiftY'])
    pano = rec.get('pano')
    if pano in PANO:
        data.type = 'PANO'
        if hasattr(data, 'panorama_type'):
            allowed = {i.identifier for i in data.bl_rna.properties['panorama_type'].enum_items}
            if PANO[pano] in allowed:
                data.panorama_type = PANO[pano]
    if rec.get('stereo') and hasattr(data, 'stereo'):
        data.stereo.interocular_distance = max(.001, float(rec.get('eyeSep', .065)))

def _keyframe_track(cam, track):
    for sample in track[:10000]:
        frame = int(sample['frame'])
        loc = sample['position']
        # Fusion Y-up to Blender Z-up.
        cam.location = (loc[0], -loc[2], loc[1])
        cam.keyframe_insert('location', frame=frame)
        q = sample['quaternion']
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = (q[3], q[0], q[1], q[2])
        cam.keyframe_insert('rotation_quaternion', frame=frame)

"""Apply Fusion lighting extras on the job-local Blender copy."""
import math
import bpy
from mathutils import Vector

RAY = {
    'camera': 'visible_camera',
    'diffuse': 'visible_diffuse',
    'glossy': 'visible_glossy',
    'transmission': 'visible_transmission',
    'volumeScatter': 'visible_volume_scatter',
    'shadow': 'visible_shadow',
}

def _id(obj):
    return obj.get('fusion_id') or obj.get('fusion_render_object_id')

def _find(object_id):
    for obj in bpy.context.scene.objects:
        if _id(obj) == object_id:
            return obj
    return None

def _area_m2(lamp, rec):
    kind, a, b, r = rec.get('kind'), max(.01, float(rec.get('area', 1))), max(.01, float(rec.get('areaY', rec.get('area', 1)))), max(.001, float(rec.get('soft', .1)))
    if kind == 'disk':
        return math.pi * (a * .5) ** 2
    if kind == 'tube':
        return a * b
    if kind == 'sphere':
        return 4 * math.pi * r * r
    if kind in ('area',):
        return a * a
    return 1.0

def apply_world_lighting(scene, quality):
    """Nishita sun/sky and world volume scatter used for god rays around spot lights."""
    report = {'sunSky': False, 'volume': 0}
    world = (quality or {}).get('world') or quality or {}
    sky = world.get('sunSky') or {}
    volume = float(world.get('volume') or 0)
    if sky.get('enabled'):
        scene.world.use_nodes = True
        nodes, links = scene.world.node_tree.nodes, scene.world.node_tree.links
        background = next(n for n in nodes if n.type == 'BACKGROUND')
        tex = nodes.new('ShaderNodeTexSky')
        try:
            tex.sky_type = 'NISHITA'
        except TypeError:
            pass
        if hasattr(tex, 'sun_elevation'):
            tex.sun_elevation = math.radians(float(sky.get('elevation', 45)))
        if hasattr(tex, 'sun_rotation'):
            tex.sun_rotation = math.radians(float(sky.get('rotation', 0)))
        if hasattr(tex, 'air_density'):
            tex.air_density = max(0.0, float(sky.get('air', 1)))
        if hasattr(tex, 'dust_density'):
            tex.dust_density = max(0.0, float(sky.get('dust', 1)))
        if hasattr(tex, 'ozone_density'):
            tex.ozone_density = max(0.0, float(sky.get('ozone', 1)))
        links.new(tex.outputs['Color'], background.inputs['Color'])
        if not any(o.type == 'LIGHT' and o.data.type == 'SUN' for o in scene.objects):
            bpy.ops.object.light_add(type='SUN')
            sun = bpy.context.object
            sun.name = 'Fusion sun/sky'
            sun['fusion_studio_helper'] = True
            elevation = math.radians(float(sky.get('elevation', 45)))
            rotation = math.radians(float(sky.get('rotation', 0)))
            direction = Vector((math.sin(rotation) * math.cos(elevation), -math.cos(rotation) * math.cos(elevation), math.sin(elevation)))
            sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
            sun.data.energy = 4.0
        report['sunSky'] = True
    if volume > 0:
        scene.world.use_nodes = True
        nodes, links = scene.world.node_tree.nodes, scene.world.node_tree.links
        out = next(n for n in nodes if n.type == 'OUTPUT_WORLD')
        princ = nodes.new('ShaderNodeVolumePrincipled')
        princ.inputs['Density'].default_value = min(10.0, volume)
        princ.inputs['Anisotropy'].default_value = .3
        links.new(princ.outputs['Volume'], out.inputs['Volume'])
        report['volume'] = volume
    cycles = scene.cycles
    if (quality or {}).get('caustics'):
        cycles.caustics_reflective = True
        cycles.caustics_refractive = True
        report['caustics'] = True
    if (quality or {}).get('contactShadows') and hasattr(cycles, 'use_fast_gi'):
        cycles.use_fast_gi = True
        if hasattr(cycles, 'ao_bounces'):
            cycles.ao_bounces = 1
        report['contactShadows'] = True
    return report

def _ies(lamp, path):
    lamp.data.use_nodes = True
    tree = lamp.data.node_tree
    nodes, links = tree.nodes, tree.links
    emission = next((n for n in nodes if n.type == 'EMISSION'), None)
    if emission is None:
        emission = nodes.new('ShaderNodeEmission')
        out = next((n for n in nodes if n.type == 'OUTPUT_LIGHT'), None) or nodes.new('ShaderNodeOutputLight')
        links.new(emission.outputs[0], out.inputs['Surface'])
    ies = nodes.new('ShaderNodeTexIES')
    try:
        ies.mode = 'EXTERNAL'
    except Exception:
        pass
    ies.filepath = path
    links.new(ies.outputs['Fac'], emission.inputs['Strength'])

def _gobo(lamp, path):
    lamp.data.use_nodes = True
    tree = lamp.data.node_tree
    nodes, links = tree.nodes, tree.links
    emission = next((n for n in nodes if n.type == 'EMISSION'), None)
    if emission is None:
        emission = nodes.new('ShaderNodeEmission')
        out = next((n for n in nodes if n.type == 'OUTPUT_LIGHT'), None) or nodes.new('ShaderNodeOutputLight')
        links.new(emission.outputs[0], out.inputs['Surface'])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path, check_existing=True)
    coord = nodes.new('ShaderNodeTexCoord')
    links.new(coord.outputs['Normal'] if 'Normal' in coord.outputs else coord.outputs[0], tex.inputs['Vector'])
    links.new(tex.outputs['Color'], emission.inputs['Color'])

def _barn(lamp, rec):
    top, bottom, left, right = [math.radians(v) for v in rec.get('barn') or [0, 0, 0, 0]]
    spread = max(top, bottom, left, right)
    if spread > 0 and hasattr(lamp.data, 'spread'):
        lamp.data.spread = max(.01, math.pi - spread)

def _link(lamp, rec):
    include, exclude = rec.get('include') or [], rec.get('exclude') or []
    if not include and not exclude:
        return
    linking = getattr(lamp, 'light_linking', None)
    if linking is None:
        return
    scene = bpy.context.scene
    if include:
        coll = bpy.data.collections.new('Fusion receive ' + lamp.name)
        scene.collection.children.link(coll)
        for oid in include:
            obj = _find(oid)
            if obj is not None and obj.name not in coll.objects:
                try:
                    coll.objects.link(obj)
                except RuntimeError:
                    pass
        linking.receiver_collection = coll
    if exclude:
        block = bpy.data.collections.new('Fusion block ' + lamp.name)
        scene.collection.children.link(block)
        for oid in exclude:
            obj = _find(oid)
            if obj is not None and obj.name not in block.objects:
                try:
                    block.objects.link(obj)
                except RuntimeError:
                    pass
        if hasattr(linking, 'blocker_collection'):
            linking.blocker_collection = block

def _rays(obj, rec):
    flags = rec.get('rays') or {}
    for key, prop in RAY.items():
        if hasattr(obj, prop):
            setattr(obj, prop, flags.get(key, True))

def _shape(lamp, rec):
    kind = rec.get('kind') or lamp.get('fusion_light')
    data = lamp.data
    if kind in ('area', 'disk', 'tube') or rec.get('portal'):
        data.type = 'AREA'
        shape = rec.get('shape') or ('DISK' if kind == 'disk' else 'RECTANGLE' if kind == 'tube' else 'SQUARE')
        if shape in {i.identifier for i in data.bl_rna.properties['shape'].enum_items}:
            data.shape = shape
        data.size = max(.01, float(rec.get('area', 1)))
        if hasattr(data, 'size_y') and shape in ('RECTANGLE', 'ELLIPSE'):
            data.size_y = max(.01, float(rec.get('areaY', rec.get('area', 1))))
    elif kind == 'sphere':
        data.type = 'POINT'
        if hasattr(data, 'shadow_soft_size'):
            data.shadow_soft_size = max(0.0, float(rec.get('soft', .25)))
    if rec.get('portal') and hasattr(data, 'cycles'):
        try:
            data.cycles.is_portal = True
        except Exception:
            pass
    if rec.get('volume') and data.type == 'SPOT':
        data.use_custom_distance = True
        data.cutoff_distance = 40
    if rec.get('caustics'):
        if hasattr(lamp, 'is_shadow_catcher'):
            pass
        cycles = getattr(lamp, 'cycles', None)
        if cycles is not None and hasattr(cycles, 'is_caustics_caster'):
            cycles.is_caustics_caster = True

def apply_light(lamp, rec, mixer):
    _shape(lamp, rec)
    _barn(lamp, rec)
    _rays(lamp, rec)
    group = rec.get('group') or ''
    if group and hasattr(lamp, 'lightgroup'):
        layer = bpy.context.view_layer
        groups = getattr(layer, 'lightgroups', None)
        if groups is not None:
            if group not in groups:
                try:
                    groups.add(name=group)
                except Exception:
                    pass
            try:
                lamp.lightgroup = group
            except Exception:
                pass
    scale = float(mixer.get(group, 1) if group else 1)
    if scale != 1:
        lamp.data.energy = max(0.0, lamp.data.energy * scale)
    if rec.get('ies'):
        _ies(lamp, rec['ies'])
    if rec.get('gobo'):
        _gobo(lamp, rec['gobo'])
    _link(lamp, rec)

def apply_mesh_light(obj):
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        cycles = getattr(mat, 'cycles', None)
        if cycles is not None and hasattr(cycles, 'sample_as_light'):
            cycles.sample_as_light = True
        mat.use_nodes = True
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and 'Emission Strength' in bsdf.inputs and bsdf.inputs['Emission Strength'].default_value < .01:
            bsdf.inputs['Emission Strength'].default_value = 8
    cycles_obj = getattr(obj, 'cycles', None)
    if cycles_obj is not None and hasattr(cycles_obj, 'is_caustics_caster'):
        pass

def apply_lighting(options):
    lighting = options.get('lighting') if options else None
    if not lighting:
        return {'applied': 0, 'meshes': 0, 'version': 1}
    mixer = lighting.get('mixer') or {}
    applied = 0
    for rec in lighting.get('lights') or []:
        lamp = _find(rec.get('objectId'))
        if lamp is None or lamp.type != 'LIGHT':
            continue
        apply_light(lamp, rec, mixer)
        applied += 1
    meshes = 0
    for rec in lighting.get('meshes') or []:
        obj = _find(rec.get('objectId'))
        if obj is None or obj.type != 'MESH':
            continue
        apply_mesh_light(obj)
        meshes += 1
    return {'applied': applied, 'meshes': meshes, 'groups': len(mixer), 'version': 1}

def lightmap_bake(obj, options):
    """Bake direct+indirect lighting onto the Lightmap UV set (or UVMap) as a multiply over base colour."""
    size = int(options.get('size', 1024))
    layers = obj.data.uv_layers
    if not layers:
        raise ValueError('Lightmap baking needs UV coordinates.')
    target = layers.get('Lightmap') or layers.active
    layers.active = target
    if not obj.data.materials:
        mat = bpy.data.materials.new('Fusion lightmap')
        mat.use_nodes = True
        obj.data.materials.append(mat)
    mat = obj.data.materials[0]
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    img = bpy.data.images.new('Fusion lightmap', width=size, height=size, alpha=False)
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    for n in nodes:
        n.select = False
    tex.select = True
    nodes.active = tex
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = max(8, min(64, int(options.get('samples', 24))))
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4, use_clear=True)
    except TypeError:
        bpy.ops.object.bake(type='DIFFUSE', margin=4, use_clear=True)
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        mix = None
        try:
            mix = nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            if 'Factor' in mix.inputs:
                mix.inputs['Factor'].default_value = 1
        except RuntimeError:
            mix = nodes.new('ShaderNodeMixRGB')
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Fac'].default_value = 1
        color_in = bsdf.inputs['Base Color']
        albedo = mix.inputs['A'] if 'A' in mix.inputs else mix.inputs['Color1'] if 'Color1' in mix.inputs else mix.inputs[0]
        lighting = mix.inputs['B'] if 'B' in mix.inputs else mix.inputs['Color2'] if 'Color2' in mix.inputs else mix.inputs[2]
        result = mix.outputs['Result'] if 'Result' in mix.outputs else mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[0]
        if color_in.is_linked:
            src = color_in.links[0].from_socket
            for link in list(color_in.links):
                links.remove(link)
            links.new(src, albedo)
        links.new(tex.outputs['Color'], lighting)
        links.new(result, color_in)
    return {'type': 'LIGHTMAP', 'size': size, 'uv': target.name, 'image': img.name}

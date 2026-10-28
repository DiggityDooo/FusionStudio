"""Real Blender import/shader/packed-image acceptance for a generated dense mesh."""
import copy
import hashlib
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from blender_worker import import_model
from gltf_bump import bump_plan, apply_bump_plan
from character_materials import apply_character_materials

source, output = map(Path, sys.argv[sys.argv.index('--')+1:])
options = {}
bpy.ops.wm.read_factory_settings(use_empty=True)
import_model(source, options)
assert options['bumpTextures']['applied'] == 1, options
obj = next(o for o in bpy.context.scene.objects if o.get('fusion_render_object_id'))
material = obj.data.materials[0]
geometry = (len(obj.data.vertices), len(obj.data.polygons))
assert geometry[1] >= 100000
plan = bump_plan(source)
record = plan['materials'][0]
shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bump = next(n for n in material.node_tree.nodes if n.type == 'BUMP')
image = next(n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.get('fusion_bump_owner'))
assert image.colorspace_settings.name == 'Non-Color'
assert hashlib.sha256(bytes(image.packed_file.data)).hexdigest() == record['image']
assert next(n for n in material.node_tree.nodes if n.type == 'UVMAP').uv_map == 'UVMap.001'
normal = material.node_tree.nodes.new('ShaderNodeNormalMap')
normal.inputs['Color'].default_value = (.5, .5, 1, 1)
material.node_tree.links.new(normal.outputs['Normal'], bump.inputs['Normal'])
spec = {'version': 1, 'materials': [{'version': 1, 'kind': 'skin', 'appearanceVersion': 2, 'objectId': obj['fusion_render_object_id'], 'materialId': material['fusion_material_id'], 'pores': .35, 'roughness': .48, 'freckles': .3, 'subsurface': .12, 'displacement': .0002}]}
apply_character_materials(spec)
counts = (len(material.node_tree.nodes), len(obj.modifiers), len(bpy.data.images))
apply_character_materials(spec)
assert counts == (len(material.node_tree.nodes), len(obj.modifiers), len(bpy.data.images)), counts
assert len([m for m in obj.modifiers if m.name == 'Fusion character render detail']) == 1
assert bump.inputs['Normal'].links[0].from_node == normal
assert shader.inputs['Normal'].links[0].from_node.get('fusion_character_node') == 'microdetail'
mixed = copy.deepcopy(plan);mixed['materials'][0]['wrap'] = [33648, 33071]
assert apply_bump_plan(mixed, [material])['warnings']
apply_bump_plan(plan, [material])
assert counts == (len(material.node_tree.nodes), len(obj.modifiers), len(bpy.data.images))
bump = next(n for n in material.node_tree.nodes if n.type == 'BUMP' and n.get('fusion_bump_owner'))
assert bump.inputs['Normal'].links[0].from_node == normal
assert any(link.to_node.get('fusion_character_node') == 'microdetail' for link in bump.outputs['Normal'].links)
off = copy.deepcopy(spec);off['materials'][0]['freckles'] = 0
apply_character_materials(off)
mix = next(n for n in material.node_tree.nodes if n.get('fusion_character_node') == 'freckle-mix')
assert mix.inputs[0].default_value == 0
before = (len(material.node_tree.nodes), shader.inputs['Roughness'].default_value)
bad = copy.deepcopy(spec);bad['materials'][0]['roughness'] = .2;bad['materials'].append({**spec['materials'][0], 'materialId': 'missing'})
try:apply_character_materials(bad);raise AssertionError('missing material accepted')
except ValueError:pass
assert before == (len(material.node_tree.nodes), shader.inputs['Roughness'].default_value)
bad = copy.deepcopy(plan);bad['materials'][0]['channel'] = 3
try:apply_bump_plan(bad, [material]);raise AssertionError('missing UV set accepted')
except ValueError:pass

state = {}
def visit(node):
    assert state.get(node) != 1, 'shader cycle'
    if state.get(node) == 2:return
    state[node] = 1
    for socket in node.outputs:
        for link in socket.links:visit(link.to_node)
    state[node] = 2
for node in material.node_tree.nodes:visit(node)
assert geometry == (len(obj.data.vertices), len(obj.data.polygons))

scene = bpy.context.scene
scene.render.engine = 'CYCLES';scene.cycles.device = 'CPU';scene.cycles.samples = 12;scene.cycles.seed = 19
backend = 'CPU'
try:
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = 'OPTIX';preferences.get_devices()
    if any(device.type == 'OPTIX' for device in preferences.devices):
        for device in preferences.devices:device.use = device.type == 'OPTIX'
        scene.cycles.device = 'GPU';backend = 'OPTIX'
except (KeyError, TypeError, RuntimeError):pass
scene.render.resolution_x = 256;scene.render.resolution_y = 256;scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Probe world');scene.world.use_nodes = True;scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.07,.07,.07,1)
camera = bpy.data.objects.new('Probe camera', bpy.data.cameras.new('Probe camera'));scene.collection.objects.link(camera);camera.location = (1.3,-2.1,1);camera.rotation_euler = (-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens = 55;scene.camera = camera
light = bpy.data.objects.new('Probe key', bpy.data.lights.new('Probe key','AREA'));scene.collection.objects.link(light);light.location = (1,-2,3);light.rotation_euler = (-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy = 400;light.data.shape = 'DISK';light.data.size = 1
micro = next(n for n in material.node_tree.nodes if n.get('fusion_character_node') == 'microdetail')
micro.inputs['Strength'].default_value = 0
factor = bump.inputs['Distance'].default_value
assert abs(factor-abs(record['factor'])) < 1e-9
# A 256px full-object view barely resolves the real skin microdetail. This is
# explicitly a high-gain shader calibration, not a realistic skin setting.
calibration_factor = .04
bump.inputs['Distance'].default_value = 0;scene.render.filepath = str(output.parent/'without-height.png');bpy.ops.render.render(write_still=True)
bump.inputs['Distance'].default_value = calibration_factor;scene.render.filepath = str(output.parent/'with-height.png');bpy.ops.render.render(write_still=True)
bump.inputs['Distance'].default_value = factor
saved = output.parent/'packed-bump.blend';bpy.ops.wm.save_as_mainfile(filepath=str(saved))
bpy.ops.wm.open_mainfile(filepath=str(saved), load_ui=False, use_scripts=False)
loaded = next(m for m in bpy.data.materials if m.get('fusion_material_id') == record['identity'])
loaded_image = next(n.image for n in loaded.node_tree.nodes if n.type == 'TEX_IMAGE' and n.get('fusion_bump_owner'))
assert loaded_image.colorspace_settings.name == 'Non-Color';assert hashlib.sha256(bytes(loaded_image.packed_file.data)).hexdigest() == record['image']
loaded_bump = next(n for n in loaded.node_tree.nodes if n.type == 'BUMP' and n.get('fusion_bump_owner'))
assert abs(loaded_bump.inputs['Distance'].default_value-factor) < 1e-9
output.write_text(json.dumps({'passed': True, 'geometry': geometry, 'backend': backend, 'import': options['bumpTextures'], 'packedImageSHA256': record['image'], 'shaderNodes': counts[0], 'subdivisionModifiers': 1, 'sourceGeometryUnchanged': True, 'savedBumpFactor': factor, 'renderCalibrationFactor': calibration_factor, 'calibrationScope': 'High-gain visibility probe only; saved Blend retains the original factor. This does not establish portrait realism.', 'blend': str(saved), 'withoutHeight': str(output.parent/'without-height.png'), 'withHeight': str(output.parent/'with-height.png')}, indent=2), encoding='utf8')
print('FUSION_BUMP_ACCEPTANCE_PASS', flush=True)

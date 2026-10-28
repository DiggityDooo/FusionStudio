"""Check the generated desktop fixture through Blender's real glTF importer.

Run in a factory-startup background Blender with -- <input.glb> <report.json>.
Only the new test report is written; source and vendor assets are not changed.
"""
import json
import sys
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from blender_worker import import_model

input_path, output_path = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
import_model(Path(input_path).resolve(), {})
hero = next(o for o in scene.objects if o.name in ('Hero detail', 'Hero_detail'))
prop = next(o for o in scene.objects if o.name in ('Stepped prop', 'Stepped_prop'))
cases = [(1, 0, 0, 7), (6, 1, 1, 7), (11, 2, 0, 7),
         (31, 0, 0, 7), (39, 1, 1, 7), (40, 1.2, .8, 7),
         (41, 1.4, .6, 9), (44, 2, 0, 9)]
samples = []
for frame, x, morph, prop_x in cases:
    scene.frame_set(frame)
    actual = (hero.location.x, hero.data.shape_keys.key_blocks[1].value, prop.location.x)
    error = max(abs(a-b) for a, b in zip(actual, (x, morph, prop_x)))
    assert error < 1e-4, (frame, actual, (x, morph, prop_x), error)
    samples.append({'frame': frame, 'body_x': actual[0], 'morph': actual[1], 'prop_x': actual[2], 'error': error})
triangles = sum(len(p.vertices)-2 for p in hero.data.polygons)
# A delivery rate change must preserve seconds and still start at Blender frame 1.
bpy.ops.wm.read_factory_settings(use_empty=True)
options = {'animation': {'fps': 30}}
import_model(Path(input_path).resolve(), options)
hero = next(o for o in bpy.context.scene.objects if o.name in ('Hero detail', 'Hero_detail'))
prop = next(o for o in bpy.context.scene.objects if o.name in ('Stepped prop', 'Stepped_prop'))
resampled = []
for frame, x, morph, prop_x in cases:
    mapped = 1 + (frame - 1) * 30 / 24
    bpy.context.scene.frame_set(int(mapped), subframe=mapped % 1)
    actual = (hero.location.x, hero.data.shape_keys.key_blocks[1].value, prop.location.x)
    error = max(abs(a-b) for a, b in zip(actual, (x, morph, prop_x)))
    assert error < 1e-4, (mapped, actual, error)
    resampled.append({'frame': mapped, 'error': error})
report = {'passed': True, 'blender': bpy.app.version_string, 'triangles': triangles, 'samples': samples, 'resampled30fps': resampled, 'timing': options['animationTiming']}
Path(output_path).write_text(json.dumps(report, indent=2), encoding='utf-8')
print('ANIMATION_EXCHANGE_PASS ' + json.dumps(report))

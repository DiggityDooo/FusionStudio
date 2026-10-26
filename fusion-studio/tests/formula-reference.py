"""Private direct-pose reference; no runtime formula evaluator is used here."""
import json
import os
import sys
from pathlib import Path
import bpy

spec = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf-8'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dson_importer

output = Path(spec['output']).resolve()
if output.exists():
    raise RuntimeError('Reference output already exists')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
original_plan = dson_importer._make_plan

def direct_pose(source, roots, options):
    report, meshes = original_plan(source, roots, options)
    for mesh in meshes:
        for bone in mesh['bones']:
            if bone['id'] in spec['rotations']:
                bone['rotation'] = spec['rotations'][bone['id']]
    return report, meshes

dson_importer._make_plan = direct_pose
dson_importer.import_dson(spec['source'], spec['roots'])
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_extras=True, export_attributes=True, export_yup=True, export_animations=False, export_apply=False, export_current_frame=True, export_rest_position_armature=False)
Path(spec['report']).write_text(json.dumps({'blender': bpy.app.version_string, 'output': str(output), 'rotations': spec['rotations']}), encoding='utf-8')

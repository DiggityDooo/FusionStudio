"""Blender-driven source-cage identity check (run by native-scene-inventory.test.cjs).

Mode 'build': build a fixture scene, inventory it, capture it via
native_scene.capture, and save the inventory next to the snapshot.
Mode 'check': in a clean session, reopen ONLY the snapshot and require the
ordered hierarchy (collections, objects, parents, materials) to be identical.
Two sessions are required: loading a library into the building session appends
.001 duplicates, which says nothing about the file."""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import native_scene


def build_fixture(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'CageFixture'
    hero = bpy.data.collections.new('Hero')
    props = bpy.data.collections.new('Props')
    scene.collection.children.link(hero)
    hero.children.link(props)
    mat = bpy.data.materials.new('HeroMat')
    mat.use_nodes = True
    bpy.ops.mesh.primitive_cube_add(size=1)
    cube = bpy.context.object
    cube.name = 'HeroCube'
    cube.data.name = 'HeroCubeMesh'
    cube.data.materials.append(mat)
    hero.objects.link(cube)
    try:
        scene.collection.objects.unlink(cube)
    except Exception:
        pass
    cam = bpy.data.objects.new('MainCam', bpy.data.cameras.new('CamData'))
    props.objects.link(cam)
    scene.camera = cam
    light = bpy.data.objects.new('KeyLight', bpy.data.lights.new('KeyData', 'AREA'))
    scene.collection.objects.link(light)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


def build(work):
    fixture = work / 'fixture.blend'
    build_fixture(fixture)
    before = native_scene.scene_inventory(bpy.context.scene)
    (work / 'before.json').write_text(json.dumps(before))
    bpy.ops.wm.read_factory_settings(use_empty=True)  # capture loads the file as a library; it cannot be the current file
    result = native_scene.capture(fixture, work, 1.0)
    print(json.dumps({'built': True, 'snapshot': result['snapshot']}))


def check(work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = json.loads((work / 'before.json').read_text())
    snapshot = work / 'native-scene.blend'
    with bpy.data.libraries.load(str(snapshot), link=False) as (src, dst):
        dst.scenes = [s for s in src.scenes if s == 'CageFixture']
    scene = next(s for s in dst.scenes if s)
    after = native_scene.scene_inventory(scene)
    problems = []
    for key in ('objects', 'collections', 'materials', 'scene'):
        if before[key] != after[key]:
            problems.append(f"{key} differ:\nbefore={json.dumps(before[key])}\nafter={json.dumps(after[key])}")
    print(json.dumps({'ok': not problems, 'problems': problems, 'objects': len(after['objects']), 'collections': len(after['collections'])}))
    if problems:
        raise SystemExit(1)


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    mode, work = args[0], Path(args[1])
    work.mkdir(parents=True, exist_ok=True)
    if mode == 'build':
        build(work)
    else:
        check(work)


main()

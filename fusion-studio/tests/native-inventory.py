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
    cube.shape_key_add(name='Basis', from_mix=False)
    smile = cube.shape_key_add(name='Smile', from_mix=False)
    for block_point in smile.data:
        block_point.co.z += 0.25
    group = cube.vertex_groups.new(name='Top')
    group.add([i for i, v in enumerate(cube.data.vertices) if v.co.z > 0], 1.0, 'REPLACE')
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
    bpy.ops.object.armature_add(enter_editmode=False)
    rig = bpy.context.object
    rig.name = 'Rig'
    rig.data.name = 'RigData'
    rig.data.bones[0].name = 'Root'
    instance = bpy.data.objects.new('PropsInstance', None)
    instance.instance_type = 'COLLECTION'
    instance.instance_collection = props
    scene.collection.objects.link(instance)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


def build(work):
    fixture = work / 'fixture.blend'
    build_fixture(fixture)
    before = native_scene.scene_inventory(bpy.context.scene)
    (work / 'before.json').write_text(json.dumps(before))
    bpy.ops.wm.read_factory_settings(use_empty=True)  # capture loads the file as a library; it cannot be the current file
    result = native_scene.capture(fixture, work, 1.0)
    print(json.dumps({'built': True, 'snapshot': result['snapshot'], 'warnings': result.get('warnings', [])}))


def editbuild(work):
    import shutil
    fixture = work / 'fixture.blend'
    build_fixture(fixture)
    before = native_scene.scene_inventory(bpy.context.scene)
    (work / 'before.json').write_text(json.dumps(before))
    shutil.copy(fixture, work / 'editcopy.blend')
    print(json.dumps({'built': True, 'edit': True}))


def editapply(work):
    # Authored shape-key edit on the COPY only: topology-preserving by construction.
    bpy.ops.wm.open_mainfile(filepath=str(work / 'editcopy.blend'))
    mesh = bpy.data.meshes['HeroCubeMesh']
    smile = mesh.shape_keys.key_blocks['Smile']
    before = native_scene._points_digest(smile.data)
    for point in smile.data:
        if point.co.z > 0:
            point.co.z += 0.1
    after = native_scene._points_digest(smile.data)
    if before == after:
        raise SystemExit('shape-key edit changed nothing')
    (work / 'edit-expect.json').write_text(json.dumps({'smile_after': after}))
    bpy.ops.wm.save_mainfile()
    print(json.dumps({'edited': True, 'smile_changed': True}))


def editcheck(work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = json.loads((work / 'before.json').read_text())
    expect = json.loads((work / 'edit-expect.json').read_text())
    with bpy.data.libraries.load(str(work / 'editcopy.blend'), link=False) as (src, dst):
        dst.scenes = [s for s in src.scenes if s == 'CageFixture']
    scene = next(s for s in dst.scenes if s)
    after = native_scene.scene_inventory(scene)
    problems = []
    for key in ('objects', 'collections', 'materials', 'scene', 'armatures', 'cameras', 'lights'):
        if before[key] != after[key]:
            problems.append(f"unrelated data changed: {key}")
    bmesh = before['mesh_details']['HeroCubeMesh']
    amesh = after['mesh_details']['HeroCubeMesh']
    for key in ('uv_layers', 'shape_keys', 'attributes', 'vertices', 'basis_digest'):
        if bmesh[key] != amesh[key]:
            problems.append(f"HeroCubeMesh.{key} changed by a shape-key-only edit")
    if amesh['shape_key_digests'].get('Smile') == bmesh['shape_key_digests'].get('Smile'):
        problems.append('Smile digest did not change: edit was lost on save/reopen')
    if amesh['shape_key_digests'].get('Smile') != expect['smile_after']:
        problems.append('Smile digest does not match the applied edit')
    for name in before['mesh_details']:
        if name != 'HeroCubeMesh' and before['mesh_details'][name] != after['mesh_details'][name]:
            problems.append(f"unrelated mesh changed: {name}")
    print(json.dumps({'ok': not problems, 'problems': problems, 'edit': True}))
    if problems:
        raise SystemExit(1)


def check(work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = json.loads((work / 'before.json').read_text())
    snapshot = work / 'native-scene.blend'
    with bpy.data.libraries.load(str(snapshot), link=False) as (src, dst):
        dst.scenes = [s for s in src.scenes if s == 'CageFixture']
    scene = next(s for s in dst.scenes if s)
    after = native_scene.scene_inventory(scene)
    problems = []
    for key in ('objects', 'collections', 'materials', 'scene', 'mesh_details', 'armatures', 'cameras', 'lights'):
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
    elif mode == 'editbuild':
        editbuild(work)
    elif mode == 'editapply':
        editapply(work)
    elif mode == 'editcheck':
        editcheck(work)
    else:
        check(work)


main()

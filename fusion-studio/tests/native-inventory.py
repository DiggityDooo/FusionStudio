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
    # Component edits on the same copy: material color, object transform, UV data.
    mat = bpy.data.materials['HeroMat']
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.4, 0.9, 1.0)
    bpy.data.objects['KeyLight'].location.z = 1.5
    bpy.data.cameras['CamData'].lens = 35.0
    rig = bpy.data.objects['Rig']
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones['Root'].tail.z += 0.3
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    for loop_uv in mesh.uv_layers[0].data:
        loop_uv.uv.x += 0.05
    expect = {'smile_after': after,
              'material_color': native_scene._material_color(mat),
              'light_location': [round(v, 6) for v in bpy.data.objects['KeyLight'].location],
              'uv_after': native_scene._uv_digest(mesh),
              'camera_lens': round(bpy.data.cameras['CamData'].lens, 6),
              'bone_tail': [round(v, 6) for v in bpy.data.armatures['RigData'].bones['Root'].tail_local]}
    (work / 'edit-expect.json').write_text(json.dumps(expect))
    bpy.ops.wm.save_mainfile()
    print(json.dumps({'edited': True, 'smile_changed': True, 'components_changed': True}))


def editcheck(work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = json.loads((work / 'before.json').read_text())
    expect = json.loads((work / 'edit-expect.json').read_text())
    with bpy.data.libraries.load(str(work / 'editcopy.blend'), link=False) as (src, dst):
        dst.scenes = [s for s in src.scenes if s == 'CageFixture']
    scene = next(s for s in dst.scenes if s)
    after = native_scene.scene_inventory(scene)
    problems = []
    for key in ('collections', 'scene', 'lights'):
        if before[key] != after[key]:
            problems.append(f"unrelated data changed: {key}")
    def normalized_cameras(inv):
        out = json.loads(json.dumps(inv['cameras']))
        for entry in out:
            if entry['name'] == 'CamData':
                entry['lens'] = None
                entry['angle'] = None
        return out
    if normalized_cameras(before) != normalized_cameras(after):
        problems.append('unrelated camera data changed')
    cam = next(c for c in after['cameras'] if c['name'] == 'CamData')
    if cam['lens'] != expect['camera_lens']:
        problems.append(f"CamData lens {cam['lens']} != expected edit {expect['camera_lens']}")
    def normalized_armatures(inv):
        out = json.loads(json.dumps(inv['armatures']))
        for arm in out:
            for bone in arm['bones']:
                if bone['name'] == 'Root':
                    bone['tail'] = None
        return out
    if normalized_armatures(before) != normalized_armatures(after):
        problems.append('unrelated armature data changed')
    root_bone = next(b for a in after['armatures'] for b in a['bones'] if b['name'] == 'Root')
    if root_bone['tail'] != expect['bone_tail']:
        problems.append(f"Root bone tail {root_bone['tail']} != expected edit {expect['bone_tail']}")
    # Objects/materials: exactly the edited component may differ, to the expected value.
    def normalized_objects(inv):
        out = json.loads(json.dumps(inv['objects']))
        for entry in out:
            if entry['name'] == 'KeyLight':
                entry['location'] = None
        return out
    if normalized_objects(before) != normalized_objects(after):
        problems.append('unrelated object data changed')
    light = next(o for o in after['objects'] if o['name'] == 'KeyLight')
    if light['location'] != expect['light_location']:
        problems.append(f"KeyLight location {light['location']} != expected edit {expect['light_location']}")
    def normalized_materials(inv):
        out = json.loads(json.dumps(inv['materials']))
        for entry in out:
            if entry['name'] == 'HeroMat':
                entry['base_color'] = None
        return out
    if normalized_materials(before) != normalized_materials(after):
        problems.append('unrelated material data changed')
    hero_mat = next(m for m in after['materials'] if m['name'] == 'HeroMat')
    if hero_mat['base_color'] != expect['material_color']:
        problems.append(f"HeroMat color {hero_mat['base_color']} != expected edit {expect['material_color']}")
    bmesh = before['mesh_details']['HeroCubeMesh']
    amesh = after['mesh_details']['HeroCubeMesh']
    for key in ('uv_layers', 'shape_keys', 'attributes', 'vertices', 'basis_digest'):
        if bmesh[key] != amesh[key]:
            problems.append(f"HeroCubeMesh.{key} changed by a shape-key-only edit")
    if amesh['uv_digest'] != expect['uv_after'] or amesh['uv_digest'] == bmesh['uv_digest']:
        problems.append('UV edit was lost or altered on save/reopen')
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

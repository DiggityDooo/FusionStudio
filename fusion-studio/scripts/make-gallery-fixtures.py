"""Original, asset-free documentation fixtures.

Run with Blender --background --factory-startup --disable-autoexec --python.

Writes only to test-output/github-showcase/fixtures. No installed or private model
is opened. Fusion's ordinary import/render paths are used by capture-gallery.cjs.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parents[1] / 'test-output/github-showcase/fixtures'
OUT.mkdir(parents=True, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metal=0, rough=.35):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    return m


def finish(o, name, mat, bevel=0):
    o.name = name
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Machined edge radii', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
    if hasattr(o.data, 'polygons'):
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def cube(name, pos, scale, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, bevel)


def cylinder(name, pos, radius, depth, mat, axis='Y', vertices=128):
    rot = (math.pi / 2, 0, 0) if axis == 'Y' else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                      location=pos, rotation=rot)
    return finish(bpy.context.object, name, mat, .012)


def torus(name, pos, radius, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=192, minor_segments=24,
        location=pos, rotation=(math.pi / 2, 0, 0), major_radius=radius, minor_radius=minor)
    return finish(bpy.context.object, name, mat)


def camera_lighting(target, camera_pos):
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new('Studio graphite')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055, .065, .085, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
    for name, loc, energy, size, color in [
        ('Large soft key', (2, -4, 6), 1000, 5, (1, .88, .75)),
        ('Cool rim', (-3, 1, 4), 1200, 3, (.6, .8, 1)),
        ('Front fill', (0, -5, 2), 400, 4, (1, 1, 1))]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
        o = bpy.data.objects.new(name, data)
        scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=camera_pos)
    cam = bpy.context.object
    cam.name = 'Gallery camera'
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 58
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'


def instrument():
    reset()
    teal = material('Anodized petrol aluminum', (.025, .19, .21), .78, .28)
    dark = material('Graphite housing', (.025, .032, .043), .62, .32)
    alloy = material('Brushed titanium', (.42, .48, .52), .9, .26)
    copper = material('Warm copper trim', (.62, .24, .065), .88, .22)
    rubber = material('Rubber gasket', (.012, .018, .022), .05, .68)
    glass = material('Optical blue coating', (.018, .075, .12), .6, .09)
    cube('Main chassis', (0, 0, 1.5), (2.1, 1.12, 1.65), teal, .12)
    cube('Rear heat spreader', (0, .58, 1.5), (1.86, .2, 1.4), dark, .06)
    for i in range(13):
        cube('Cooling fin %02d' % (i + 1), (-.81 + i * .135, .77, 1.5), (.055, .25, 1.22), alloy, .014)
    cylinder('Lens barrel', (0, -.76, 1.58), .77, .48, dark)
    for y, r, mat in [(-.59, .8, alloy), (-.79, .78, teal), (-.99, .76, copper), (-1.04, .68, rubber)]:
        torus('Optical collar %.2f' % y, (0, y, 1.58), r, .045, mat)
    cylinder('Optical face', (0, -1.055, 1.58), .61, .025, glass)
    for i in range(36):
        a = i * 2 * math.pi / 36
        cube('Collar grip %02d' % i, (.746 * math.cos(a), -.87, 1.58 + .746 * math.sin(a)),
             (.035, .17, .035), alloy, .008)
    for x in [-.86, .86]:
        for z in [.88, 2.18]:
            cylinder('Front fastener', (x, -.58, z), .055, .03, alloy, vertices=32)
            cube('Fastener recess', (x, -.602, z), (.06, .006, .014), dark, .002)
    cube('Top service rail', (0, 0, 2.38), (1.45, .68, .12), alloy, .035)
    for i in range(8):
        cube('Rail slot %02d' % i, (-.6 + i * .17, 0, 2.449), (.065, .5, .012), dark, .005)
    cube('Mounting foot', (0, .03, .48), (1.48, .9, .22), dark, .06)
    cube('Mounting stem', (0, .03, .76), (.6, .6, .5), alloy, .05)
    cylinder('Display plinth', (0, 0, .18), 1.65, .22, dark, axis='Z', vertices=192)
    for x in [-1.09, 1.09]:
        cylinder('Side adjuster', (x, 0, 1.7), .18, .13, copper, axis='Z', vertices=64)
    floor = material('Floor', (.055, .065, .08), .15, .48)
    cube('Studio floor', (0, 0, -.025), (200, 200, .05), floor, 0)
    camera_lighting((0, -.05, 1.35), (4.7, -6.7, 3.6))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'fusion-optical-instrument.blend'))


def vessel():
    reset()
    ceramic = material('Slate blue stoneware', (.13, .27, .32), .12, .4)
    # Original closed lathe: exterior, rounded rim and interior form one editable mesh.
    rings, sides = 224, 256
    vertices, faces = [], []
    def profile(t):
        return .4 + .49 * math.sin(math.pi * min(t * 1.17, 1)) ** 1.3 + .15 * math.exp(-((t - .02) / .045) ** 2) + .13 * math.exp(-((t - .96) / .045) ** 2)
    for j in range(rings + 1):
        t = j / rings
        z = .1 + t * 2.7
        r = profile(t)
        for i in range(sides):
            a = i * math.tau / sides
            flute = .009 * math.cos(24 * a) * math.sin(math.pi * t) ** 2
            vertices.append(((r + flute) * math.cos(a), (r + flute) * math.sin(a), z))
    for j in range(rings):
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    bottom = len(vertices)
    vertices.append((0, 0, .1))
    for i in range(sides):
        faces.append((bottom, (i + 1) % sides, i))
    # Inner wall down to a raised interior floor.
    inner_start = len(vertices)
    for j in range(81):
        t = 1 - j / 80 * .95
        r = max(.12, profile(t) - .075)
        for i in range(sides):
            a = i * math.tau / sides
            vertices.append((r * math.cos(a), r * math.sin(a), .1 + t * 2.7))
    for i in range(sides):
        a, b = rings * sides + i, rings * sides + (i + 1) % sides
        c, d = inner_start + i, inner_start + (i + 1) % sides
        faces.append((a, c, d, b))
    for j in range(80):
        for i in range(sides):
            a, b = inner_start + j * sides + i, inner_start + j * sides + (i + 1) % sides
            faces.append((b, a, a + sides, b + sides))
    center = len(vertices)
    vertices.append((0, 0, .235))
    last = inner_start + 80 * sides
    for i in range(sides):
        faces.append((center, last + i, last + (i + 1) % sides))
    mesh = bpy.data.meshes.new('Stoneware source cage')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Aster stoneware study', mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    finish(obj, obj.name, ceramic)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'aster-stoneware.glb'), export_format='GLB')


instrument()
vessel()
print('Original gallery fixtures written to', OUT)

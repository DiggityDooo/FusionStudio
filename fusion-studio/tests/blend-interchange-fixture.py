"""Independent authored reference: inactive scene, evaluated stack and morph limits."""
import bpy,json,sys
from pathlib import Path
output=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(location=(1000,1000,1000))
bpy.context.object.name='Inactive occluder'
scene=bpy.data.scenes.new('Author active scene')
bpy.context.window.scene=scene
bpy.ops.mesh.primitive_cube_add(location=(0,0,0))
mesh=bpy.context.object;mesh.name='Mirrored smooth block'
for vertex in mesh.data.vertices:vertex.co.x+=2
mesh.modifiers.new('Authored mirror','MIRROR')
sub=mesh.modifiers.new('Authored subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
for name,offset,limited in [('Editable shape',6,False),('Bounded shape',10,True)]:
 bpy.ops.mesh.primitive_cube_add(location=(offset,0,0));obj=bpy.context.object;obj.name=name
 obj.shape_key_add(name='Basis');key=obj.shape_key_add(name='Raise');key.data[0].co.z+=1
 if limited:obj.modifiers.new('Retained morph mirror','MIRROR')
bpy.context.view_layer.update()
reference=[]
for obj in scene.objects:
 evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());data=evaluated.to_mesh()
 points=[]
 for vertex in data.vertices:
  p=obj.matrix_world@vertex.co;points.append([p.x,p.z,-p.y])
 reference.append(dict(name=obj.name,triangles=sum(len(p.vertices)-2 for p in data.polygons),points=points))
 evaluated.to_mesh_clear()
(output/'reference.json').write_text(json.dumps(reference))
script=bpy.data.texts.new('source_autoexec.py');script.use_module=True
script.write('from pathlib import Path\nPath('+repr(str(output/'autoexec-ran.txt'))+').write_text("executed")\n')
bpy.ops.wm.save_as_mainfile(filepath=str(output/'active-scene.blend'),check_existing=False)

"""Original bounded panel preparation using the installed Blender UV operators."""
import math
import time
import bpy


def flatten_panels(source):
    start=time.perf_counter();body=None
    convert=lambda p:(p[0],-p[2],p[1])
    if source.get('body'):
        data=bpy.data.meshes.new('Fusion fitting body')
        data.from_pydata([convert(v) for v in source['body']['positions']],[],source['body']['faces']);data.update()
        body=bpy.data.objects.new('Fusion fitting body',data);bpy.context.collection.objects.link(body)
    positions=[None]*len(source['positions']);uvs=[None]*len(positions);reports=[]
    for panel in source['panels']:
        faces=source['faces'][panel['start']:panel['start']+panel['count']]
        indices=sorted({i for face in faces for i in face});lookup={index:i for i,index in enumerate(indices)}
        data=bpy.data.meshes.new('Fusion panel '+panel['id'])
        data.from_pydata([convert(source['positions'][i]) for i in indices],[],[[lookup[i] for i in face] for face in faces]);data.update()
        obj=bpy.data.objects.new('Fusion panel '+panel['id'],data);bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        if body:
            modifier=obj.modifiers.new('Fitted design surface','SHRINKWRAP');modifier.target=body
            modifier.wrap_method='NEAREST_SURFACEPOINT';modifier.wrap_mode='OUTSIDE_SURFACE';modifier.offset=source['offset']
            if 'FINISHED' not in bpy.ops.object.modifier_apply(modifier=modifier.name):raise ValueError('Fitted surface projection did not finish.')
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        props=bpy.ops.uv.unwrap.get_rna_type().properties
        methods={e.identifier for e in props['method'].enum_items}
        if source['method'] not in methods:raise ValueError('The installed Blender does not support '+source['method']+' UV flattening.')
        args={'method':source['method'],'margin':0.0}
        if source['method']=='MINIMUM_STRETCH':
            if 'iterations' not in props or 'no_flip' not in props:raise ValueError('This Blender lacks bounded minimum-stretch flattening. Use a supported method.')
            args.update(iterations=source['iterations'],no_flip=True)
        if 'FINISHED' not in bpy.ops.uv.unwrap(**args):raise ValueError('Panel UV flattening did not finish.')
        bpy.ops.object.mode_set(mode='OBJECT');layer=data.uv_layers.active
        if not layer:raise ValueError('Panel UV flattening returned no coordinates.')
        values=[None]*len(indices);maximum_split=0.0
        for loop in data.loops:
            value=tuple(layer.data[loop.index].uv)
            if values[loop.vertex_index] is not None:maximum_split=max(maximum_split,math.dist(value,values[loop.vertex_index]))
            values[loop.vertex_index]=value
        if any(v is None for v in values) or maximum_split>1e-5:raise ValueError('Panel has internal UV splits or unused vertices; cut a working copy into separate panels.')
        area3d=sum(poly.area for poly in data.polygons);area2d=0.0;signs=[]
        for face in faces:
            a,b,c=[values[lookup[i]] for i in face];signed=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*.5
            if abs(signed)<1e-16:raise ValueError('Panel contains collapsed UV triangles; repair the design surface.')
            signs.append(signed>0);area2d+=abs(signed)
        if area3d<1e-10 or area2d<1e-16 or any(s!=signs[0] for s in signs):raise ValueError('Panel UV triangles flip or have no usable area; cut another seam before flattening.')
        scale=math.sqrt(area3d/area2d);center=[sum(v[a] for v in values)/len(values) for a in range(2)]
        original=[source['grainCoordinates'][i] for i in indices];grain_center=[sum(v[a] for v in original)/len(original) for a in range(2)]
        dot=sum((v[0]-center[0])*(w[0]-grain_center[0])+(v[1]-center[1])*(w[1]-grain_center[1]) for v,w in zip(values,original))
        cross=sum((v[0]-center[0])*(w[1]-grain_center[1])-(v[1]-center[1])*(w[0]-grain_center[0]) for v,w in zip(values,original))
        angle=math.atan2(cross,dot);co=math.cos(angle);si=math.sin(angle)
        for j,index in enumerate(indices):
            point=data.vertices[j].co;positions[index]=[point.x,point.z,-point.y]
            x=(values[j][0]-center[0])*scale;y=(values[j][1]-center[1])*scale;uvs[index]=[co*x-si*y,si*x+co*y]
        reports.append({'id':panel['id'],'vertices':len(indices),'triangles':len(faces),'area3d':area3d,'area2d':area2d*scale*scale,'maximumUvSplit':maximum_split,'flippedTriangles':0})
        print('FUSION_PANEL_FLATTENED '+panel['id'],flush=True)
    return {'version':1,'positions':positions,'uvs':uvs,'panels':reports,'method':source['method'],'iterations':source['iterations'],'milliseconds':(time.perf_counter()-start)*1000,'blender':bpy.app.version_string}

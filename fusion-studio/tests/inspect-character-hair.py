import bpy
import json
from pathlib import Path
directory=Path(__file__).resolve().parents[1]/'test-output/character-packs/hair-inspect'
file=directory/'hair.blend'
with bpy.data.libraries.load(str(file),link=False) as (source,dest):
    dest.node_groups=source.node_groups
    dest.objects=source.objects
report=[]
for group in bpy.data.node_groups:
    report.append({'name':group.name,'nodes':len(group.nodes),'interface':[{'name':i.name,'in_out':i.in_out,'type':i.socket_type} for i in group.interface.items_tree if i.item_type=='SOCKET']})
(directory/'node-inventory.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
objects=[]
for obj in dest.objects:
    if obj:
        objects.append({'name':obj.name,'type':obj.type,'curves':len(obj.data.curves) if obj.type=='CURVES' else None,'modifiers':[{'name':m.name,'type':m.type,'node':m.node_group.name if m.type=='NODES' and m.node_group else None} for m in obj.modifiers],'location':list(obj.location)})
(directory/'object-inventory.json').write_text(json.dumps(objects,indent=2),encoding='utf-8')
print(json.dumps(objects))

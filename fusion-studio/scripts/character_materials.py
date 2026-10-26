"""Translate Fusion's fixed character material description on a job copy."""
import bpy

def apply_character_materials(spec):
    if not spec:
        return {'applied': 0}
    if spec.get('version') != 1 or len(spec.get('materials', [])) > 2048:
        raise ValueError('Unsupported character material sidecar')
    applied = 0
    for record in spec['materials']:
        obj = next((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('fusion_render_object_id') == record['objectId']), None)
        if obj is None:
            continue  # hidden attachments are absent from visible-only exchange
        material = next((m for m in obj.data.materials if m and m.get('fusion_material_id') == record['materialId']), None)
        if material is None:
            raise ValueError('Character render material identity was lost: ' + record['materialId'])
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            raise ValueError('Character material has no supported surface shader')
        kind = record['kind']
        if 'roughness' in record:
            bsdf.inputs['Roughness'].default_value = record['roughness']
        if kind == 'skin':
            bsdf.inputs['Subsurface Weight'].default_value = record.get('subsurface', .12)
            bsdf.inputs['Subsurface Radius'].default_value = (1, .4, .2)
            bsdf.inputs['Subsurface Scale'].default_value = .002
            bsdf.inputs['Specular IOR Level'].default_value = .35
            uv = nodes.new('ShaderNodeTexCoord')
            noise = nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value = 1500
            noise.inputs['Detail'].default_value = 2
            links.new(uv.outputs['UV'], noise.inputs['Vector'])
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = record.get('pores', .35)*.35
            bump.inputs['Distance'].default_value = record.get('displacement', .0002)
            links.new(noise.outputs['Fac'], bump.inputs['Height'])
            normal = bsdf.inputs['Normal']
            if normal.is_linked:
                links.new(normal.links[0].from_socket, bump.inputs['Normal'])
            links.new(bump.outputs['Normal'], normal)
            amount = record.get('freckles', 0)
            if amount > 0:
                spots = nodes.new('ShaderNodeTexVoronoi');spots.inputs['Scale'].default_value = 180
                links.new(uv.outputs['UV'], spots.inputs['Vector'])
                ramp = nodes.new('ShaderNodeValToRGB')
                ramp.color_ramp.elements[0].position = .04 + amount*.05
                ramp.color_ramp.elements[0].color = (.28,.16,.10,1)
                ramp.color_ramp.elements[1].position = .11 + amount*.05
                links.new(spots.outputs['Distance'],ramp.inputs['Fac'])
                mix = nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=amount*.7
                base=bsdf.inputs['Base Color']
                if base.is_linked:links.new(base.links[0].from_socket,mix.inputs[1])
                else:mix.inputs[1].default_value=base.default_value
                links.new(ramp.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],base)
            if obj.get('fusion_creator_part') == 'body':
                modifier=obj.modifiers.new('Fusion character render detail','SUBSURF')
                modifier.levels=1;modifier.render_levels=1
        elif kind == 'cornea':
            bsdf.inputs['Transmission Weight'].default_value=1
            bsdf.inputs['IOR'].default_value=1.376
            bsdf.inputs['Roughness'].default_value=.035
        applied += 1
    return {'applied': applied, 'version': 1, 'preview': 'Three.js approximation; Cycles character materials'}

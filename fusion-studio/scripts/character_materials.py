"""Translate Fusion's fixed character material description on a job copy."""
import bpy
import math
import re

def apply_character_materials(spec):
    if not spec:
        return {'applied': 0}
    if spec.get('version') != 1 or not isinstance(spec.get('materials'), list) or len(spec['materials']) > 2048:
        raise ValueError('Unsupported character material sidecar')
    prepared, seen = [], set()
    for record in spec['materials']:
        if not isinstance(record, dict) or record.get('kind') not in ('skin', 'sclera', 'iris', 'cornea', 'pupil', 'hair', 'brows', 'teeth', 'mouth', 'nails') or any(not isinstance(record.get(k), str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', record[k]) for k in ('objectId', 'materialId')):
            raise ValueError('Invalid character material identity or kind')
        key = (record.get('objectId'), record.get('materialId'))
        if key in seen or record.get('version') != 1 or record.get('appearanceVersion', 1) not in (1, 2):
            raise ValueError('Duplicate or unsupported character material identity/version')
        seen.add(key)
        for name in ('roughness', 'pores', 'freckles', 'ageDetail', 'subsurface', 'grey'):
            value = record.get(name, 0)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError('Invalid character material parameter: ' + name)
        displacement = record.get('displacement', .0002)
        if isinstance(displacement, bool) or not isinstance(displacement, (int, float)) or not math.isfinite(displacement) or not 0 <= displacement <= .005:
            raise ValueError('Invalid skin microdetail scale')
        obj = next((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('fusion_render_object_id') == record['objectId']), None)
        if obj is None:
            continue  # hidden attachments are absent from visible-only exchange
        material = next((m for m in obj.data.materials if m and m.get('fusion_material_id') == record['materialId']), None)
        if material is None:
            raise ValueError('Character render material identity was lost: ' + record['materialId'])
        if not material.use_nodes:
            raise ValueError('Character material has no supported surface shader')
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            raise ValueError('Character material has no supported surface shader')
        prepared.append((record, obj, material, bsdf))
    applied = 0
    for record, obj, material, bsdf in prepared:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        def managed(kind, role):
            existing = next((n for n in nodes if n.get('fusion_character_node') == role), None)
            if existing:
                if existing.bl_idname != kind:
                    raise ValueError('Character shader node identity has an incompatible type')
                return existing
            node = nodes.new(kind);node.label = 'Fusion character ' + role;node['fusion_character_node'] = role
            return node
        kind = record['kind']
        if 'roughness' in record:
            bsdf.inputs['Roughness'].default_value = record['roughness']
        if kind == 'skin':
            bsdf.inputs['Subsurface Weight'].default_value = record.get('subsurface', .12)
            bsdf.inputs['Subsurface Radius'].default_value = (1, .4, .2)
            bsdf.inputs['Subsurface Scale'].default_value = .002
            bsdf.inputs['Specular IOR Level'].default_value = .35
            uv = managed('ShaderNodeTexCoord', 'uv')
            noise = managed('ShaderNodeTexNoise', 'pores');noise.inputs['Scale'].default_value = 1500
            noise.inputs['Detail'].default_value = 2
            links.new(uv.outputs['UV'], noise.inputs['Vector'])
            bump = managed('ShaderNodeBump', 'microdetail')
            bump.inputs['Strength'].default_value = record.get('pores', .35)*.35
            bump.inputs['Distance'].default_value = record.get('displacement', .0002)
            links.new(noise.outputs['Fac'], bump.inputs['Height'])
            normal = bsdf.inputs['Normal']
            if normal.is_linked and normal.links[0].from_node != bump:
                links.new(normal.links[0].from_socket, bump.inputs['Normal'])
            links.new(bump.outputs['Normal'], normal)
            amount = record.get('freckles', 0)
            existing_mix = next((n for n in nodes if n.get('fusion_character_node') == 'freckle-mix'), None)
            if amount > 0 or existing_mix:
                spots = managed('ShaderNodeTexVoronoi', 'freckles');spots.inputs['Scale'].default_value = 180
                links.new(uv.outputs['UV'], spots.inputs['Vector'])
                ramp = managed('ShaderNodeValToRGB', 'freckle-color')
                ramp.color_ramp.elements[0].position = .04 + amount*.05
                ramp.color_ramp.elements[0].color = (.28,.16,.10,1)
                ramp.color_ramp.elements[1].position = .11 + amount*.05
                links.new(spots.outputs['Distance'],ramp.inputs['Fac'])
                mix = managed('ShaderNodeMixRGB', 'freckle-mix');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=amount*.7
                base=bsdf.inputs['Base Color']
                if base.is_linked and base.links[0].from_node != mix:links.new(base.links[0].from_socket,mix.inputs[1])
                elif not base.is_linked:mix.inputs[1].default_value=base.default_value
                links.new(ramp.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],base)
            if obj.get('fusion_creator_part') == 'body':
                modifier=obj.modifiers.get('Fusion character render detail')
                if modifier is None:
                    modifier=obj.modifiers.new('Fusion character render detail','SUBSURF')
                    obj['fusion_character_detail_modifier']=modifier.name;modifier.levels=1;modifier.render_levels=1
        elif kind == 'cornea':
            bsdf.inputs['Transmission Weight'].default_value=1
            bsdf.inputs['IOR'].default_value=1.376
            bsdf.inputs['Roughness'].default_value=record.get('roughness', .025 if record.get('appearanceVersion') == 2 else .035)
        applied += 1
    return {'applied': applied, 'version': 1, 'preview': 'Three.js approximation; Cycles character materials'}

"""Apply Fusion surface descriptions on the job-local Blender copy."""
import bpy

def _in(bsdf, names, value):
    if isinstance(names, str):
        names = (names,)
    for name in names:
        sock = bsdf.inputs.get(name)
        if sock is None:
            continue
        try:
            sock.default_value = value
        except TypeError:
            sock.default_value = value[:len(sock.default_value)] if hasattr(sock.default_value, '__len__') else value
        return True
    return False

def _rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)

def _bsdf(material):
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None) or nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(bsdf.outputs[0], out.inputs['Surface'])
    return bsdf

def _coord(nodes, links, space):
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    source = {'uv':'UV','object':'Object','world':'Generated'}.get(space, 'UV')
    links.new(coord.outputs[source], mapping.inputs['Vector'])
    return mapping.outputs['Vector']

def _noise(nodes, links, vector, scale):
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8
    links.new(vector, noise.inputs['Vector'])
    return noise.outputs['Fac']

def apply_surface(material, spec, obj=None):
    surface = spec.get('override') or spec.get('surface') or {}
    if not surface:
        return
    nodes, links = material.node_tree.nodes, material.node_tree.links
    model = surface.get('model', 'principled')
    out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None) or nodes.new('ShaderNodeOutputMaterial')
    vector = _coord(nodes, links, surface.get('texCoord', 'uv'))
    color = _rgb(surface.get('color', '#bfc8c7'))
    if surface.get('vertexColor'):
        attr = nodes.new('ShaderNodeVertexColor')
        mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
        links.new(attr.outputs['Color'], mix.inputs[1]); mix.inputs[2].default_value = color
        color_socket = mix.outputs[0]
    else:
        color_socket = None
    if surface.get('ao') or surface.get('curvature') or surface.get('weathering'):
        dirty = _noise(nodes, links, vector, 12 + surface.get('weathering', 0) * 40)
        if surface.get('curvature'):
            # Pointiness is a geometry socket on ShaderNodeNewGeometry.
            geo = nodes.new('ShaderNodeNewGeometry')
            crv = nodes.new('ShaderNodeColorRamp')
            links.new(geo.outputs['Pointiness'], crv.inputs['Fac'])
            mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = max(surface.get('curvature', 0), surface.get('weathering', 0), surface.get('ao', 0))
            if color_socket: links.new(color_socket, mix.inputs[1])
            else: mix.inputs[1].default_value = color
            links.new(crv.outputs['Color'], mix.inputs[2])
            color_socket = mix.outputs[0]
        else:
            mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = max(surface.get('ao', 0), surface.get('weathering', 0))
            if color_socket: links.new(color_socket, mix.inputs[1])
            else: mix.inputs[1].default_value = color
            links.new(dirty, mix.inputs[2])
            color_socket = mix.outputs[0]
    if model == 'toon':
        shader = nodes.new('ShaderNodeBsdfToon')
        _in(shader, 'Color', color)
        _in(shader, 'Size', .4)
        _in(shader, 'Smooth', .1)
        if color_socket: links.new(color_socket, shader.inputs['Color'])
        links.new(shader.outputs[0], out.inputs['Surface'])
        # Inverted-hull outline for cel shading.
        if obj is not None and 'Fusion outline' not in obj.modifiers:
            solid = obj.modifiers.new('Fusion outline', 'SOLIDIFY')
            solid.thickness = .004; solid.use_flip_normals = True; solid.material_offset = 1
            outline = bpy.data.materials.new(material.name + ' outline')
            outline.use_nodes = True
            emit = outline.node_tree.nodes.new('ShaderNodeEmission')
            emit.inputs['Color'].default_value = (0, 0, 0, 1)
            outline.node_tree.links.new(emit.outputs[0], outline.node_tree.nodes.get('Material Output').inputs['Surface'])
            if outline.name not in [s.material.name if s.material else '' for s in obj.material_slots]:
                obj.data.materials.append(outline)
        return
    if model == 'hair':
        try:
            shader = nodes.new('ShaderNodeBsdfHairPrincipled')
        except RuntimeError:
            shader = None
        if shader is not None:
            if hasattr(shader, 'parametrization'):
                shader.parametrization = 'COLOR'
            _in(shader, 'Color', color)
            _in(shader, ('Roughness',), surface.get('roughness', .55))
            if color_socket and shader.inputs.get('Color'): links.new(color_socket, shader.inputs['Color'])
            links.new(shader.outputs[0], out.inputs['Surface'])
            return
        surface = {**surface, 'model':'principled', 'anisotropy': max(surface.get('anisotropy', 0), .5)}
    if model == 'volume':
        vol = nodes.new('ShaderNodeVolumePrincipled')
        _in(vol, 'Color', _rgb(surface.get('volumeColor', '#8899aa')))
        _in(vol, 'Density', surface.get('volumeDensity', 1))
        _in(vol, 'Anisotropy', surface.get('volumeAnisotropy', 0))
        _in(vol, 'Emission Strength', surface.get('volumeEmission', 0))
        links.new(vol.outputs[0], out.inputs['Volume'])
        trans = nodes.new('ShaderNodeBsdfTransparent')
        links.new(trans.outputs[0], out.inputs['Surface'])
        return
    if model == 'unlit':
        emit = nodes.new('ShaderNodeEmission')
        _in(emit, 'Color', color)
        if color_socket: links.new(color_socket, emit.inputs['Color'])
        links.new(emit.outputs[0], out.inputs['Surface'])
        return
    bsdf = _bsdf(material)
    _in(bsdf, 'Base Color', color)
    if color_socket and bsdf.inputs.get('Base Color'):
        links.new(color_socket, bsdf.inputs['Base Color'])
    _in(bsdf, 'Roughness', surface.get('roughness', .5))
    _in(bsdf, 'Metallic', surface.get('metalness', 0))
    _in(bsdf, ('Specular IOR Level', 'Specular'), surface.get('specular', .5))
    _in(bsdf, ('Specular Tint',), _rgb(surface.get('specularColor', '#ffffff')))
    _in(bsdf, 'IOR', surface.get('ior', 1.5))
    _in(bsdf, ('Transmission Weight', 'Transmission'), surface.get('transmission', 0))
    _in(bsdf, ('Coat Weight', 'Clearcoat'), surface.get('clearcoat', 0))
    _in(bsdf, ('Coat Roughness', 'Clearcoat Roughness'), surface.get('clearcoatRoughness', .03))
    _in(bsdf, ('Sheen Weight', 'Sheen'), surface.get('sheen', 0))
    _in(bsdf, 'Sheen Roughness', surface.get('sheenRoughness', .5))
    _in(bsdf, ('Sheen Tint',), _rgb(surface.get('sheenColor', '#ffffff')))
    _in(bsdf, ('Anisotropic',), surface.get('anisotropy', 0))
    _in(bsdf, ('Anisotropic Rotation',), surface.get('anisotropyRotation', 0))
    _in(bsdf, ('Subsurface Weight', 'Subsurface'), surface.get('subsurface', 0))
    _in(bsdf, 'Subsurface Radius', (*_rgb(surface.get('subsurfaceColor', '#e2b89a'))[:3],))
    _in(bsdf, 'Subsurface Scale', surface.get('subsurfaceScale', .002))
    _in(bsdf, ('Thin Film Thickness', 'Iridescence'), surface.get('iridescence', 0) * surface.get('iridescenceThickness', 400) if surface.get('iridescence') else 0)
    _in(bsdf, ('Thin Film IOR', 'Iridescence IOR'), surface.get('iridescenceIOR', 1.3))
    _in(bsdf, ('Emission Color', 'Emission'), _rgb(surface.get('emission', '#000000')))
    _in(bsdf, 'Emission Strength', surface.get('emissionIntensity', 0))
    _in(bsdf, 'Alpha', surface.get('opacity', 1))
    material.blend_method = {'opaque':'OPAQUE','blend':'BLEND','mask':'CLIP'}.get(surface.get('alphaMode', 'opaque'), 'OPAQUE')
    if hasattr(material, 'shadow_method') and material.blend_method != 'OPAQUE':
        material.shadow_method = 'CLIP' if surface.get('alphaMode') == 'mask' else 'HASHED'
    if surface.get('translucent', 0) > 0:
        trans = nodes.new('ShaderNodeBsdfTranslucent')
        _in(trans, 'Color', _rgb(surface.get('subsurfaceColor', surface.get('color', '#bfc8c7'))))
        mix = nodes.new('ShaderNodeMixShader')
        mix.inputs[0].default_value = surface['translucent']
        links.new(bsdf.outputs[0], mix.inputs[1]); links.new(trans.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], out.inputs['Surface'])
    if surface.get('volumeDensity', 0) > 0:
        vol = nodes.new('ShaderNodeVolumePrincipled')
        _in(vol, 'Color', _rgb(surface.get('volumeColor', '#8899aa')))
        _in(vol, 'Density', surface['volumeDensity'])
        _in(vol, 'Anisotropy', surface.get('volumeAnisotropy', 0))
        _in(vol, 'Emission Strength', surface.get('volumeEmission', 0))
        links.new(vol.outputs[0], out.inputs['Volume'])
    if surface.get('displacement', 0) > 0:
        bump = nodes.new('ShaderNodeBump' if surface.get('displacementMode') != 'vector' else 'ShaderNodeDisplacement')
        height = _noise(nodes, links, vector, 40)
        if bump.type == 'BUMP':
            bump.inputs['Strength'].default_value = surface['displacement']
            links.new(height, bump.inputs['Height'])
            if bsdf.inputs.get('Normal'):
                links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        else:
            bump.inputs['Scale'].default_value = surface['displacement'] * .05
            links.new(height, bump.inputs['Height'])
            links.new(bump.outputs[0], out.inputs['Displacement'])
            material.cycles.displacement_method = 'DISPLACEMENT' if surface.get('displacementMode') == 'micro' else 'BOTH'
    if surface.get('layerPreset', 'none') != 'none' and surface.get('layerMix', 0) > 0:
        layer = nodes.new('ShaderNodeBsdfPrincipled')
        dirt = {'dirt': (.12, .09, .06, 1), 'rust': (.45, .18, .06, 1), 'dust': (.55, .5, .4, 1)}[surface['layerPreset']]
        _in(layer, 'Base Color', dirt); _in(layer, 'Roughness', .9)
        mix = nodes.new('ShaderNodeMixShader')
        mix.inputs[0].default_value = surface['layerMix']
        fac = _noise(nodes, links, vector, 18)
        links.new(fac, mix.inputs[0])
        surface_in = out.inputs['Surface']
        if surface_in.is_linked:
            links.new(surface_in.links[0].from_socket, mix.inputs[1])
        else:
            links.new(bsdf.outputs[0], mix.inputs[1])
        links.new(layer.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], surface_in)
    if surface.get('shaderLanguage') == 'osl':
        script = nodes.new('ShaderNodeScript')
        script.mode = 'INTERNAL'
        text = bpy.data.texts.new(material.name + ' osl')
        text.write(
            'shader fusion_surface(color BaseColor = color(0.8), float Roughness = 0.5, float Metallic = 0.0, output closure color BSDF = 0) {\n'
            '    BSDF = mix(BaseColor * diffuse(N), microfacet_ggx(N, Roughness), Metallic);\n}\n'
        )
        script.script = text
    if surface.get('texCoord') == 'world' and material.node_tree:
        # Generated/object coordinates already wired through _coord.
        pass

def apply_ray_visibility(obj, flags):
    if not flags:
        return
    mapping = {'camera':'visible_camera','diffuse':'visible_diffuse','glossy':'visible_glossy','transmission':'visible_transmission','volumeScatter':'visible_volume_scatter','shadow':'visible_shadow'}
    for key, prop in mapping.items():
        if hasattr(obj, prop):
            setattr(obj, prop, flags.get(key, True))

def apply_surface_materials(spec):
    if not spec:
        return {'applied': 0}
    if spec.get('version') != 1 or len(spec.get('materials', [])) > 4096:
        raise ValueError('Unsupported surface material sidecar')
    applied = 0
    for record in spec['materials']:
        obj = next((o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.get('fusion_render_object_id') == record['objectId'] or o.get('fusion_id') == record['objectId'])), None)
        if obj is None:
            continue
        apply_ray_visibility(obj, record.get('rayVisibility'))
        material = None
        for slot in obj.material_slots:
            if slot.material and slot.material.get('fusion_material_id') == record['materialId']:
                material = slot.material
                break
        if material is None and obj.data.materials:
            material = obj.data.materials[0]
        if material is None:
            material = bpy.data.materials.new('Fusion surface')
            obj.data.materials.append(material)
        material.use_nodes = True
        apply_surface(material, record, obj)
        applied += 1
    return {'applied': applied, 'version': 1}

def shader_bake(obj, options):
    bake_type = {'Combined':'COMBINED','Diffuse':'DIFFUSE','Emit':'EMIT','AO':'AO','Normal':'NORMAL','Roughness':'ROUGHNESS','Glossy':'GLOSSY'}[options['type']]
    size = int(options.get('size', 1024))
    if not obj.data.uv_layers:
        raise ValueError('Shader baking needs UV coordinates.')
    if not obj.data.materials:
        mat = bpy.data.materials.new('Fusion bake')
        mat.use_nodes = True
        obj.data.materials.append(mat)
    mat = obj.data.materials[0]
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    img = bpy.data.images.new('Fusion bake', width=size, height=size, alpha=True)
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    for n in nodes:
        n.select = False
    tex.select = True
    nodes.active = tex
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = max(8, min(64, int(options.get('samples', 16))))
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type=bake_type, margin=4, use_clear=True)
    # Export the bake through glTF as the base-colour map.
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf and bsdf.inputs['Base Color'].is_linked:
        for link in list(bsdf.inputs['Base Color'].links):
            mat.node_tree.links.remove(link)
    if bsdf:
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return {'type': bake_type, 'size': size, 'image': img.name}

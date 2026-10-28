"""Restore Three.js EXT_materials_bump on imported Fusion job copies.

Only embedded PNG/JPEG resources and explicit Fusion material identities are
accepted. No asset path, script, material-name guess or vendor file is executed.
"""
import base64
import hashlib
import json
import math
import re
import struct
import tempfile
from pathlib import Path

EXTENSION = 'EXT_materials_bump'
LIMITS = {'json': 32 * 1024 * 1024, 'file': 512 * 1024 * 1024,
          'image': 8 * 1024 * 1024, 'pixels': 16 * 1024 * 1024, 'total_pixels': 32 * 1024 * 1024}


def _integer(value, limit, label):
    if type(value) is not int or not 0 <= value < limit:
        raise ValueError('Invalid bump ' + label)
    return value


def _finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def _document(file):
    path = Path(file)
    if path.suffix.lower() not in ('.glb', '.gltf'):
        return None, None
    size = path.stat().st_size
    if size > LIMITS['file']:
        raise ValueError('Bump input exceeds the bounded GLB size')
    if path.suffix.lower() == '.gltf':
        if size > LIMITS['json']:
            raise ValueError('Bump glTF metadata exceeds 32 MiB')
        return json.loads(path.read_bytes()), None
    with path.open('rb') as stream:
        header = stream.read(12)
        if len(header) != 12 or struct.unpack('<3I', header) != (0x46546c67, 2, size):
            raise ValueError('Invalid bump GLB header')
        document, binary, at = None, None, 12
        while at < size:
            chunk = stream.read(8)
            if len(chunk) != 8:
                raise ValueError('Truncated bump GLB chunk')
            length, kind = struct.unpack('<2I', chunk)
            at += 8
            if length % 4 or length > size - at:
                raise ValueError('Invalid bump GLB chunk bounds')
            if kind == 0x4e4f534a:
                if document is not None or length > LIMITS['json'] or at != 20:
                    raise ValueError('Invalid bump GLB metadata')
                document = json.loads(stream.read(length))
            elif kind == 0x004e4942:
                if binary is not None:
                    raise ValueError('Duplicate bump binary chunk')
                binary = stream.read(length)
            else:
                stream.seek(length, 1)
            at += length
        if document is None:
            raise ValueError('Missing bump GLB metadata')
        return document, binary


def _image_size(data, mime):
    if mime == 'image/png':
        if len(data) < 33 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
            raise ValueError('Invalid embedded bump PNG')
        return struct.unpack('>2I', data[16:24])
    if mime == 'image/jpeg' and data[:2] == b'\xff\xd8':
        at = 2
        while at < len(data):
            if data[at] != 255:
                raise ValueError('Invalid embedded bump JPEG marker')
            while at < len(data) and data[at] == 255:
                at += 1
            if at >= len(data):
                break
            marker = data[at]
            at += 1
            if marker in (1, 0xd8, 0xd9) or 0xd0 <= marker <= 0xd7:
                continue
            if at + 2 > len(data):
                break
            length = int.from_bytes(data[at:at+2], 'big')
            if length < 2 or at + length > len(data):
                break
            if marker in (0xc0, 0xc1, 0xc2) and length >= 8:
                return int.from_bytes(data[at+5:at+7], 'big'), int.from_bytes(data[at+3:at+5], 'big')
            at += length
    raise ValueError('Unsupported or malformed embedded bump image')


def bump_plan(file):
    document, binary = _document(file)
    plan = {'version': 1, 'materials': [], 'images': {}, 'warnings': []}
    if document is None:
        return plan
    seen, pixels = set(), 0
    for material in document.get('materials', []):
        extension = material.get('extensions', {}).get(EXTENSION)
        if extension is None:
            continue
        if not isinstance(extension, dict):
            raise ValueError('Invalid bump material extension')
        identity = material.get('extras', {}).get('fusion_material_id')
        if not isinstance(identity, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', identity):
            plan['warnings'].append('Bump material lacks an explicit Fusion identity; preserve the original or import it through the Fusion editor first.')
            continue
        if identity in seen or len(seen) >= 256:
            raise ValueError('Duplicate or excessive bump material identities')
        seen.add(identity)
        factor = extension.get('bumpFactor', 1)
        if not _finite(factor) or abs(factor) > 10:
            raise ValueError('Invalid bump factor')
        texture = extension.get('bumpTexture')
        if texture is None:
            continue
        if material.get('normalTexture') is not None:
            plan['warnings'].append('Blender retains both normal and bump layers; the source preview may give its normal map precedence. Inspect shading before relying on parity.')
        if not isinstance(texture, dict):
            raise ValueError('Invalid bump texture binding')
        textures, images = document.get('textures', []), document.get('images', [])
        tex = textures[_integer(texture.get('index'), len(textures), 'texture index')]
        image = images[_integer(tex.get('source'), len(images), 'image index')]
        transform = texture.get('extensions', {}).get('KHR_texture_transform', {})
        if not isinstance(transform, dict):
            raise ValueError('Invalid bump UV transform')
        offset, scale, rotation = transform.get('offset', [0, 0]), transform.get('scale', [1, 1]), transform.get('rotation', 0)
        if any(not isinstance(v, list) or len(v) != 2 or not all(_finite(n) and abs(n) <= 10000 for n in v) for v in (offset, scale)) or not _finite(rotation) or abs(rotation) > 10000:
            raise ValueError('Invalid bump UV transform values')
        channel = _integer(transform.get('texCoord', texture.get('texCoord', 0)), 4, 'UV channel')
        sampler = document.get('samplers', [])[_integer(tex['sampler'], len(document.get('samplers', [])), 'sampler index')] if 'sampler' in tex else {}
        wrap = [sampler.get('wrapS', 10497), sampler.get('wrapT', 10497)]
        if any(v not in (10497, 33071, 33648) for v in wrap) or sampler.get('magFilter', 9729) not in (9728, 9729):
            raise ValueError('Unsupported bump sampler')
        mime = image.get('mimeType')
        if 'bufferView' in image:
            views = document.get('bufferViews', [])
            view = views[_integer(image['bufferView'], len(views), 'buffer view')]
            offset_bytes, length = view.get('byteOffset', 0), view.get('byteLength')
            if view.get('buffer', 0) != 0 or binary is None or type(offset_bytes) is not int or type(length) is not int or offset_bytes < 0 or not 0 < length <= LIMITS['image'] or offset_bytes + length > len(binary):
                raise ValueError('Invalid embedded bump buffer bounds')
            data = binary[offset_bytes:offset_bytes+length]
        else:
            uri = image.get('uri', '')
            match = re.fullmatch(r'data:(image/(?:png|jpeg));base64,([a-zA-Z0-9+/=\r\n]+)', uri) if isinstance(uri, str) and len(uri) <= LIMITS['image'] * 4 // 3 + 128 else None
            if not match:
                plan['warnings'].append('Bump image is external or unsupported; embed PNG/JPEG resources in GLB for this adapter.')
                continue
            mime = match[1]
            data = base64.b64decode(match[2], validate=True)
        if mime not in ('image/png', 'image/jpeg') or len(data) > LIMITS['image']:
            raise ValueError('Unsupported or oversized embedded bump image')
        width, height = _image_size(data, mime)
        if width < 1 or height < 1 or width * height > LIMITS['pixels']:
            raise ValueError('Embedded bump image exceeds the 16-megapixel limit')
        digest = hashlib.sha256(data).hexdigest()
        if digest not in plan['images']:
            pixels += width * height
            if pixels > LIMITS['total_pixels']:
                raise ValueError('Combined bump images exceed the 32-megapixel budget')
            plan['images'][digest] = {'bytes': data, 'mime': mime, 'width': width, 'height': height}
        plan['materials'].append({'identity': identity, 'factor': factor, 'image': digest, 'channel': channel, 'offset': offset, 'scale': scale, 'rotation': rotation, 'wrap': wrap, 'filter': sampler.get('magFilter', 9729)})
    if plan['warnings'] and EXTENSION in document.get('extensionsRequired', []):
        raise ValueError('Required bump data cannot be restored: ' + plan['warnings'][0])
    plan['warnings'] = list(dict.fromkeys(plan['warnings']))
    return plan


def uv_transform(record):
    sx, sy = record['scale']
    angle = record['rotation']
    # Blender uses (u,1-v). Conjugate the authored glTF transform by that flip.
    return {'location': (record['offset'][0] - sy * math.sin(angle), 1 - record['offset'][1] - sy * math.cos(angle), 0), 'rotation': (0, 0, -angle), 'scale': (sx, sy, 1)}


def apply_bump_plan(plan, materials):
    import bpy
    report = {'version': 1, 'applied': 0, 'images': 0, 'warnings': list(plan['warnings'])}
    if not plan['materials']:
        report['complete'] = not report['warnings']
        return report
    resolved = []
    for record in plan['materials']:
        targets = [m for m in materials if m.get('fusion_material_id') == record['identity']]
        if not targets:
            raise ValueError('Bump material identity was lost: ' + record['identity'])
        for material in targets:
            bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if material.use_nodes else None
            if bsdf is None:
                raise ValueError('Bump material has no supported surface shader')
            uv_name = 'UVMap' if record['channel'] == 0 else 'UVMap.%03d' % record['channel']
            users = [o for o in bpy.context.scene.objects if o.type == 'MESH' and material in list(o.data.materials)]
            if any(uv_name not in obj.data.uv_layers for obj in users):
                raise ValueError('Bump texture needs the missing UV set: ' + uv_name)
            resolved.append((record, material, bsdf))
    decoded = {}
    with tempfile.TemporaryDirectory(prefix='fusion-bump-') as folder:
        for digest, source in plan['images'].items():
            existing = next((i for i in bpy.data.images if i.get('fusion_bump_sha256') == digest and i.colorspace_settings.name == 'Non-Color'), None)
            if existing:
                decoded[digest] = existing
                continue
            file = Path(folder) / (digest + ('.png' if source['mime'] == 'image/png' else '.jpg'))
            file.write_bytes(source['bytes'])
            image = bpy.data.images.load(str(file), check_existing=False)
            if tuple(image.size) != (source['width'], source['height']):
                raise ValueError('Bump image decoder dimensions do not match the validated resource')
            image.colorspace_settings.name = 'Non-Color'
            image.pack()
            image['fusion_bump_sha256'] = digest
            decoded[digest] = image
    for record, material, bsdf in resolved:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        owned = [n for n in nodes if n.get('fusion_bump_owner') == record['identity']]
        old = next((n for n in owned if n.type == 'BUMP'), None)
        source = old.inputs['Normal'].links[0].from_socket if old and old.inputs['Normal'].is_linked else None
        targets = [link.to_socket for link in old.outputs['Normal'].links if link.to_node not in owned] if old else [bsdf.inputs['Normal']]
        if old is None and bsdf.inputs['Normal'].is_linked:
            source = bsdf.inputs['Normal'].links[0].from_socket
        for node in owned:
            nodes.remove(node)
        def node(kind, label):
            item = nodes.new(kind);item.label = label;item['fusion_bump_owner'] = record['identity'];return item
        uv = node('ShaderNodeUVMap', 'Fusion bump UV')
        uv.uv_map = 'UVMap' if record['channel'] == 0 else 'UVMap.%03d' % record['channel']
        mapping = node('ShaderNodeMapping', 'Fusion bump transform')
        transformed = uv_transform(record)
        for key, socket in (('location', 'Location'), ('rotation', 'Rotation'), ('scale', 'Scale')):
            mapping.inputs[socket].default_value = transformed[key]
        links.new(uv.outputs['UV'], mapping.inputs['Vector'])
        texture = node('ShaderNodeTexImage', 'Fusion embedded bump')
        texture.image = decoded[record['image']]
        texture.interpolation = 'Closest' if record['filter'] == 9728 else 'Linear'
        if record['wrap'][0] == record['wrap'][1] and record['wrap'][0] in (10497, 33071):
            texture.extension = 'REPEAT' if record['wrap'][0] == 10497 else 'EXTEND'
            links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        else:
            separate = node('ShaderNodeSeparateXYZ', 'Fusion bump wrap axes')
            combine = node('ShaderNodeCombineXYZ', 'Fusion bump wrapped UV')
            links.new(mapping.outputs['Vector'], separate.inputs[0])
            for axis, wrap in enumerate(record['wrap']):
                current = separate.outputs[axis]
                def math_node(operation, value=None):
                    nonlocal current
                    item = node('ShaderNodeMath', 'Fusion bump wrap');item.operation = operation
                    links.new(current, item.inputs[0])
                    if value is not None:item.inputs[1].default_value = value
                    current = item.outputs[0]
                if wrap == 10497:math_node('FRACT')
                elif wrap == 33071:math_node('MAXIMUM', 0);math_node('MINIMUM', 1)
                else:math_node('FLOORED_MODULO', 2);math_node('SUBTRACT', 1);math_node('ABSOLUTE');math_node('MULTIPLY', -1);math_node('ADD', 1)
                links.new(current, combine.inputs[axis])
            texture.extension = 'EXTEND'
            links.new(combine.outputs[0], texture.inputs['Vector'])
            report['warnings'].append('Mixed/mirrored UV wrapping uses explicit coordinates; border filtering may differ from the source renderer.')
        red = node('ShaderNodeSeparateColor', 'Fusion bump red channel');red.mode = 'RGB'
        links.new(texture.outputs['Color'], red.inputs[0])
        bump = node('ShaderNodeBump', 'Fusion bump height');bump.invert = record['factor'] < 0
        bump.inputs['Strength'].default_value = 1;bump.inputs['Distance'].default_value = abs(record['factor'])
        links.new(red.outputs['Red'], bump.inputs['Height'])
        if source:links.new(source, bump.inputs['Normal'])
        for target in targets:links.new(bump.outputs['Normal'], target)
        material['fusion_bump_import'] = json.dumps({k: v for k, v in record.items()}, allow_nan=False)
        report['applied'] += 1
    report['images'] = len(decoded)
    report['warnings'] = list(dict.fromkeys(report['warnings']))
    report['complete'] = not report['warnings']
    return report

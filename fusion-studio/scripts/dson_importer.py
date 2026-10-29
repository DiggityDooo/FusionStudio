"""Read-only DSON subset importer for Fusion Studio; no DAZ process or CMS.

preflight_dson works in ordinary Python. import_dson requires Blender's bpy.
Implemented from the public DSON specification, not recovered vendor code.
See research/dson-support.md for scope, units, provenance and known omissions.
"""
from __future__ import annotations

import copy
import gzip
import hashlib
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote


class DsonImportError(ValueError):
    def __init__(self, message, report=None):
        super().__init__(message)
        self.report = report


def _values(value):
    return value.get('values', []) if isinstance(value, dict) else (value or [])


def _number(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, dict):
        return _number(value.get('current_value', value.get('value', default)), default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise DsonImportError('Expected a finite numeric channel value')
    return float(value)


def _xyz(value, default=0.0):
    if isinstance(value, dict):
        return tuple(_number(value.get(k), default) for k in 'xyz')
    if not value:
        return (default,) * 3
    if len(value) != 3:
        raise DsonImportError('A vector must have three components')
    if isinstance(value[0], dict):
        channels = {str(c.get('id', '')).lower(): c for c in value}
        return tuple(_number(channels.get(k), default) for k in 'xyz')
    return tuple(_number(v, default) for v in value)


def _point(value):
    x, y, z = _xyz(value)
    return (0.01*x, -0.01*z, 0.01*y)


def _fragment(uri):
    return unquote(str(uri).split('#', 1)[-1].split('?', 1)[0])


def _merge(base, override):
    result = copy.deepcopy(base)
    for key, value in override.items():
        if key == 'id':
            continue
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


class _Reader:
    def __init__(self, source, roots, options):
        self.source = Path(source).expanduser().resolve(strict=True)
        if not self.source.is_file() or self.source.suffix.lower() not in ('.duf', '.dsf'):
            raise DsonImportError('Source must be an existing DUF or DSF file')
        self.roots = [Path(r).expanduser().resolve(strict=True) for r in roots]
        if not self.roots or any(not r.is_dir() for r in self.roots):
            raise DsonImportError('Explicit existing content root directories are required')
        self.options = options
        self.cache = {}
        self.dependencies = {}
        self.warnings = []
        self.errors = []
        self.unsupported = set()
        self._warned = set()
        self.byte_limit = int(options.get('max_file_bytes', 128*1024*1024))
        self.total_limit = int(options.get('max_total_bytes', 512*1024*1024))
        self.total_bytes = 0

    def warning(self, code, message, path=''):
        key = (code, message, str(path))
        if key not in self._warned:
            self._warned.add(key)
            self.warnings.append({'code': code, 'message': message, 'path': str(path)})

    def unsupported_field(self, field, message, path=''):
        self.unsupported.add(field)
        self.warning('unsupported', message, path)

    def _allowed(self, path):
        return path == self.source or any(path.is_relative_to(r) for r in self.roots)

    def file(self, uri, current):
        raw = str(uri)
        path_part = raw.split('#', 1)[0].split('?', 1)[0]
        # Common DSON node-relative prefix (Genesis9:/data/... or hip:#id).
        if ':' in path_part:
            prefix, remainder = path_part.split(':', 1)
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_ .-]*', prefix) or prefix.lower() in ('http', 'https', 'file', 'data', 'ftp') or remainder.startswith('//') or len(prefix) == 1:
                raise DsonImportError('Unsupported external/drive URI: ' + raw)
            path_part = remainder
        decoded = unquote(path_part)
        if any(c in decoded for c in ('\x00', ':', '\\')) or decoded.startswith('//'):
            raise DsonImportError('Unsafe or unsupported asset path: ' + raw)
        if not decoded:
            candidate = Path(current).resolve(strict=True)
            if self._allowed(candidate):
                return candidate
            raise DsonImportError('Reference outside content roots')
        if decoded.startswith('/'):
            candidates = [r / decoded.lstrip('/') for r in self.roots]
        else:
            candidates = [Path(current).parent / decoded] + [r / decoded for r in self.roots]
        for candidate in candidates:
            candidate = candidate.resolve(strict=False)
            if candidate.is_file() and self._allowed(candidate):
                self.dependencies.setdefault(str(candidate), {'path': str(candidate), 'kind': 'resource'})
                return candidate
        raise DsonImportError('Missing or disallowed referenced file: ' + raw)

    def document(self, path):
        path = Path(path).resolve(strict=True)
        if not self._allowed(path):
            raise DsonImportError('Document outside explicit source/content roots')
        if path in self.cache:
            return self.cache[path]
        if len(self.cache) >= int(self.options.get('max_documents', 1024)):
            raise DsonImportError('DSON dependency document limit exceeded')
        if path.stat().st_size > self.byte_limit:
            raise DsonImportError('DSON file exceeds configured byte limit')
        raw = path.read_bytes()
        if raw[:2] == b'\x1f\x8b':
            import io
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
                data = stream.read(self.byte_limit+1)
        else:
            data = raw
        if len(data) > self.byte_limit:
            raise DsonImportError('Expanded DSON file exceeds configured byte limit')
        self.total_bytes += len(data)
        if self.total_bytes > self.total_limit:
            raise DsonImportError('Expanded DSON dependency budget exceeded')
        def invalid_constant(v):
            raise DsonImportError('Non-finite JSON number: ' + v)
        obj = json.loads(data.decode('utf-8-sig'), parse_constant=invalid_constant)
        if not isinstance(obj, dict):
            raise DsonImportError('DSON document must be a JSON object')
        self.cache[path] = obj
        self.dependencies[str(path)] = {'path': str(path), 'kind': 'dson', 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
        return obj

    def asset(self, uri, current, library):
        path = self.file(uri, current)
        doc = self.document(path)
        ident = _fragment(uri) if '#' in str(uri) else None
        items = doc.get(library, [])
        matches = [v for v in items if ident is None or str(v.get('id')) == ident]
        if len(matches) != 1:
            raise DsonImportError('Asset not found or ambiguous in ' + library + ': ' + str(uri))
        return path, matches[0]


def _channels(material):
    result = {}
    for key, value in material.items():
        if isinstance(value, dict) and isinstance(value.get('channel'), dict):
            result[value['channel'].get('id', key)] = value['channel']
    for extra in material.get('extra', []):
        for item in extra.get('channels', []):
            channel = item.get('channel', {})
            result[channel.get('id', '')] = channel
    return result


def _material_plan(reader, source_doc, mesh):
    materials = {name: {'name': name, 'color': [0.65, 0.65, 0.65, 1], 'roughness': 0.5, 'metallic': 0.0, 'texture': None} for name in mesh['groups']}
    scene_materials = source_doc.get('scene', {}).get('materials', [])
    uv_uri = mesh['geometry'].get('default_uv_set')
    uv_doc = mesh['geometry_path']
    uv_choices = set()
    for instance in scene_materials:
        target = _fragment(instance.get('geometry', ''))
        if target and target not in (mesh['instance_id'], mesh['geometry']['id']):
            continue
        try:
            mat_path, definition = reader.asset(instance['url'], reader.source, 'material_library')
        except (DsonImportError, KeyError) as e:
            reader.warning('material_definition', str(e), mesh['label'])
            mat_path, definition = reader.source, {}
        channels = _channels(definition)
        channels.update(_channels(instance))
        base = channels.get('Base Color', channels.get('diffuse', {}))
        color = base.get('current_value', base.get('value', [0.65]*3))
        if not isinstance(color, (list, tuple)) or len(color) not in (3, 4):
            color = [0.65]*3
        color = [_number(v) for v in color[:3]] + [1.0]
        image_uri = base.get('image_file')
        texture = None
        if image_uri:
            try:
                texture = str(reader.file(image_uri, mat_path))
            except DsonImportError as e:
                reader.warning('missing_texture', str(e), mesh['label'])
        elif base.get('image'):
            reader.unsupported_field('image_library_indirection', 'Indirect image library references are not translated; diffuse color is retained.', mesh['label'])
        item = {'name': '', 'color': color, 'texture': texture, 'roughness': _number(channels.get('Glossy Roughness', channels.get('roughness')), 0.5), 'metallic': _number(channels.get('Metallic Weight'), 0.0)}
        opacity = channels.get('Cutout Opacity', channels.get('opacity'))
        if opacity:
            item['color'][3] = _number(opacity, 1.0)
            if opacity.get('image_file'):
                reader.unsupported_field('opacity_texture', 'Opacity texture is not translated; scalar opacity is retained.', mesh['label'])
        for group in instance.get('groups', []):
            if group in materials:
                materials[group] = dict(item, name=group)
        for extra in definition.get('extra', []) + instance.get('extra', []):
            kind = str(extra.get('type', ''))
            if kind.startswith('studio/material/'):
                reader.unsupported_field('vendor_shader:'+kind, 'Vendor shader is approximated with Principled diffuse/roughness/metallic; renderer-specific layers are omitted.', mesh['label'])
        if instance.get('uv_set'):
            uv_choices.add(instance['uv_set'])
            uv_uri, uv_doc = instance['uv_set'], reader.source
    if len(uv_choices) > 1:
        reader.unsupported_field('multiple_material_uv_sets', 'Different per-material UV sets are present; the final declared set is used.', mesh['label'])
    mesh['materials'] = [materials[g] for g in mesh['groups']]
    mesh['uvs'], mesh['uv_overrides'] = [], {}
    if uv_uri:
        try:
            _, uv = reader.asset(uv_uri, uv_doc, 'uv_set_library')
            if int(uv.get('vertex_count', len(mesh['vertices']))) != len(mesh['vertices']):
                raise DsonImportError('UV vertex count does not match base geometry')
            mesh['uvs'] = [tuple(_number(v) for v in row) for row in _values(uv.get('uvs'))]
            if any(len(row) != 2 for row in mesh['uvs']):
                raise DsonImportError('UV data must have two coordinates')
            for row in _values(uv.get('polygon_vertex_indices')):
                if len(row) != 3:
                    raise DsonImportError('Malformed UV seam override')
                polygon, vertex, index = (int(v) for v in row)
                if not (0 <= polygon < len(mesh['faces']) and vertex in mesh['faces'][polygon] and 0 <= index < len(mesh['uvs'])):
                    raise DsonImportError('UV seam override index outside geometry/UV array')
                mesh['uv_overrides'][(polygon, vertex)] = index
            for pi, face in enumerate(mesh['faces']):
                for vi in face:
                    ui = mesh['uv_overrides'].get((pi, vi), vi)
                    if not (0 <= ui < len(mesh['uvs'])):
                        raise DsonImportError('Missing primary UV for geometry vertex')
        except (DsonImportError, ValueError, TypeError) as e:
            reader.warning('uv_skipped', str(e), mesh['label'])
            mesh['uvs'], mesh['uv_overrides'] = [], {}


def _make_plan(source_path, content_roots, options=None):
    options = dict(options or {})
    content_roots = list(content_roots or [])
    report = {'schema_version': 1, 'ok': False, 'source': str(source_path), 'content_roots': [str(r) for r in content_roots], 'coordinate_conversion': 'DSON centimeters Y-up -> Blender meters Z-up: (x,-z,y)/100', 'meshes': [], 'properties': [], 'warnings': [], 'errors': [], 'unsupported_fields': [], 'dependencies': []}
    meshes = []
    try:
        reader = _Reader(source_path, content_roots, options)
        doc = reader.document(reader.source)
        report['source'] = str(reader.source)
        report['format_version'] = doc.get('file_version')
        scene = doc.get('scene', {})
        scene_nodes = scene.get('nodes', [])
        if not scene_nodes and doc.get('geometry_library'):
            defs = doc.get('node_library', [])
            for geometry in doc['geometry_library']:
                skin = next((m.get('skin') for m in doc.get('modifier_library', []) if m.get('skin', {}).get('geometry') == '#'+geometry['id']), None)
                node_id = _fragment(skin['node']) if skin else next((n['id'] for n in defs if n.get('type') == 'figure'), next((n['id'] for n in defs if n.get('type') != 'bone' and not n.get('parent')), 'DSON'))
                scene_nodes.append({'id': node_id, 'url': '#'+node_id, 'geometries': [{'id': geometry['id'], 'url': '#'+geometry['id']}]})
        for node_instance in scene_nodes:
            if not node_instance.get('geometries'):
                continue
            try:
                node_path, node_def = reader.asset(node_instance['url'], reader.source, 'node_library')
            except (DsonImportError, KeyError) as e:
                reader.warning('node_definition', str(e), node_instance.get('id', ''))
                node_path, node_def = reader.source, {'id': node_instance.get('id', 'root'), 'type': 'node'}
            node = _merge(node_def, node_instance)
            node['id'] = node_instance['id']
            if node_def.get('source'):
                reader.unsupported_field('asset_derivation', 'Derived node source inheritance is not resolved; explicit definition fields are imported.', node['id'])
            if node.get('rotation_order', 'XYZ') not in ('XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'):
                raise DsonImportError('Invalid node rotation order')
            for key in ('translation', 'rotation', 'scale', 'center_point', 'end_point', 'orientation'):
                _xyz(node.get(key), 1.0 if key == 'scale' else 0.0)
            _number(node.get('general_scale'), 1.0)
            for key in ('parent', 'parent_in_place', 'conform_target'):
                if node_instance.get(key):
                    reader.unsupported_field(key, 'Scene parenting/conforming is not reconstructed; this mesh uses its own root transform.', node['id'])
            for geom_instance in node_instance['geometries']:
                gp, gd = reader.asset(geom_instance['url'], reader.source, 'geometry_library')
                geometry = _merge(gd, geom_instance)
                if geometry.get('source'):
                    reader.unsupported_field('asset_derivation', 'Derived geometry source inheritance is not resolved; explicit topology is imported.', node['id'])
                vertices = [_xyz(v) for v in _values(geometry.get('vertices'))]
                if not vertices or len(vertices) > int(options.get('max_vertices', 2000000)):
                    raise DsonImportError('Geometry is empty or exceeds configured vertex limit')
                faces, indices, face_group_indices = [], [], []
                groups = list(_values(geometry.get('polygon_material_groups')))
                if not groups:
                    groups = ['Default']
                polygon_groups = list(_values(geometry.get('polygon_groups'))) or ['Default']
                for row in _values(geometry.get('polylist')):
                    if len(row) not in (5, 6) or any(isinstance(v, bool) or not isinstance(v, int) for v in row):
                        raise DsonImportError('DSON faces must have integer group indexes and 3 or 4 vertices')
                    if not all(0 <= v < len(vertices) for v in row[2:]) or not 0 <= row[1] < len(groups) or not 0 <= row[0] < len(polygon_groups):
                        raise DsonImportError('Face vertex/material index outside source arrays')
                    faces.append(tuple(row[2:]))
                    indices.append(row[1])
                    face_group_indices.append(row[0])
                if not faces:
                    raise DsonImportError('Geometry contains no polygon faces')
                if int(geometry.get('vertices', {}).get('count', len(vertices))) != len(vertices) or int(geometry.get('polylist', {}).get('count', len(faces))) != len(faces):
                    raise DsonImportError('Declared geometry counts do not match arrays')
                mesh = {'label': node.get('label', node.get('name', node['id'])), 'node_id': node['id'], 'node': node, 'node_path': node_path, 'geometry_path': gp, 'geometry': geometry, 'instance_id': geom_instance.get('id', gd['id']), 'vertices': vertices, 'faces': faces, 'material_indices': indices, 'groups': groups, 'polygon_groups': polygon_groups, 'face_group_indices': face_group_indices, 'morphs': [], 'skin': None, 'bones': [], 'bone_instances': {}}
                for key in ('graft', 'rigidity'):
                    if geometry.get(key):
                        reader.unsupported_field(key, 'Geometry '+key+' rules are omitted; base topology is retained.', mesh['label'])
                if geometry.get('current_subdivision_level', 0):
                    reader.unsupported_field('subdivision_surface', 'Base topology is imported; DAZ subdivision/HD evaluation is not reproduced.', mesh['label'])
                _material_plan(reader, doc, mesh)
                meshes.append(mesh)
        modifier_instances = [(reader.source, m, True) for m in scene.get('modifiers', [])]
        modifier_instances.extend((reader.source, {'url': uri, 'channel': {'current_value': options.get('morph_values', {}).get(_fragment(uri), 0)}}, True) for uri in options.get('additional_morphs', []))
        if not scene.get('modifiers'):
            modifier_instances += [(reader.source, m, False) for m in doc.get('modifier_library', [])]
        def content_uri(path):
            path = Path(path).resolve()
            for content_root in reader.roots:
                if path.is_relative_to(content_root):
                    return '/' + path.relative_to(content_root).as_posix()
            return path.name
        deformation_channels = []
        deformation_formulas = []
        formula_sources = []
        for mp0, instance, is_instance in modifier_instances:
            try:
                if is_instance:
                    mp, md = reader.asset(instance['url'], mp0, 'modifier_library')
                else:
                    mp, md = mp0, instance
            except (DsonImportError, KeyError) as e:
                reader.warning('missing_modifier', str(e), instance.get('id', ''))
                continue
            if md.get('formulas'):
                # Keep declarative data for Fusion's bounded evaluator; never execute scripts.
                if len(deformation_formulas) + len(md['formulas']) > 4096:
                    raise DsonImportError('Formula count exceeds 4096')
                for formula in md['formulas']:
                    saved = copy.deepcopy(formula)
                    saved['source'] = content_uri(mp)
                    deformation_formulas.append(saved)
                    formula_sources.append((saved, mp))
                reader.warning('formula_evaluation', 'Referenced formulas are preserved for Fusion evaluation; unresolved dependencies and unsupported operations are reported in Shaping.', md['id'])
            if md.get('channel'):
                dc = _merge(md['channel'], instance.get('channel', {}) if is_instance else {})
                deformation_channels.append({'id': md['id'], 'sourceId': content_uri(mp)+'#'+md['id'], 'aliases': [content_uri(mp)+'#'+md['id']+'?value'], 'label': dc.get('label', md.get('name', md['id'])), 'category': md.get('group', '/General'), 'value': _number(dc), 'default': _number(md['channel'].get('value')), 'min': _number(dc.get('min'), -1e6), 'max': _number(dc.get('max'), 1e6)})
            morph = md.get('morph')
            if not morph:
                if not md.get('skin'):
                    reader.unsupported_field('modifier:'+md.get('id', 'unknown'), 'Non-morph/non-skin modifier omitted.', md.get('id', ''))
                continue
            target = _fragment(instance.get('parent', md.get('parent', '')))
            matched = [m for m in meshes if target in (m['node_id'], m['instance_id'], m['geometry']['id'])]
            if not matched and not target and len(meshes) == 1:
                matched = meshes
            if not matched:
                reader.warning('morph_target', 'Morph target does not match an imported mesh: '+target, md['id'])
                continue
            for mesh in matched:
                if int(morph.get('vertex_count', 0)) != len(mesh['vertices']):
                    reader.warning('morph_vertex_count', 'Morph base vertex count differs; omitted.', md['id'])
                    continue
                deltas = _values(morph.get('deltas'))
                if morph.get('hd_url'):
                    reader.unsupported_field('hd_url', 'HD subdivision deltas omitted; available base-resolution deltas are retained.', md['id'])
                if len(mesh['morphs']) >= int(options.get('max_shape_keys', 64)):
                    reader.warning('morph_limit', 'Shape key limit reached; later referenced morphs omitted.', mesh['label'])
                    continue
                checked = []
                for row in deltas:
                    if len(row) != 4 or isinstance(row[0], bool) or not isinstance(row[0], int) or not 0 <= row[0] < len(mesh['vertices']):
                        raise DsonImportError('Invalid morph delta index: '+md['id'])
                    checked.append((row[0], *_xyz(row[1:])))
                channel = _merge(md.get('channel', {}), instance.get('channel', {}) if is_instance else {})
                key = mp.as_posix() + '#' + md['id']
                overrides = options.get('morph_values', {})
                value = _number(overrides.get(key, overrides.get(md['id'], channel)))
                low, high = _number(channel.get('min'), 0.0), _number(channel.get('max'), 1.0)
                if low > high:
                    raise DsonImportError('Morph minimum exceeds maximum: '+md['id'])
                if abs(value) > 10 or low < -10 or high > 10:
                    reader.unsupported_field('morph_slider_range', 'Blender shape-key sliders support -10 to 10; larger current values are encoded by scaling deltas.', md['id'])
                mesh['morphs'].append({'key': key, 'id': md['id'], 'label': channel.get('label', md.get('name', md['id'])), 'category': md.get('group', '/General'), 'default': _number(md.get('channel', {}).get('value')), 'value': value, 'min': low, 'max': high, 'deltas': checked, 'source': str(mp)})
        for mesh in meshes:
            mesh['deformation_channels'] = deformation_channels
            mesh['deformation_formulas'] = deformation_formulas
            geo_doc = reader.document(mesh['geometry_path'])
            candidates = [(mesh['geometry_path'], m) for m in geo_doc.get('modifier_library', []) if m.get('skin')]
            for mp0, instance, is_instance in modifier_instances:
                if not is_instance:
                    continue
                try:
                    mp, md = reader.asset(instance['url'], mp0, 'modifier_library')
                    if md.get('skin'):
                        candidates.insert(0, (mp, _merge(md, instance)))
                except (DsonImportError, KeyError):
                    pass
            for mp, md in candidates:
                skin = md['skin']
                if _fragment(skin.get('geometry', '')) not in (mesh['geometry']['id'], mesh['instance_id']):
                    continue
                if int(skin.get('vertex_count', 0)) != len(mesh['vertices']):
                    reader.warning('skin_vertex_count', 'Skin vertex count differs; skin omitted.', mesh['label'])
                    continue
                mesh['skin'] = skin
                bone_defs = {n['id']: n for n in geo_doc.get('node_library', [])}
                bone_defs.update({n['id']: n for n in reader.document(mesh['node_path']).get('node_library', [])})
                aliases = {}
                scene_node_index = {n['id']: n for n in scene_nodes}
                def in_this_figure(ni):
                    seen = set()
                    current = ni['id']
                    while current in scene_node_index and current not in seen:
                        if current == mesh['node_id']:
                            return True
                        seen.add(current)
                        current = _fragment(scene_node_index[current].get('parent', ''))
                    return False
                for ni in scene_nodes:
                    if not in_this_figure(ni):
                        continue
                    try:
                        np, nd = reader.asset(ni['url'], reader.source, 'node_library')
                        if np in (mesh['geometry_path'], mesh['node_path']) and nd['id'] in bone_defs:
                            mesh['bone_instances'][nd['id']] = copy.deepcopy(ni)
                            aliases[ni['id']] = nd['id']
                    except (DsonImportError, KeyError):
                        pass
                for ni in mesh['bone_instances'].values():
                    if ni.get('parent'):
                        parent = _fragment(ni['parent'])
                        if parent in aliases:
                            ni['parent'] = '#' + aliases[parent]
                root_id = _fragment(skin.get('node', mesh['node_id']))
                def belongs(n):
                    seen = set()
                    ident = n['id']
                    while ident in bone_defs and ident not in seen:
                        if ident == root_id:
                            return True
                        seen.add(ident)
                        ident = _fragment(bone_defs[ident].get('parent', ''))
                    return False
                mesh['bone_root_id'] = root_id
                mesh['skeleton_nodes'] = {k: _merge(v, mesh['bone_instances'].get(k, {})) for k, v in bone_defs.items() if belongs(v)}
                mesh['bones'] = [v for v in mesh['skeleton_nodes'].values() if v.get('type') == 'bone']
                for bone in mesh['skeleton_nodes'].values():
                    for key in ('center_point', 'end_point', 'translation', 'rotation', 'orientation', 'scale'):
                        _xyz(bone.get(key), 1.0 if key == 'scale' else 0.0)
                    if bone.get('formulas'):
                        reader.warning('bone_formulas', 'Declarative bone formulas are retained; only verified rotation frames and supported channels can be evaluated.', bone['id'])
                        for formula in bone['formulas']:
                            saved = copy.deepcopy(formula)
                            saved['source'] = content_uri(mesh['node_path'])
                            if saved not in deformation_formulas:
                                deformation_formulas.append(saved)
                                formula_sources.append((saved, mesh['node_path']))
                    if bone.get('rotation_order', 'XYZ') not in ('XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'):
                        raise DsonImportError('Invalid skeleton rotation order')
                    chain, current = set(), bone['id']
                    while current in mesh['skeleton_nodes']:
                        if current in chain:
                            raise DsonImportError('Cyclic skeleton hierarchy')
                        chain.add(current)
                        current = _fragment(mesh['skeleton_nodes'][current].get('parent', ''))
                for joint in skin.get('joints', []):
                    if any(joint.get(k) for k in ('local_weights', 'bulge_weights', 'scale_weights')):
                        reader.unsupported_field('triax_weights', 'TriAx/bulge/scale weight maps are omitted; only general node_weights are imported.', mesh['label'])
                    for row in _values(joint.get('node_weights')):
                        if len(row) != 2 or isinstance(row[0], bool) or not isinstance(row[0], int) or not 0 <= row[0] < len(mesh['vertices']) or not 0 <= _number(row[1]) <= 1:
                            raise DsonImportError('Invalid general skin weight index/value')
                    if _fragment(joint.get('node', '')) not in mesh['skeleton_nodes']:
                        reader.warning('skin_joint_missing', 'Skin references a missing skeleton node.', joint.get('node', ''))
                reader.unsupported_field('skinning_parity', 'Blender general-weight armature deformation is reconstructed; exact DAZ joint corrections and skinning parity are not established.', mesh['label'])
                break
        if len(deformation_formulas) > 4096 or sum(len(f.get('operations', [])) for f in deformation_formulas) > 131072:
            raise DsonImportError('Formula document exceeds the bounded operation budget')
        # Resolve raw URLs to their actual local JSON asset before granting an
        # alias. Equal fragments in different files are never treated as proof.
        for mesh in meshes:
            mesh['rotation_aliases'] = {b['id']: [] for b in mesh['bones']}
            mesh['scale_aliases'] = {b['id']: {prop: [] for prop in ('scale/x', 'scale/y', 'scale/z', 'scale/general')} for b in mesh['bones']}
        for formula, origin in formula_sources:
            refs = [formula.get('output')] + [op.get('url') for op in formula.get('operations', []) if op.get('op') == 'push' and 'url' in op]
            for ref in refs:
                if not isinstance(ref, str) or '#' not in ref:
                    continue
                try:
                    path = reader.file(ref, origin)
                    ident = _fragment(ref)
                    prop = ref.split('?', 1)[1] if '?' in ref else 'value'
                    for channel in deformation_channels:
                        if prop == 'value' and channel['sourceId'] == content_uri(path)+'#'+ident and ref not in channel['aliases']:
                            channel['aliases'].append(ref)
                    for mesh in meshes:
                        if path == mesh['node_path'] and ident in mesh['rotation_aliases'] and prop in ('rotation/x', 'rotation/y', 'rotation/z'):
                            mesh['rotation_aliases'][ident].append(ref)
                        if path == mesh['node_path'] and ident in mesh['scale_aliases'] and prop in mesh['scale_aliases'][ident]:
                            mesh['scale_aliases'][ident][prop].append(ref)
                except DsonImportError as exc:
                    reader.warning('formula_reference', 'Formula reference remains unresolved: '+str(exc), str(ref))
        if not meshes:
            raise DsonImportError('No independently loadable geometry; a preset-only DUF needs its base character scene')
        if scene.get('animations'):
            reader.unsupported_field('animations', 'Animation curves are omitted; current scene values are imported.')
        for mesh in meshes:
            joints = []
            if mesh.get('skeleton_nodes'):
                try:
                    posed = _dson_transforms(mesh['skeleton_nodes'])
                except ModuleNotFoundError:
                    posed = None  # plain-Python preflight has no mathutils; the Blender import report carries joints
                if posed:
                    for bone in mesh['bones']:
                        origin = posed[bone['id']]['matrix'].to_translation()
                        joints.append({'id': bone['id'], 'name': bone.get('label', bone['id']), 'center_cm': [round(float(v), 4) for v in origin]})
            report['meshes'].append({'id': mesh['instance_id'], 'node': mesh['node_id'], 'label': mesh['label'], 'vertices': len(mesh['vertices']), 'faces': len(mesh['faces']), 'uv_coordinates': len(mesh['uvs']), 'material_groups': mesh['groups'], 'morphs': [{k: m[k] for k in ('key', 'id', 'label', 'value', 'min', 'max', 'source')} | {'delta_count': len(m['deltas'])} for m in mesh['morphs']], 'bones': len(mesh['bones']), 'weighted_joints': len(mesh['skin'].get('joints', [])) if mesh['skin'] else 0, 'joints': joints})
        properties = {}
        for mesh in meshes:
            for morph in mesh['morphs']:
                properties[morph['key']] = {'key': morph['key'], 'name': morph['id'], 'label': morph['label'], 'min': morph['min'], 'max': morph['max'], 'value': morph['value']}
        report['properties'] = list(properties.values())
        report['ok'] = True
        report['dependencies'] = list(reader.dependencies.values())
        report['warnings'] = reader.warnings
        report['unsupported_fields'] = sorted(reader.unsupported)
        if options.get('require_full_fidelity') and reader.unsupported:
            report['ok'] = False
            report['errors'].append('Full fidelity requested, but unsupported fields are present')
    except (DsonImportError, OSError, ValueError, TypeError, KeyError, RecursionError) as exc:
        report['errors'].append(str(exc))
        if 'reader' in locals():
            report['warnings'] = reader.warnings
            report['unsupported_fields'] = sorted(reader.unsupported)
            report['dependencies'] = list(reader.dependencies.values())
    report['warning_details'] = report['warnings']
    report['warnings'] = [(w['message'] + (' ['+w['path']+']' if w['path'] else '')) for w in report['warning_details']]
    return report, meshes


def preflight_dson(source_path, content_roots, options=None):
    """Read/validate dependencies and compatibility without importing bpy or changing a scene."""
    return _make_plan(source_path, content_roots, options)[0]


def _dson_transforms(nodes):
    from mathutils import Matrix, Vector, Euler
    result = {}
    visiting = set()
    def visit(ident):
        if ident in result:
            return result[ident]
        if ident in visiting:
            raise DsonImportError('Cyclic skeleton hierarchy')
        visiting.add(ident)
        node = nodes[ident]
        parent_id = _fragment(node.get('parent', ''))
        parent = visit(parent_id) if parent_id in nodes else None
        center = Vector(_xyz(node.get('center_point')))
        translation = Vector(_xyz(node.get('translation')))
        orient = Euler(tuple(math.radians(v) for v in _xyz(node.get('orientation'))), 'XYZ').to_matrix().to_4x4()
        order = node.get('rotation_order', 'XYZ')
        if order not in ('XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'):
            raise DsonImportError('Invalid DSON rotation order')
        rotation = Euler(tuple(math.radians(v) for v in _xyz(node.get('rotation'))), order).to_matrix().to_4x4()
        general = _number(node.get('general_scale'), 1.0)
        scaling = _xyz(node.get('scale'), 1.0)
        local_scale = orient @ Matrix.Diagonal(tuple(v*general for v in scaling)+(1.0,)) @ orient.inverted()
        local_rotation = orient @ rotation @ orient.inverted()
        if parent:
            origin = parent['matrix'] @ (center-parent['center']+translation)
            rot = parent['rotation'] @ local_rotation
            inherited = node.get('inherits_scale', nodes[parent_id].get('type') != 'bone')
            scale = parent['scale'] @ (Matrix.Identity(4) if inherited else parent['local_scale'].inverted_safe()) @ local_scale
        else:
            origin, rot, scale = center+translation, local_rotation, local_scale
        matrix = Matrix.Translation(origin) @ rot @ scale
        result[ident] = {'matrix': matrix, 'center': center, 'rotation': rot, 'scale': scale, 'local_scale': local_scale}
        visiting.remove(ident)
        return result[ident]
    for ident in nodes:
        visit(ident)
    return result


def import_dson(source_path, content_roots, options=None, on_preflight=None):
    """Append reconstructed meshes/rigs; emit the compatibility report before scene mutation.

    No source scripts are executed. All source files/images are opened read-only.
    Caller owns saving/exporting to its project output directory.
    """
    options = dict(options or {})
    report, meshes = _make_plan(source_path, content_roots, options)
    print('DSON_PREFLIGHT ' + json.dumps(report, ensure_ascii=True))
    if on_preflight:
        on_preflight(copy.deepcopy(report))
    if not report['ok']:
        raise DsonImportError('; '.join(report['errors']), report)
    import bpy
    from mathutils import Matrix, Vector, Euler
    conversion = Matrix(((0.01, 0, 0, 0), (0, 0, -0.01, 0), (0, 0.01, 0, 0), (0, 0, 0, 1)))
    inverse = conversion.inverted()
    # Prepare all matrix calculations before touching the scene.
    for mesh in meshes:
        root = dict(mesh['node'], parent=None)
        root_pose = _dson_transforms({root['id']: root})[root['id']]
        root_delta = root_pose['matrix'] @ Matrix.Translation(-root_pose['center'])
        mesh['_matrix'] = conversion @ root_delta @ inverse
        if mesh['bones'] and options.get('import_rig', True):
            mesh['_posed'] = _dson_transforms(mesh['skeleton_nodes'])
    created, created_meshes, created_rigs = [], [], []
    original_active = bpy.context.view_layer.objects.active
    original_selection = list(bpy.context.selected_objects)
    resources = []
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        for mesh in meshes:
            data = bpy.data.meshes.new(mesh['label']+'_mesh')
            resources.append(('mesh', data))
            verts = [_point(v) for v in mesh['vertices']]
            data.from_pydata(verts, [], mesh['faces'])
            data.update()
            obj = bpy.data.objects.new(mesh['label'], data)
            bpy.context.scene.collection.objects.link(obj)
            created.append(obj)
            created_meshes.append(obj.name)
            obj.matrix_world = mesh['_matrix']
            obj['dson_source'] = report['source']
            obj['dson_geometry_id'] = mesh['geometry']['id']
            obj['dson_node_id'] = mesh['node_id']
            obj['dson_compatibility_warnings'] = json.dumps(report['unsupported_fields'])
            obj['dson_material_groups'] = json.dumps(mesh['groups'])
            obj['dson_polygon_groups'] = json.dumps(mesh['polygon_groups'])
            source_vertex = data.attributes.new('_fusion_source_vertex', 'FLOAT', 'POINT')
            source_vertex.data.foreach_set('value', list(range(len(verts))))
            face_groups = data.attributes.new('dson_polygon_group', 'INT', 'FACE')
            face_groups.data.foreach_set('value', mesh['face_group_indices'])
            for material in mesh['materials']:
                mat = bpy.data.materials.new(material['name'])
                resources.append(('material', mat))
                mat.diffuse_color = material['color']
                mat.use_nodes = True
                shader = mat.node_tree.nodes.get('Principled BSDF')
                shader.inputs['Base Color'].default_value = material['color']
                shader.inputs['Alpha'].default_value = material['color'][3]
                shader.inputs['Roughness'].default_value = max(0, min(1, material['roughness']))
                shader.inputs['Metallic'].default_value = max(0, min(1, material['metallic']))
                if material['texture']:
                    image = bpy.data.images.load(material['texture'], check_existing=True)
                    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
                    texture.image = image
                    texture.extension = 'REPEAT'
                    mat.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
                data.materials.append(mat)
            for polygon, index in zip(data.polygons, mesh['material_indices']):
                polygon.material_index = index
                polygon.use_smooth = True
            if mesh['uvs']:
                layer = data.uv_layers.new(name='DSON UV')
                for polygon in data.polygons:
                    for li in polygon.loop_indices:
                        vi = data.loops[li].vertex_index
                        ui = mesh['uv_overrides'].get((polygon.index, vi), vi)
                        layer.data[li].uv = mesh['uvs'][ui]
            if mesh['morphs']:
                obj.shape_key_add(name='Basis')
                for morph in mesh['morphs']:
                    key = obj.shape_key_add(name=morph['label'], from_mix=False)
                    morph['targetName'] = key.name
                    amplitude = morph['value'] if abs(morph['value']) > 10 else 1.0
                    for row in morph['deltas']:
                        key.data[row[0]].co += Vector(_point(row[1:])) * amplitude
                    key.slider_min = max(-10, min(10, morph['min']))
                    key.slider_max = max(key.slider_min, min(10, morph['max']))
                    key.value = 1.0 if amplitude != 1.0 else morph['value']
                obj['dson_morphs'] = json.dumps([{k: m[k] for k in ('key', 'id', 'label', 'value', 'min', 'max', 'source')} for m in mesh['morphs']])
            obj['dson_deformation'] = json.dumps({'version': 1, 'vertexCount': len(verts), 'sourceAttribute': '_fusion_source_vertex', 'deltaSpace': 'DSON centimeters, Y up', 'channels': mesh['deformation_channels'], 'formulas': mesh['deformation_formulas'], 'morphs': [{k: m[k] for k in ('key', 'id', 'label', 'targetName', 'value', 'default', 'category', 'min', 'max', 'deltas')} | {'amplitude': m['value'] if abs(m['value']) > 10 else 1.0} for m in mesh['morphs']]}, ensure_ascii=True)
            if mesh['bones'] and options.get('import_rig', True):
                arm_data = bpy.data.armatures.new(mesh['label']+'_skeleton')
                resources.append(('armature', arm_data))
                arm = bpy.data.objects.new(mesh['label']+'_Rig', arm_data)
                bpy.context.scene.collection.objects.link(arm)
                created.append(arm)
                created_rigs.append(arm.name)
                arm.matrix_world = mesh['_matrix']
                arm.show_in_front = True
                arm.select_set(True)
                bpy.context.view_layer.objects.active = arm
                bpy.ops.object.mode_set(mode='EDIT')
                bone_names = {}
                for bone in mesh['bones']:
                    eb = arm_data.edit_bones.new(bone['id'])
                    bone_names[bone['id']] = eb.name
                    eb.head = _point(bone.get('center_point'))
                    eb.tail = _point(bone.get('end_point'))
                    if (eb.tail-eb.head).length < 1e-6:
                        eb.tail = eb.head + Vector((0, 0.005, 0))
                    orientation = Euler(tuple(math.radians(v) for v in _xyz(bone.get('orientation'))), 'XYZ').to_matrix()
                    roll_axis = Vector(_point(orientation @ Vector((0, 0, 1))))
                    if roll_axis.length > 0:
                        eb.align_roll(roll_axis)
                    eb['dson_rotation_order'] = bone.get('rotation_order', 'XYZ')
                for bone in mesh['bones']:
                    parent = _fragment(bone.get('parent', ''))
                    if parent in bone_names:
                        arm_data.edit_bones[bone_names[bone['id']]].parent = arm_data.edit_bones[bone_names[parent]]
                bpy.ops.object.mode_set(mode='OBJECT')
                # Record a rotation-only change of basis for the owned runtime.
                # The runtime verifies the predicted imported quaternion before
                # enabling a binding; unsupported export frames remain visible.
                for bone in mesh['bones']:
                    rest = arm_data.bones[bone_names[bone['id']]].matrix_local.to_3x3()
                    parent = _fragment(bone.get('parent', ''))
                    parent_rest = arm_data.bones[bone_names[parent]].matrix_local.to_3x3() if parent in bone_names else Matrix.Identity(3)
                    orient = Euler(tuple(math.radians(v) for v in _xyz(bone.get('orientation'))), 'XYZ').to_matrix()
                    basis = rest.inverted() @ conversion.to_3x3().normalized() @ orient
                    local_rest = parent_rest.inverted() @ rest
                    channels = _xyz(bone.get('rotation'))
                    channel_matrix = Euler(tuple(math.radians(v) for v in channels), bone.get('rotation_order', 'XYZ')).to_matrix()
                    predicted = local_rest @ basis @ channel_matrix @ basis.inverted()
                    def xyzw(matrix):
                        q = matrix.to_quaternion().normalized()
                        return [q.x, q.y, q.z, q.w]
                    scales = dict(zip(('scale/x', 'scale/y', 'scale/z'), _xyz(bone.get('scale'), 1.0)))
                    scales['scale/general'] = _number(bone.get('general_scale'), 1.0)
                    scale_inputs = [{'property': prop, 'value': value, 'aliases': mesh['scale_aliases'].get(bone['id'], {}).get(prop, [])} for prop, value in scales.items()]
                    arm_data.bones[bone_names[bone['id']]]['fusion_dson_rotation'] = json.dumps({'version': 1, 'id': bone['id'], 'aliases': mesh['rotation_aliases'].get(bone['id'], []), 'scaleInputs': scale_inputs, 'order': bone.get('rotation_order', 'XYZ'), 'rest': xyzw(local_rest), 'basis': xyzw(basis), 'source': channels, 'imported': xyzw(predicted), 'unitScale': all(abs(v-1) < 1e-6 for node in mesh['skeleton_nodes'].values() for v in (_xyz(node.get('scale'), 1.0)+(_number(node.get('general_scale'), 1.0),)))}, ensure_ascii=True)
                arm.select_set(False)
                root_id = mesh.get('bone_root_id')
                root_pose = mesh['_posed'].get(root_id)
                root_inv = (root_pose['matrix'] @ Matrix.Translation(-root_pose['center'])).inverted_safe() if root_pose else Matrix.Identity(4)
                targets = {}
                for bone in mesh['bones']:
                    pose = mesh['_posed'][bone['id']]
                    delta = conversion @ root_inv @ pose['matrix'] @ Matrix.Translation(-pose['center']) @ inverse
                    targets[bone['id']] = delta @ arm_data.bones[bone_names[bone['id']]].matrix_local
                for bone in mesh['bones']:
                    pose_bone = arm.pose.bones[bone_names[bone['id']]]
                    rest = arm_data.bones[bone_names[bone['id']]].matrix_local
                    parent = _fragment(bone.get('parent', ''))
                    if parent in targets:
                        parent_rest = arm_data.bones[bone_names[parent]].matrix_local
                        pose_bone.matrix_basis = rest.inverted_safe() @ parent_rest @ targets[parent].inverted_safe() @ targets[bone['id']]
                    else:
                        pose_bone.matrix_basis = rest.inverted_safe() @ targets[bone['id']]
                for joint in mesh['skin'].get('joints', []):
                    ident = _fragment(joint.get('node', ''))
                    if ident not in bone_names:
                        continue
                    group = obj.vertex_groups.new(name=bone_names[ident])
                    for vi, weight in _values(joint.get('node_weights')):
                        if weight > 0:
                            group.add([vi], weight, 'REPLACE')
                modifier = obj.modifiers.new('DSON Skin', 'ARMATURE')
                modifier.object = arm
                modifier.use_deform_preserve_volume = True
            if options.get('subdivision', False) and mesh['geometry'].get('type') == 'subdivision_surface':
                subdivision = obj.modifiers.new('Preview Subdivision', 'SUBSURF')
                subdivision.levels = 1
                subdivision.render_levels = 1
        pose_values = options.get('pose_values') or {}
        if pose_values:
            # Pose channel: extra local rotations (degrees) on top of the DSON
            # rest pose, baked in as the new rest pose so skinning follows.
            from mathutils import Euler
            applied_pose, missing_pose = {}, []
            for arm_name in dict.fromkeys(created_rigs):
                arm = bpy.data.objects[arm_name]
                for bone_id, angles in pose_values.items():
                    pb = arm.pose.bones.get(bone_id)
                    if pb is None:
                        if bone_id not in missing_pose: missing_pose.append(bone_id)
                        continue
                    pb.matrix_basis = pb.matrix_basis @ Euler([math.radians(float(a)) for a in angles], 'XYZ').to_matrix().to_4x4()
                    applied_pose[bone_id] = [float(a) for a in angles]
                bpy.context.view_layer.objects.active = arm
                arm.select_set(True)
                bpy.context.view_layer.update()
                bpy.ops.object.mode_set(mode='POSE')
                bpy.ops.pose.armature_apply(selected=False)
                bpy.ops.object.mode_set(mode='OBJECT')
                arm.select_set(False)
            report['pose'] = applied_pose
            if missing_pose:
                report.setdefault('pose_missing', missing_pose)
        bpy.context.view_layer.update()
    except Exception:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for obj in reversed(created):
            bpy.data.objects.remove(obj, do_unlink=True)
        for kind, data in reversed(resources):
            if data.users == 0:
                getattr(bpy.data, {'mesh': 'meshes', 'armature': 'armatures', 'material': 'materials'}[kind]).remove(data)
        raise
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in original_selection:
            if obj.name in bpy.context.view_layer.objects:
                obj.select_set(True)
        if original_active and original_active.name in bpy.context.view_layer.objects:
            bpy.context.view_layer.objects.active = original_active
    for obj in created:
        obj.select_set(True)
    if created:
        bpy.context.view_layer.objects.active = created[0]
    report['created_objects'] = [o.name for o in created]
    report['created_meshes'] = created_meshes
    report['created_rigs'] = created_rigs
    return report


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Read-only native DSON preflight; no Blender or DAZ process required.')
    parser.add_argument('source', nargs='?')
    parser.add_argument('--preflight', dest='preflight_source')
    parser.add_argument('--roots', help='JSON array of explicit content-root paths')
    parser.add_argument('--content-root', action='append')
    args = parser.parse_args()
    source = args.preflight_source or args.source
    roots = json.loads(args.roots) if args.roots else args.content_root
    if not source or not isinstance(roots, list) or not roots:
        parser.error('Provide --preflight SOURCE --roots JSON_ARRAY, or SOURCE --content-root ROOT')
    result = preflight_dson(source, roots)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['ok'] else 1)

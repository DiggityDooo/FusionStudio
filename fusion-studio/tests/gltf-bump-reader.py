import base64
import copy
import hashlib
import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from gltf_bump import bump_plan, uv_transform, LIMITS


class BumpReaderTests(unittest.TestCase):
    def setUp(self):
        test_output = (ROOT / 'test-output').resolve();test_output.mkdir(exist_ok=True)
        self.work = tempfile.TemporaryDirectory(prefix='fusion-bump-reader-', dir=test_output)
        if not Path(self.work.name).resolve().is_relative_to(test_output):
            raise ValueError('Temporary reader fixture escaped the test workspace')
        self.addCleanup(self.work.cleanup)
        self.path = Path(self.work.name) / 'fixture.glb'
        self.image = (ROOT / 'public/characters/skins/female-bump.png').read_bytes()
        self.doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(self.image)}], 'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(self.image)}], 'images': [{'bufferView': 0, 'mimeType': 'image/png'}], 'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'wrapS': 33071, 'wrapT': 10497, 'magFilter': 9729}], 'materials': [{'extras': {'fusion_material_id': 'material_probe'}, 'extensions': {'EXT_materials_bump': {'bumpFactor': -.00035, 'bumpTexture': {'index': 0}}}}], 'extensionsUsed': ['EXT_materials_bump']}

    def write(self):
        raw = json.dumps(self.doc, separators=(',', ':')).encode()
        raw += b' ' * (-len(raw) % 4)
        binary = self.image + b'\0' * (-len(self.image) % 4)
        self.path.write_bytes(struct.pack('<5I', 0x46546c67, 2, 28 + len(raw) + len(binary), len(raw), 0x4e4f534a) + raw + struct.pack('<2I', len(binary), 0x004e4942) + binary)
        return self.path

    def test_embedded_png_preserves_bytes_identity_factor_and_sampler(self):
        plan = bump_plan(self.write())
        record = plan['materials'][0]
        self.assertEqual(record['identity'], 'material_probe')
        self.assertEqual(record['factor'], -.00035)
        self.assertEqual(record['wrap'], [33071, 10497])
        self.assertEqual(plan['images'][record['image']]['bytes'], self.image)
        self.assertEqual(record['image'], hashlib.sha256(self.image).hexdigest())
        self.assertEqual(plan['images'][record['image']]['width'], 2048)
        self.assertEqual(plan['warnings'], [])

    def test_data_uri_jpeg_is_bounded_and_retained(self):
        image = (ROOT / 'public/characters/skins/male-detail.jpg').read_bytes()
        self.doc['images'][0] = {'uri': 'data:image/jpeg;base64,' + base64.b64encode(image).decode()}
        self.path = self.path.with_suffix('.gltf');self.path.write_text(json.dumps(self.doc))
        plan = bump_plan(self.path)
        self.assertEqual(next(iter(plan['images'].values()))['bytes'], image)
        self.assertEqual(next(iter(plan['images'].values()))['height'], 2048)

    def test_external_paths_are_not_read_and_required_loss_rejects(self):
        self.doc['images'][0] = {'uri': 'file:///C:/Windows/unrelated-private-file.png'}
        result = bump_plan(self.write());self.assertEqual(result['materials'], []);self.assertIn('external', result['warnings'][0])
        self.doc['extensionsRequired'] = ['EXT_materials_bump']
        with self.assertRaisesRegex(ValueError, 'Required bump'):
            bump_plan(self.write())

    def test_unidentified_materials_warn_instead_of_guessing_names(self):
        self.doc['materials'][0]['extras'] = {};self.doc['materials'][0]['name'] = 'Skin'
        result = bump_plan(self.write());self.assertEqual(result['materials'], []);self.assertIn('identity', result['warnings'][0])

    def test_invalid_views_and_texture_indices_fail_before_resource_use(self):
        original = copy.deepcopy(self.doc)
        for key, value in [('byteLength', len(self.image)+100), ('byteOffset', -1), ('buffer', 2)]:
            self.doc = copy.deepcopy(original);self.doc['bufferViews'][0][key] = value
            with self.assertRaises(ValueError):bump_plan(self.write())
        self.doc = original;self.doc['materials'][0]['extensions']['EXT_materials_bump']['bumpTexture']['index'] = 100
        with self.assertRaisesRegex(ValueError, 'index'):bump_plan(self.write())

    def test_duplicate_identities_and_invalid_parameters_reject(self):
        self.doc['materials'].append(copy.deepcopy(self.doc['materials'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):bump_plan(self.write())
        self.doc['materials'].pop();self.doc['materials'][0]['extensions']['EXT_materials_bump']['bumpFactor'] = 100
        with self.assertRaisesRegex(ValueError, 'factor'):bump_plan(self.write())
        self.doc['materials'][0]['extensions']['EXT_materials_bump']['bumpFactor'] = .001
        self.doc['materials'][0]['extensions']['EXT_materials_bump']['bumpTexture']['extensions'] = {'KHR_texture_transform': {'scale': [1]}}
        with self.assertRaisesRegex(ValueError, 'transform'):bump_plan(self.write())

    def test_pixel_bombs_reject_from_the_header_before_decoding(self):
        image = bytearray(self.image);image[16:24] = struct.pack('>2I', 1000000, 1000000);self.image = bytes(image)
        with self.assertRaisesRegex(ValueError, 'megapixel'):bump_plan(self.write())

    def test_truncated_or_inconsistent_glb_bounds_reject(self):
        raw = self.write().read_bytes();self.path.write_bytes(raw[:-1])
        with self.assertRaisesRegex(ValueError, 'header'):bump_plan(self.path)
        self.path.write_bytes(raw[:18])
        with self.assertRaises(ValueError):bump_plan(self.path)

    def test_uv_transform_matches_independent_flip_transform_flip_reference(self):
        for scale in ([1.2, .8], [-.7, 2]):
            record = {'offset': [.13, -.21], 'scale': scale, 'rotation': .37}
            converted = uv_transform(record)
            for u, v in ((0, 0), (.17, .93), (-1, 2)):
                x, y = u*scale[0], (1-v)*scale[1];r=record['rotation']
                expected = [record['offset'][0]+math.cos(r)*x-math.sin(r)*y, 1-(record['offset'][1]+math.sin(r)*x+math.cos(r)*y)]
                x, y = u*scale[0], v*scale[1]
                actual = [converted['location'][0]+math.cos(-r)*x-math.sin(-r)*y, converted['location'][1]+math.sin(-r)*x+math.cos(-r)*y]
                for a,b in zip(actual, expected):self.assertAlmostEqual(a,b,places=12)

    def test_normal_and_bump_precedence_is_reported_as_an_approximation(self):
        self.doc['materials'][0]['normalTexture'] = {'index': 0}
        result = bump_plan(self.write());self.assertEqual(len(result['materials']), 1)
        self.assertIn('precedence', result['warnings'][0])


if __name__ == '__main__':
    unittest.main(verbosity=2)

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from export_protocol import export_selected, validate, digest, fingerprint, atomic_json


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = dict(path="fake.dll", sha256="a" * 64, fileVersion="fixture")
        self.config = dict(names=["morph"], timeoutSeconds=1)
        self.functions = [("140001000", "morph_ā", 1), ("140002000", "garment_縫製", 2)]

    def run_export(self, action):
        return export_selected(self.root, self.binary, self.config, self.functions, action)

    def test_unicode_and_verified_resume(self):
        calls = []
        self.run_export(lambda fn: calls.append(fn) or "/* ā 日本語 */ return 1;")
        result = validate(self.root, self.binary["sha256"], fingerprint(self.config))
        self.assertEqual(result["successfulFunctions"], 2)
        self.run_export(lambda fn: self.fail("Verified success must be reused"))
        self.assertEqual(calls, [1, 2])
        self.assertIn("日本語", (self.root / result["records"][0]["file"]).read_text(encoding="utf-8"))

    def test_error_is_partial_and_only_failed_function_retries(self):
        def decompile(fn):
            if fn == 2:
                raise TimeoutError("bounded timeout")
            return "return 1;"
        result = self.run_export(decompile)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["failedFunctions"], 1)
        self.assertFalse((self.root / "COMPLETE.json").exists())
        with self.assertRaises(ValueError):
            validate(self.root, self.binary["sha256"])
        calls = []
        self.run_export(lambda fn: calls.append(fn) or "return 2;")
        self.assertEqual(calls, [2])
        validate(self.root, self.binary["sha256"])

    def test_cancelled_export_remains_partial_and_resumes(self):
        def decompile(fn):
            if fn == 2:
                raise KeyboardInterrupt()
            return "return 1;"
        with self.assertRaises(KeyboardInterrupt):
            self.run_export(decompile)
        self.assertFalse((self.root / "COMPLETE.json").exists())
        calls = []
        self.run_export(lambda fn: calls.append(fn) or "return 2;")
        self.assertEqual(calls, [2])

    def test_hash_config_marker_and_count_mismatches_rejected(self):
        manifest = self.run_export(lambda _: "return 0;")
        for sha, config in [("b" * 64, None), (self.binary["sha256"], "wrong")]:
            with self.assertRaises(ValueError):
                validate(self.root, sha, config)
        manifest["selectedFunctions"] = 999
        atomic_json(self.root / "manifest.json", manifest)
        with self.assertRaises(ValueError):
            validate(self.root, self.binary["sha256"])
        self.run_export(lambda _: "return 0;")
        atomic_json(self.root / "COMPLETE.json", {"manifestSha256": "wrong"})
        with self.assertRaises(ValueError):
            validate(self.root, self.binary["sha256"])

    def test_tampered_checkpoint_recomputed(self):
        manifest = self.run_export(lambda _: "return 0;")
        path = self.root / manifest["records"][0]["file"]
        record = json.loads(path.read_text(encoding="utf-8"))
        record["pseudocode"] = "tampered"
        atomic_json(path, record)
        with self.assertRaises(ValueError):
            validate(self.root, self.binary["sha256"])
        calls = []
        self.run_export(lambda fn: calls.append(fn) or "recovered")
        self.assertEqual(calls, [1])
        validate(self.root, self.binary["sha256"])

    def test_legacy_or_empty_output_never_complete(self):
        (self.root / "old_decompiled.txt").write_text("x" * 10000)
        with self.assertRaises(FileNotFoundError):
            validate(self.root, self.binary["sha256"])
        self.functions = []
        self.assertEqual(self.run_export(lambda _: "unused")["status"], "partial")

    def test_request_change_invalidates_resume(self):
        self.run_export(lambda _: "return 0;")
        self.config["timeoutSeconds"] = 2
        calls = []
        self.run_export(lambda fn: calls.append(fn) or "return 2;")
        self.assertEqual(calls, [1, 2])

    def test_manifest_internal_configuration_is_verified(self):
        manifest = self.run_export(lambda _: "return 0;")
        manifest["config"]["names"] = ["different selection"]
        atomic_json(self.root / "manifest.json", manifest)
        atomic_json(self.root / "COMPLETE.json", dict(schema=2, manifestSha256=digest(self.root / "manifest.json")))
        with self.assertRaisesRegex(ValueError, "configuration digest"):
            validate(self.root, self.binary["sha256"])

    def test_consistently_rehashed_checkpoint_still_checks_content_digest(self):
        manifest = self.run_export(lambda _: "return 0;")
        path = self.root / manifest["records"][0]["file"]
        record = json.loads(path.read_text(encoding="utf-8"))
        record["pseudocodeSha256"] = "incorrect"
        atomic_json(path, record)
        manifest["records"][0]["sha256"] = digest(path)
        atomic_json(self.root / "manifest.json", manifest)
        atomic_json(self.root / "COMPLETE.json", dict(schema=2, manifestSha256=digest(self.root / "manifest.json")))
        with self.assertRaisesRegex(ValueError, "content digest"):
            validate(self.root, self.binary["sha256"])

    def test_marker_schema_is_required(self):
        self.run_export(lambda _: "return 0;")
        atomic_json(self.root / "COMPLETE.json", dict(manifestSha256=digest(self.root / "manifest.json")))
        with self.assertRaisesRegex(ValueError, "Completion marker"):
            validate(self.root, self.binary["sha256"])


if __name__ == "__main__":
    unittest.main()

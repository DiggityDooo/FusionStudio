"""Standalone, execution-free checkpoint and completion protocol for Ghidra exports."""
import hashlib
import json
import os
from pathlib import Path

SCHEMA = 2


def digest(path):
    sha = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def atomic_json(path, value):
    """Write via temp + replace; retry briefly on Windows sharing/access denials."""
    import time
    path = Path(path)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(canonical(value) + "\n", encoding="utf-8", errors="backslashreplace")
    last = None
    for attempt in range(8):
        try:
            os.replace(temp, path)
            return
        except OSError as exc:
            last = exc
            # WinError 5 Access denied / 32 sharing violation while another handle is open.
            if getattr(exc, "winerror", None) not in (5, 32) and exc.errno not in (13, 16):
                raise
            time.sleep(0.05 * (attempt + 1))
    raise last


def fingerprint(config):
    return hashlib.sha256(canonical(config).encode("utf-8")).hexdigest()


def checked_child(root, name):
    root = Path(root).resolve()
    child = (root / name).resolve()
    if child.parent != root or child.suffix != ".json":
        raise ValueError("Invalid function checkpoint path")
    return child


def validate(folder, binary_sha, config_sha=None):
    """Fail closed: files alone, old manifests and partial analyses are not success."""
    folder = Path(folder)
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != SCHEMA or manifest.get("status") != "complete":
        raise ValueError("Export is incomplete or uses an unsupported manifest")
    if manifest.get("binary", {}).get("sha256") != binary_sha:
        raise ValueError("Binary hash does not match export")
    if fingerprint(manifest.get("config")) != manifest.get("configSha256"):
        raise ValueError("Manifest configuration digest mismatch")
    if config_sha and manifest.get("configSha256") != config_sha:
        raise ValueError("Export selection/configuration does not match")
    records = manifest.get("records", [])
    if not records or manifest.get("selectedFunctions") != len(records):
        raise ValueError("Selected function count does not match checkpoints")
    if manifest.get("successfulFunctions") != len(records) or manifest.get("failedFunctions") != 0:
        raise ValueError("Function completion counts do not match")
    if len({r["address"] for r in records}) != len(records):
        raise ValueError("Duplicate function addresses")
    for ref in records:
        if ref.get("status") != "ok":
            raise ValueError("Manifest references an unsuccessful checkpoint")
        path = checked_child(folder, ref["file"])
        if digest(path) != ref["sha256"]:
            raise ValueError("Function checkpoint hash mismatch")
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("status") != "ok" or not record.get("pseudocode") or record.get("address") != ref["address"]:
            raise ValueError("Invalid function checkpoint")
        if record.get("binarySha256") != binary_sha or record.get("configSha256") != manifest["configSha256"]:
            raise ValueError("Function checkpoint provenance mismatch")
        if record.get("pseudocodeSha256") != hashlib.sha256(record["pseudocode"].encode("utf-8")).hexdigest():
            raise ValueError("Pseudocode content digest mismatch")
    marker = json.loads((folder / "COMPLETE.json").read_text(encoding="utf-8"))
    if marker.get("schema") != SCHEMA or marker.get("manifestSha256") != digest(folder / "manifest.json"):
        raise ValueError("Completion marker does not match manifest")
    return manifest


def export_selected(folder, binary, config, functions, decompile, metadata=None):
    """One atomic UTF-8 checkpoint per function; resume only verified successes."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    config_sha = fingerprint(config)
    manifest = dict(schema=SCHEMA, status="running", binary=binary, config=config,
                    configSha256=config_sha, metadata=metadata or {}, selectedFunctions=len(functions),
                    successfulFunctions=0, failedFunctions=0, records=[])
    # Invalidate completion before changing anything. Previous records remain resumable.
    marker = folder / "COMPLETE.json"
    if marker.exists():
        marker.unlink()
    atomic_json(folder / "manifest.json", manifest)
    for address, name, function in functions:
        # Ghidra addresses can include overlay names; hash the identity for safe filenames.
        filename = "function-" + hashlib.sha256(address.encode("utf-8")).hexdigest()[:24] + ".json"
        path = folder / filename
        record = None
        if path.exists():
            try:
                prior = json.loads(path.read_text(encoding="utf-8"))
                if (prior.get("status") == "ok" and prior.get("address") == address and
                        prior.get("binarySha256") == binary["sha256"] and
                        prior.get("configSha256") == config_sha and prior.get("pseudocode") and
                        prior.get("pseudocodeSha256") == hashlib.sha256(prior["pseudocode"].encode("utf-8")).hexdigest()):
                    record = prior
            except (ValueError, OSError, UnicodeError):
                pass
        if record is None:
            record = dict(address=address, name=name, binarySha256=binary["sha256"], configSha256=config_sha)
            try:
                code = str(decompile(function))
                if not code.strip():
                    raise ValueError("Decompiler returned empty pseudocode")
                record.update(status="ok", pseudocode=code,
                              pseudocodeSha256=hashlib.sha256(code.encode("utf-8")).hexdigest())
            except Exception as error:
                record.update(status="error", error=type(error).__name__ + ": " + str(error))
            atomic_json(path, record)
        manifest["successfulFunctions" if record["status"] == "ok" else "failedFunctions"] += 1
        manifest["records"].append(dict(address=address, file=filename, sha256=digest(path), status=record["status"]))
        atomic_json(folder / "manifest.json", manifest)
    manifest["status"] = "complete" if functions and not manifest["failedFunctions"] else "partial"
    atomic_json(folder / "manifest.json", manifest)
    if manifest["status"] == "complete":
        atomic_json(marker, dict(schema=SCHEMA, manifestSha256=digest(folder / "manifest.json")))
    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("binary")
    parser.add_argument("--config-sha")
    args = parser.parse_args()
    result = validate(args.folder, digest(args.binary), args.config_sha)
    print(canonical(dict(status=result["status"], functions=result["successfulFunctions"], binarySha256=result["binary"]["sha256"])))

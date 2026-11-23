#!/usr/bin/env python3
"""Build a signed CRX3 extension package and a SHA-256 checksum."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ALLOWED_SUFFIXES = {".css", ".html", ".ico", ".jpg", ".jpeg", ".js", ".json", ".png", ".svg", ".webp", ".woff", ".woff2"}
REQUIRED_FILES = {"manifest.json", "background.js", "content.js", "popup.html", "popup.js"}
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)


def _varint(value: int) -> bytes:
    output = bytearray()
    while value >= 128:
        output.append((value & 127) | 128)
        value >>= 7
    output.append(value)
    return bytes(output + bytes([value]))


def _field(number: int, data: bytes) -> bytes:
    return _varint((number << 3) | 2) + _varint(len(data)) + data


def _openssl(*args: str, input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(["openssl", *args], input=input_bytes, capture_output=True, check=True)
    return result.stdout


def _ensure_key(key_path: Path) -> None:
    if key_path.exists():
        if key_path.is_symlink() or not key_path.is_file():
            raise ValueError("The signing key must be a regular file.")
        _openssl("pkey", "-in", str(key_path), "-noout")
        return
    key_path.parent.mkdir(parents=True, exist_ok=True)
    _openssl("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key_path))
    key_path.chmod(0o600)
    print(f"Generated a new signing key: {key_path}")
    print("Back up this key securely. Reuse it to keep the same extension ID for updates.")


def package_extension(repository: Path, output_dir: Path, key_path: Path | None = None) -> tuple[Path, Path]:
    source = repository.resolve() / "extension"
    if not source.is_dir():
        raise ValueError(f"Extension directory not found: {source}")

    manifest_path = source / "manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("A regular extension/manifest.json file is required.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest.get("version")
    if manifest.get("manifest_version") != 3 or not isinstance(version, str) or not re.fullmatch(r"\d+(?:\.\d+){1,3}", version):
        raise ValueError("Expected a Manifest V3 extension with a numeric version.")

    files: dict[str, Path] = {}
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed in extension packages: {relative}")
        if any(part.startswith(".") for part in relative.parts):
            continue
        if not path.is_file() or path.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        files[relative.as_posix()] = path

    missing = REQUIRED_FILES - files.keys()
    if missing:
        raise ValueError("Missing extension files: " + ", ".join(sorted(missing)))
    for entry in (manifest.get("background", {}).get("service_worker"), manifest.get("action", {}).get("default_popup")):
        if not isinstance(entry, str) or entry not in files:
            raise ValueError(f"Manifest references an unavailable extension file: {entry!r}")

    destination = output_dir.resolve()
    if destination == source or source in destination.parents:
        raise ValueError("The output directory must be outside extension/.")
    destination.mkdir(parents=True, exist_ok=True)
    key = key_path.resolve() if key_path else destination / "extension-signing-key.pem"
    if key == source or source in key.parents:
        raise ValueError("The signing key must be outside extension/.")
    _ensure_key(key)

    with tempfile.TemporaryDirectory() as temporary:
        zip_path = Path(temporary) / "extension.zip"
        with ZipFile(zip_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            for relative, path in sorted(files.items()):
                info = ZipInfo(relative, date_time=ZIP_TIMESTAMP)
                info.compress_type = ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
        payload = zip_path.read_bytes()

    public_key = _openssl("pkey", "-in", str(key), "-pubout", "-outform", "DER")
    crx_id = hashlib.sha256(public_key).digest()[:16]
    signed_data = _field(1, crx_id)
    signed_content = b"CRX3 SignedData\x00" + struct.pack("<I", len(signed_data)) + signed_data + payload
    signature = _openssl("dgst", "-sha256", "-sign", str(key), input_bytes=signed_content)
    proof = _field(1, public_key) + _field(2, signature)
    header = _field(2, proof) + _field(10000, signed_data)
    package_name = f"bilingual-reader-v{version}"
    crx_path = destination / f"{package_name}.crx"
    crx_path.write_bytes(b"Cr24" + struct.pack("<II", 3, len(header)) + header + payload)

    digest = hashlib.sha256(crx_path.read_bytes()).hexdigest()
    checksum_path = destination / f"{package_name}.sha256"
    checksum_path.write_text(f"{digest}  {crx_path.name}\n", encoding="ascii")
    extension_id = "".join(chr(ord("a") + (n >> shift & 15)) for n in crx_id for shift in (4, 0))
    print(f"Extension ID: {extension_id}")
    return crx_path, checksum_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("dist"))
    parser.add_argument("--key", type=Path, help="Existing private signing key (PEM).")
    args = parser.parse_args()
    repository = Path(__file__).resolve().parent.parent
    crx_path, checksum_path = package_extension(repository, args.output_dir, args.key)
    print(f"Signed CRX3 package: {crx_path}")
    print(f"SHA-256 checksum: {checksum_path}")


if __name__ == "__main__":
    main()

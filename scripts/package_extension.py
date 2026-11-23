#!/usr/bin/env python3
"""Build a reproducible Chrome extension ZIP for unpacked installation."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ALLOWED_SUFFIXES = {".css", ".html", ".ico", ".jpg", ".jpeg", ".js", ".json", ".png", ".svg", ".webp", ".woff", ".woff2"}
REQUIRED_FILES = {"manifest.json", "background.js", "content.js", "popup.html", "popup.js"}
ZIP_TIMESTAMP = (2020, 1, 1, 0, 0, 0)


def package_extension(repository: Path, output_dir: Path) -> tuple[Path, Path]:
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

    files = {}
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

    package_name = f"bilingual-reader-v{version}"
    install_folder = "bilingual-reader-extension"
    zip_path = destination / f"{package_name}.zip"
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, path in sorted(files.items()):
            info = ZipInfo(f"{install_folder}/{relative}", date_time=ZIP_TIMESTAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)

    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    checksum_path = destination / f"{package_name}.sha256"
    checksum_path.write_text(f"{digest}  {zip_path.name}\n", encoding="ascii")
    return zip_path, checksum_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("dist"))
    args = parser.parse_args()
    repository = Path(__file__).resolve().parent.parent
    zip_path, checksum_path = package_extension(repository, args.output_dir)
    print(f"Extension package: {zip_path}")
    print(f"SHA-256 checksum: {checksum_path}")


if __name__ == "__main__":
    main()

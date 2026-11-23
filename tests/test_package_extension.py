"""Regression tests for signed CRX3 packages and stable extension identities."""

from __future__ import annotations

import hashlib
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from package_extension import package_extension  # noqa: E402


class PackageExtensionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.extension = self.repo / "extension"
        self.extension.mkdir(parents=True)
        self.manifest = {
            "manifest_version": 3,
            "name": "Test extension",
            "version": "0.5.0",
            "background": {"service_worker": "background.js"},
            "action": {"default_popup": "popup.html"},
        }
        (self.extension / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        for filename in ("background.js", "content.js", "popup.js", "popup.html"):
            (self.extension / filename).write_text(filename, encoding="utf-8")

    @staticmethod
    def _zip_payload(crx: Path) -> bytes:
        data = crx.read_bytes()
        assert data[:4] == b"Cr24"
        assert struct.unpack_from("<I", data, 4)[0] == 3
        header_length = struct.unpack_from("<I", data, 8)[0]
        assert header_length > 0
        return data[12 + header_length:]

    def test_crx3_layout_and_checksum(self) -> None:
        (self.extension / ".env").write_text("SECRET=ignored", encoding="utf-8")
        (self.extension / "private.pem").write_text("not packaged", encoding="utf-8")
        (self.extension / "notes.md").write_text("not packaged", encoding="utf-8")
        assets = self.extension / "assets"
        assets.mkdir()
        (assets / "icon.png").write_bytes(b"png bytes")
        package, checksum = package_extension(self.repo, self.root / "dist")
        self.assertEqual(package.name, "bilingual-reader-v0.5.0.crx")
        with ZipFile(BytesIO(self._zip_payload(package))) as archive:
            names = archive.namelist()
            self.assertEqual(len(names), 6)
            self.assertIn("manifest.json", names)
            self.assertIn("assets/icon.png", names)
            self.assertNotIn("private.pem", names)
            self.assertEqual(json.loads(archive.read("manifest.json"))["version"], "0.5.0")
        digest = hashlib.sha256(package.read_bytes()).hexdigest()
        self.assertEqual(checksum.read_text(encoding="ascii"), f"{digest}  {package.name}\n")
        self.assertTrue((self.root / "dist" / "extension-signing-key.pem").exists())

    def test_same_key_creates_identical_crx(self) -> None:
        key = self.root / "private.pem"
        first, _ = package_extension(self.repo, self.root / "first", key)
        second, _ = package_extension(self.repo, self.root / "second", key)
        self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_missing_required_file_fails(self) -> None:
        (self.extension / "popup.js").unlink()
        with self.assertRaisesRegex(ValueError, "Missing extension files"):
            package_extension(self.repo, self.root / "dist")

    def test_bad_manifest_reference_fails(self) -> None:
        self.manifest["action"]["default_popup"] = "missing.html"
        (self.extension / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unavailable extension file"):
            package_extension(self.repo, self.root / "dist")

    def test_symlink_is_rejected(self) -> None:
        target = self.root / "elsewhere.js"
        target.write_text("secret", encoding="utf-8")
        link = self.extension / "linked.js"
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):
            self.skipTest("Symlinks unavailable on this filesystem")
        with self.assertRaisesRegex(ValueError, "Symlinks are not allowed"):
            package_extension(self.repo, self.root / "dist")

    def test_real_repository_extension_packages(self) -> None:
        package, _ = package_extension(ROOT, self.root / "actual")
        with ZipFile(BytesIO(self._zip_payload(package))) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertIn("content.js", archive.namelist())


if __name__ == "__main__":
    unittest.main()

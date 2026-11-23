# Install a packaged Bilingual Reader extension

Bilingual Reader is a Chrome Manifest V3 browser extension, not a Windows or macOS desktop application. It does not produce an `.exe`, `.msi`, or `.app`. The downloadable distribution is a versioned ZIP archive containing the complete browser extension.

## Download a prebuilt ZIP

1. Open the repository's **Actions** tab and select **Package Chrome extension**.
2. Open a successful workflow run for the desired branch or commit.
3. Download the **bilingual-reader-extension** artifact. GitHub may wrap the two files in an additional artifact ZIP.
4. Extract the artifact download if necessary. Locate `bilingual-reader-v<version>.zip` and its matching `.sha256` file.
5. Extract `bilingual-reader-v<version>.zip`. It contains the `bilingual-reader-extension/` folder, with `manifest.json` directly inside.

For tagged versions published by the maintainer, download the ZIP and checksum directly from the repository's **Releases** page instead.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the extracted **bilingual-reader-extension** folder (the one containing `manifest.json`).
5. Pin the extension from the toolbar if desired. Open an ordinary HTTP(S) webpage, select the extension, and configure your translation provider.

**Do not point Load unpacked at the ZIP itself.** Chrome requires an extracted directory for this installation method. Chrome also restricts self-hosted CRX installation on ordinary Windows and macOS installations; a `.crx` is not a substitute for a one-click native installer. For one-click Chrome installation, publish through the Chrome Web Store.

This release ZIP does not contain an LLM or a model runtime. Use Ollama, deepLocal, or an explicitly configured OpenAI API endpoint as described in the main README.

## Update an existing unpacked installation

Extract the new version into the **same installed directory path** as the existing `bilingual-reader-extension` folder, replacing the previous extension files. Keeping the extension path stable helps avoid accidental duplicate installations and changes to local extension identity. Reload it in `chrome://extensions` and refresh any open webpages. Review the new version's permissions before installing.

## Verify the download

The package builder writes a SHA-256 checksum beside the ZIP.

On macOS:

```bash
shasum -a 256 bilingual-reader-v0.5.0.zip
```

On Linux:

```bash
sha256sum bilingual-reader-v0.5.0.zip
```

On Windows PowerShell:

```powershell
Get-FileHash .\bilingual-reader-v0.5.0.zip -Algorithm SHA256
```

Replace `0.5.0` with the version you downloaded and compare the hash against the matching `.sha256` file. The checksum detects accidental changes to the package, but it is not a substitute for trusting the publisher.

## Build locally

Python 3 is sufficient; no Python packages, Node build tools, or Chrome binary are required to create the archive:

```bash
python3 scripts/package_extension.py
```

The command creates `dist/bilingual-reader-v<version>.zip` and `dist/bilingual-reader-v<version>.sha256`. The script includes only permitted static extension resources, validates the manifest and required files, rejects symlinks, excludes private keys and other non-extension files, and writes ZIP entries in deterministic order.

To validate the source before building:

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p "test_package_extension.py" -v
python3 scripts/package_extension.py
```

## Automated release packaging

The **Package Chrome extension** GitHub Actions workflow runs for pull requests targeting `main`, commits pushed to `main`, manual runs, and version tags. It checks JavaScript syntax, runs tests, generates the ZIP and checksum, verifies the checksum, and uploads the result as a downloadable workflow artifact.

When the maintainer pushes a tag such as `v0.5.0`, matching the extension version in `extension/manifest.json`, the workflow also attaches the validated ZIP and checksum to a GitHub Release. Creating a PR or running the workflow manually does **not** publish a release.

This is not code signing or a Chrome Web Store submission. No private signing key is required or bundled.

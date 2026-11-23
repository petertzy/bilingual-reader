# Signed CRX3 packages and installation

Bilingual Reader is a Chrome Manifest V3 browser extension. The build now creates a **signed CRX3** file (`.crx`), not an unpacked-installation ZIP. A CRX is a single extension package and does not need its original source directory after a successful managed installation.

**Important limitation:** A self-signed CRX downloaded from GitHub is **not guaranteed to install in regular Google Chrome on macOS or Windows**. Chrome may reject it because it lacks Chrome Web Store authorization. Renaming files, dragging a CRX into `chrome://extensions`, enabling Developer mode, or passing undocumented flags does not reliably override Chrome's distribution policy. Do not disable browser security features to work around this. For a normal consumer installation that survives deletion of downloads, publish through the Chrome Web Store. For organizational deployments, use supported Chrome Enterprise extension policies on properly managed devices.

## Download a signed CRX

1. Open [GitHub Releases](https://github.com/petertzy/bilingual-reader/releases) and select a published version. Download `bilingual-reader-v<version>.crx` from **Assets**.
2. If no Release exists, open [GitHub Actions](https://github.com/petertzy/bilingual-reader/actions/workflows/package-extension.yml), select a successful run, and download the `bilingual-reader-crx` artifact. Extract the GitHub artifact wrapper ZIP to obtain the `.crx` and `.sha256` files.
3. Verify the checksum if desired. A valid CRX does not guarantee that your Chrome installation permits sideloading it.
4. Use a Chrome-supported distribution method: Chrome Web Store or your organization's managed extension deployment. A local CRX is not a universal double-click installer.

The CRX does not bundle an LLM. Start Ollama or deepLocal, or configure OpenAI separately.

## Create a CRX locally

Requires Python 3 and OpenSSL in your PATH. From the repository root:

```bash
python3 scripts/package_extension.py
```

Windows with Python Launcher:

```powershell
py -3 scripts/package_extension.py
```

The script produces:

```text
dist/
  bilingual-reader-v0.5.0.crx
  bilingual-reader-v0.5.0.sha256
  extension-signing-key.pem
```

**Keep `extension-signing-key.pem` private and back it up securely.** It is generated only on the first run and reused on subsequent runs to preserve the extension ID. Do not commit, upload, or share it. The `.gitignore` excludes `.pem` files and `dist/`. Losing the key means subsequent builds will have a different extension ID.

To use an existing signing key:

```bash
python3 scripts/package_extension.py --key /secure/location/extension-signing-key.pem
```

The package contains only runtime extension files, with `manifest.json` at the CRX payload root. The builder checks required files, rejects symlinks, signs the CRX3 payload using RSA/SHA-256, and writes a checksum.

## Verify the download

On macOS:

```bash
shasum -a 256 bilingual-reader-v0.5.0.crx
```

On Linux:

```bash
sha256sum bilingual-reader-v0.5.0.crx
```

On Windows PowerShell:

```powershell
Get-FileHash .\bilingual-reader-v0.5.0.crx -Algorithm SHA256
```

Compare the result with the corresponding `.sha256` file.

## Configure GitHub Actions signing

The workflow is [`.github/workflows/package-extension.yml`](../.github/workflows/package-extension.yml). For repeatable releases with a stable extension ID:

1. Generate and securely back up a signing key locally using the command above.
2. In GitHub, open **Settings > Secrets and variables > Actions > New repository secret**.
3. Create `CRX_SIGNING_KEY_PEM` and paste the **complete PEM private key**, including the BEGIN/END lines.
4. Trigger a new packaging run. It uses the secret to sign CRX files with the same extension identity.
5. Do not rotate the key casually. If it is compromised, follow a deliberate extension identity and migration plan.

Without the secret, pull requests and branch builds use a **temporary signing key**. Their CRX artifacts are for inspection and testing only; their extension IDs change between runs. **Release-tag builds intentionally fail without the persistent signing secret**, rather than silently publishing a package with a different identity. Private keys are never included in uploaded artifacts.

## Publish a version

Ensure the version in `extension/manifest.json` matches the tag, and that `CRX_SIGNING_KEY_PEM` is configured. For version `0.5.0`:

```bash
git checkout main
git pull --ff-only origin main
git tag v0.5.0
git push origin v0.5.0
```

Only create a tag if it does not already exist. A successful tagged workflow publishes `bilingual-reader-v0.5.0.crx` and its SHA-256 checksum to [GitHub Releases](https://github.com/petertzy/bilingual-reader/releases). Check the workflow and Release page before announcing it. Do not force-move an existing release tag.

## Supported installation paths

- **Regular Chrome on macOS/Windows:** Chrome Web Store is the supported consumer distribution route. A GitHub-hosted CRX may be rejected.
- **Managed Chrome devices:** Administrators can configure extension installation policies and approved hosting/update URLs. Follow [Google Chrome Enterprise documentation](https://support.google.com/chrome/a/answer/7532015?hl=en); deployment prerequisites vary by platform and management environment.
- **Development:** `chrome://extensions` > Developer mode > Load unpacked still works with the source `extension/` directory, but this is not a permanent installed-copy workflow. The source folder must remain in place.

A CRX is not a native `.exe` or `.app`, and generating one does not override Chrome's installation rules.

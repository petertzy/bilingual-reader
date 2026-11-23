# Bilingual Reader

A compact, local-first Chrome Manifest V3 extension for on-demand bilingual webpage translation. The current extension manifest version is **0.5.0**. It supports **Ollama**, **deepLocal**, and an optional **OpenAI** cloud backend. Original webpage text stays visible, with translations inserted below eligible paragraphs and list items.

![Bilingual Reader screenshot](https://github.com/user-attachments/assets/62dc0420-c891-47f5-9428-decff17d0d36)

## Features

- Translate eligible text on ordinary webpages without replacing the original content. When one heading groups multiple links, translate each linked title separately instead of combining them into one model request.
- Choose between Ollama, deepLocal, and explicitly selected OpenAI. Configure either local provider's API URL to use the same computer or a trusted server on another computer.
- Select from **36 target-language options**, including Chinese (Simplified) and Chinese (Traditional), with English-only UI labels.
- Use a compact extension popup; open **Settings** to choose a provider, model, and target language.
- Keep the floating **T** tab hidden until needed; toggle it with **Command+Shift+U** on macOS (**Ctrl+Shift+U** elsewhere). Its controls offer **Translate page**, **Show translations**, **Hide translations**, and **Remove translations**. The popup and floating controls stay synchronized when translation visibility changes.
- Translate selected words or sentences from the right-click **Translate selection** menu or a configurable keyboard shortcut; view results in a dismissible panel.
- Process text progressively, prioritizing blocks near the reading viewport. Translation errors appear beside affected text.
- Optionally encrypt a remembered OpenAI API key using a passphrase-protected vault.

## Download a packaged extension

Bilingual Reader is a **Chrome browser extension**, not a standalone `.exe` or `.app`. The repository now supports reproducible ZIP packages for Windows, macOS, and Linux Chrome installations. You do not need a Git checkout or programming tools to use a downloaded ZIP.

- **Prebuilt ZIP:** Open **Actions > Package Chrome extension**, choose a successful run, and download the **bilingual-reader-extension** artifact. If GitHub provides an outer ZIP, extract that first.
- **Versioned releases:** Maintainer-created version tags matching `extension/manifest.json` automatically publish the extension ZIP and SHA-256 checksum to **GitHub Releases**.
- **Local build:** Run `python3 scripts/package_extension.py` to produce the ZIP and checksum in `dist/` with no additional Python dependencies.

Extract the versioned extension ZIP, then use **Load unpacked** in `chrome://extensions` and select the contained `bilingual-reader-extension` directory. Chrome on Windows and macOS does not generally permit one-click installation of privately distributed CRX packages; Chrome Web Store publication is the standard route for that experience.

For downloads, checksums, updates, release automation, and complete installation steps, see [Packaged extension installation](docs/INSTALL_PACKAGE.md).

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this repository's `extension/` directory.
4. Open a normal `http://` or `https://` webpage and click the extension icon.
5. Click **Settings**, select a provider and model, choose a **Target language**, then click **Translate page**.
6. Use **Hide translations** to practice reading without translations, **Show translations** to restore them, or **Remove translations** to discard them.

After pulling updates, reload the extension from `chrome://extensions` and refresh the webpage. The extension does not run automatically on every visited page. Opening its popup on a normal webpage prepares the floating **T** tab, but it remains hidden until the user presses the tab-toggle shortcut.

## Reading and translation controls

### Translate a page

Open the extension popup or reveal the floating **T** tab with **Command+Shift+U** (macOS) / **Ctrl+Shift+U** (other platforms) on a regular webpage and choose **Translate page**. The extension translates eligible visible text blocks progressively, keeping the original text in place. Set the provider, model, and target language under **Settings** in the popup.

### Hide, show, or remove translations

The popup and floating **T** tab both provide these actions. The tab is hidden by default; press **Command+Shift+U** (macOS) or **Ctrl+Shift+U** (other platforms) to show it, and press the same shortcut again to hide it:

| Action | Behavior |
| --- | --- |
| **Hide translations** | Temporarily hides inserted translations while leaving the original webpage text visible. |
| **Show translations** | Reveals the existing translations immediately, without requesting them again. |
| **Remove translations** | Deletes inserted translation blocks and cancels pending page-translation work. |

Only the action matching the current state is shown: when translations are visible, **Hide translations** is available; when they are hidden, **Show translations** is available. The extension popup and floating **T** panel reflect the same active page state. Changing visibility in either control updates the other while the popup is open, and the popup refreshes its buttons when it regains focus. This synchronization applies to the active tab, not unrelated tabs.

Visibility is a per-page state, not a saved preference across reloads. Newly inserted results from an ongoing page translation follow the current visibility setting. Removing translations is different from hiding them: after removal, use **Translate page** to generate results again.

### Translate selected text

1. Select a word, phrase, or sentence on an ordinary HTTP(S) webpage.
2. Right-click and choose **Translate selection**, or press the configured keyboard shortcut.
3. Read the result in the dismissible **Selected text translation** panel. Select **Close** to dismiss it.

The selected-text action uses the provider, model, and target language configured in the extension. It does not translate the entire page or add a persistent bilingual block. Selection requests have a **3,500-character limit**; errors are displayed in the panel.

**Selected-text keyboard shortcut:** **Command+Shift+Y** (`⌘⇧Y`) on macOS, or **Ctrl+Shift+Y** on other platforms. These are defaults, not mandatory bindings. Both shortcuts are configurable at `chrome://extensions/shortcuts`; change or disable either one if it conflicts with another action. **Command+T** is normally reserved for opening a new tab in Chrome and is not the default.


## Translation providers

### Ollama (local)

1. Install and start [Ollama](https://ollama.com/).
2. Download a model you trust, for example `ollama pull gemma3:4b`.
3. Confirm Ollama is listening on `http://127.0.0.1:11434`, or obtain the HTTP(S) address of an Ollama server you trust.
4. In **Settings**, select **Ollama**, set **Ollama API base URL** (default: `http://127.0.0.1:11434`), click **Find local models**, and select a loaded model ID.

Model discovery uses `GET /api/tags`; translation uses `POST /api/chat`. The Ollama base URL must contain only the scheme, host, and optional port (no `/api` suffix). Model quality and language coverage vary.

**HTTP 403 from the browser extension:** If Ollama works from PowerShell but translation reports HTTP 403, Ollama may be rejecting the Chrome extension origin. The extension now includes its exact `chrome-extension://<extension-id>` origin in the error message. On Windows, quit Ollama completely, set `OLLAMA_ORIGINS` to include that exact origin (preserving any other required origins), then restart Ollama. For example, run `[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://<extension-id>', 'User')` in PowerShell after replacing the placeholder with the extension ID. Restart the Ollama desktop application so it inherits the new environment variable. A successful PowerShell `/api/chat` request does not establish that browser-extension origin access is allowed. Do not disable browser security or expose Ollama on a public interface to work around this error.

### deepLocal (local)

Project: https://github.com/petertzy/deepLocal

1. Start deepLocal and load a GGUF model.
2. Copy the **API base URL** from deepLocal's **Server** page.
3. In **Settings**, select **deepLocal** and paste the URL into **deepLocal API base URL**. It defaults to `http://127.0.0.1:14567/v1` and must end with `/v1`.
4. Click **Find local models** and select the exact returned model ID.

The development default is `http://127.0.0.1:14567/v1`. Packaged desktop builds may choose a different loopback port each time they start. The extension does not scan for ports automatically. You may configure a trusted remote HTTP(S) host, but the deepLocal server must actually be reachable from the browser; a loopback-only listener cannot be accessed from another computer without an appropriate, securely configured proxy or tunnel. Model discovery uses `GET /v1/models`; translation uses `POST /v1/chat/completions` with `use_documents: false` and `stream: false`.

To check a development server:

```bash
curl http://127.0.0.1:14567/v1/models
```

Replace the port with the one shown by deepLocal. Avoid exposing local model services to the public network.

## Custom provider endpoints and host access

Both local-model providers have an editable **API base URL** in **Settings**:

| Provider | Default | Example on another computer |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | `http://192.168.1.50:11434` |
| deepLocal | `http://127.0.0.1:14567/v1` | `http://192.168.1.50:14567/v1` |

Enter the base URL, then click **Find local models** or **Translate page**. When the destination is not the default local loopback host, Chrome asks for access to that server's origin. Grant access only for servers you control or trust. The extension saves each provider's URL independently and reuses it for page translation, model discovery, and selected-text translation. The floating **T** tab uses saved preferences; authorize a remote host through the popup first.

Custom endpoints accept HTTP or HTTPS, a host, and an optional port. Credentials, query strings, fragments, and unexpected paths are rejected. Ollama URLs must not include an API path; deepLocal URLs must end in `/v1`. Existing local defaults continue to work without additional permission prompts.

**Security:** Remote HTTP sends source text unencrypted over the network. Prefer HTTPS or a trusted encrypted tunnel for traffic beyond your own machine, and never expose an unauthenticated model API directly to the public internet. A remote service must listen on an accessible interface, allow connections through its firewall, and be compatible with the provider's API. The extension does not configure servers or network firewalls.

### OpenAI (optional cloud)

**OpenAI sends the text being translated to an external API.** It is never an automatic fallback for local providers. API usage may incur charges.

1. Open **Settings** and choose **OpenAI (cloud, opt-in)**.
2. Enter a valid OpenAI model ID (default: `gpt-4.1-mini`). Model discovery is not available for OpenAI.
3. Enter an API key for temporary session use, or follow the encrypted-save workflow below.
4. Click **Translate page**.

The background worker sends translation requests to `https://api.openai.com/v1/chat/completions` with Bearer authentication. The API key is not sent to webpage content scripts. The manifest declares `https://api.openai.com/*` as a host permission at installation; it is **not** requested dynamically when translation starts.

## OpenAI API key: save, unlock, and delete

### Use a key for the current browser session only

Enter an API key in **Settings > OpenAI** and click **Translate page** without saving it in the vault. The key is placed in `chrome.storage.session` and is not persistently saved by this action. You may need to enter it again after a browser restart or extension reload.

### Save an encrypted key on this device

1. Enter your OpenAI API key.
2. Check **Remember encrypted key on this device**.
3. Enter a **Vault passphrase** containing at least 12 characters.
4. Click **Save encrypted API key**.
5. Wait for **API key encrypted and saved. It is ready to use.**

Saving is separate from translating. Clicking **Translate page** alone does **not** create or update the persistent encrypted key.

The API key field is intentionally empty whenever the popup reopens. Check the credential status instead:

- **Encrypted key saved and unlocked for this session.** The key is saved and ready to use.
- **Encrypted key saved. Unlock it to translate.** Enter the vault passphrase and click **Unlock saved API key**.
- **Key available for this session only. Not saved for future sessions.** The key is temporary.
- **No API key saved.** No active or saved key is present.

After a browser restart, enter the same vault passphrase and click **Unlock saved API key**. The passphrase is not stored by the extension. Compatible password managers may offer to fill the vault passphrase through standard `username` and `current-password` form fields; autofill support in Chrome extension popups varies. Manual entry or paste is supported. **A lost vault passphrase cannot be recovered**; replace the encrypted credential with a new API key if necessary.

### Delete credentials

In **Settings > OpenAI**, click **Delete saved and active API key**. This removes the encrypted saved key, any legacy plaintext credential, the remember preference, and the unlocked session key. The extension checks both storage areas before reporting successful deletion. **Unchecking Remember encrypted key on this device also deletes both saved and active credentials**, rather than only the persistent copy.

After deletion, the status should read **No API key saved.** Deleting an extension credential does **not** revoke the API key at OpenAI or erase external password-manager records or old browser-profile backups. Revoke the key through your OpenAI account if it must no longer work anywhere.

### Vault security details

The popup encrypts remembered keys using **AES-256-GCM**, a random 96-bit IV, and **PBKDF2-HMAC-SHA-256** with 310,000 iterations and a random 128-bit salt. Only encrypted credential data and derivation metadata are saved in `chrome.storage.local`; an unlocked key is held in `chrome.storage.session`. Both storage areas are restricted to `TRUSTED_CONTEXTS` by the extension. The vault passphrase is not saved.

Legacy plaintext credentials from older versions are moved to session-only storage and removed from persistent storage when the popup opens. Vault encryption does not defend against compromised trusted extension code, malware controlling the browser, a compromised operating system, weak passphrases, or previously copied browser-profile data.

## Supported target languages

The current selector offers **36 choices**:

| | | |
| --- | --- | --- |
| English | Chinese (Simplified) | Chinese (Traditional) |
| Spanish | French | German |
| Portuguese | Italian | Russian |
| Japanese | Korean | Arabic |
| Hindi | Bengali | Urdu |
| Indonesian | Malay | Vietnamese |
| Thai | Turkish | Dutch |
| Polish | Ukrainian | Persian |
| Swahili | Tamil | Telugu |
| Hebrew | Greek | Swedish |
| Danish | Finnish | Norwegian |
| Czech | Romanian | Hungarian |

Language names, UI, source code, comments, tests, and documentation remain English-only. Chinese is supported as a **translation target**, not as the project's interface language. No Chinese-language resources or China-hosted translation services are bundled. Translation quality depends on the chosen model.

## How translation works

- The extension considers visible semantic headings, paragraphs, and list items on ordinary webpages, prioritizing those near the reading viewport. Short semantic content is eligible; generic containers are filtered more conservatively.
- It handles up to **35 eligible blocks** and **120 sentence-sized jobs** per run. Individual source blocks are limited to **3,500 characters**; longer sentences may be split into pieces of up to **600 characters**.
- It runs up to **two concurrent translation requests** for each provider.
- Original content stays visible. Translation output is added using `textContent`, not `innerHTML`.
- Page translations can be hidden and restored without rerunning the model. The popup and floating panel synchronize the active page's visibility state. Selected-text results use a separate dismissible panel.
- Clicking **Remove translations** clears inserted results and invalidates pending work so stale results are not reinserted.
- The compact interface does not show a persistent completion banner on the webpage. Errors appear beside the affected text.

## Permissions and privacy

The manifest declares `activeTab`, `scripting`, `storage`, `contextMenus`, and `permissions`, with required host permissions for `http://127.0.0.1/*` and `https://api.openai.com/*`. It also declares optional HTTP(S) host permissions, requested only when the user explicitly initiates model discovery or page translation for a configured non-default host. Chrome host match patterns cannot restrict permissions to individual ports; provider base URLs are validated before requests. Requests reject HTTP redirects.

- No telemetry, external script CDN, user account, or extension-managed auto-update service is implemented.
- Ollama and deepLocal receive source text at the configured API endpoint, which may be another computer. Remote HTTP connections are not encrypted.
- OpenAI receives source text only when selected; cloud translation is not a silent fallback.
- Webpage text, including selected text, is not intentionally persisted by the extension. The selected text is sent to the configured translation provider when translation is requested.
- The deepLocal request explicitly disables optional document retrieval with `use_documents: false`.
- API credentials are handled by trusted extension contexts, not exposed to webpage content scripts.

**This project has not undergone a formal independent security audit.** Treat local services, the browser profile, the operating system, installed extensions, and external providers as part of your threat model.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Settings or translation behaves inconsistently after updating | Reload the extension at `chrome://extensions` and refresh the webpage. |
| No translation appears | Use a regular webpage with eligible visible text; protected Chrome pages cannot be scripted. Check whether translations are hidden. |
| Floating **T** tab is missing | It is hidden by default. Press **Command+Shift+U** on macOS or **Ctrl+Shift+U** elsewhere, and check `chrome://extensions/shortcuts` if nothing happens. |
| Popup and floating controls show different visibility actions | Reload the extension and refresh the webpage. The popup reads the active tab's visibility when opened or refocused; ensure both controls refer to the same tab. |
| Selected-text shortcut does nothing | Select text on a normal webpage and check the binding or conflicts at `chrome://extensions/shortcuts`. |
| Selection translation fails | Confirm the configured provider is running or accessible, the selected text is within 3,500 characters, and the webpage allows extension scripts. |
| No local models are found | Start the selected local service and load a model before clicking **Find local models**. |
| deepLocal cannot connect | Copy the current API URL from its **Server** page; the port may have changed. Remote hosts require a reachable listener or proxy and host permission. |
| Remote Ollama or deepLocal connection fails | Confirm the exact API base URL, Chrome host access approval, server bind address, firewall, and API compatibility. Configure HTTPS or a trusted tunnel for sensitive text. |
| OpenAI asks for a key after restarting | An encrypted key must be unlocked with the vault passphrase for the new session. |
| The OpenAI API key field is empty after saving | This is intentional; check the credential status text. |
| OpenAI translation fails with an HTTP error | Check API key validity, model access, quota, billing, and network access. Do not share secrets when reporting errors. |
| Deletion appears ineffective | Use **Delete saved and active API key**, confirm **No API key saved**, and reload the popup to verify. |

## Limitations

- The extension does not translate every element on a page; it processes a bounded set of eligible visible text blocks. Generic UI containers and interactive controls are excluded.
- Selection translation requires an eligible webpage and an explicit selection; protected Chrome pages cannot be scripted.
- Automatic language detection, automatic page translation, PDF translation, OCR, speech recognition, and YouTube subtitle translation are not implemented.
- Chrome internal and protected pages cannot be scripted.
- Password-manager autofill support varies by manager and browser.
- There is no built-in recovery for a forgotten vault passphrase.
- Automated tests use mocked service responses; live Ollama, deepLocal, OpenAI, and browser integration should be tested separately.

## Tests

From the repository root:

```bash
node --test tests/*.test.js
node --check extension/background.js
node --check extension/content.js
node --check extension/popup.js
```

No npm install or build step is required.

## License

MIT. Original standalone starter code, not derived from BiRead or FluentRead.


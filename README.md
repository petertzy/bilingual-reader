# Sovereign Bilingual Reader

A compact, inspectable Chrome Manifest V3 extension for bilingual webpage translation. Version 0.3 supports **two local model services (Ollama and deepLocal) plus an optional OpenAI cloud translation backend**. Original paragraphs remain visible while translated text is added below each block.

<img width="1438" height="629" alt="Bildschirmfoto 2026-11-11 um 19 32 44" src="https://github.com/user-attachments/assets/d4d6c876-644b-4326-bbe5-ca04a62c666f" />

## Security model

- No telemetry, accounts, CDN dependencies, remote scripts, or automatic updates implemented by this extension. OpenAI is an optional cloud integration that sends selected page text to OpenAI only when chosen.
- `activeTab` and `scripting`: the extension reads a webpage only after the user clicks Translate. No `<all_urls>` permission.
- The only default network host permission is `http://127.0.0.1/*`; the OpenAI endpoint `https://api.openai.com/*` is an optional host permission requested only when OpenAI translation starts. Chrome match patterns cannot restrict permissions to individual ports. Application code strictly validates deepLocal URLs and permits **only** numeric `127.0.0.1` and the `/v1` base path. Remote hosts, hostnames, HTTP redirects to remote endpoints, usernames and query parameters are forbidden in configured URLs.
- Local modes send paragraph text to a service running on the same computer. OpenAI mode sends selected paragraph text to `api.openai.com` and requires explicit user choice. The extension does not persist webpage content.
- deepLocal translation requests set `use_documents: false` to avoid accessing its optional indexed documents.
- Translations are inserted with `textContent`, not `innerHTML`.
- This is **not** a formal independent security audit. A compromised localhost service, model, operating system, or browser extension remains a separate risk. Do not expose local model APIs over the internet.

## Install in Chrome

1. Download this project, extract it, and inspect the files under `extension/`.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `extension/` directory.
3. Open a regular webpage and click the extension icon.
4. Choose **Ollama**, **deepLocal**, or **OpenAI**, select a target language, and click **Translate current page**.
5. Click **Remove translations** when done.

## Ollama

1. Install Ollama and run a model you have reviewed, for example `ollama pull gemma3:4b`.
2. Make sure Ollama is listening on `http://127.0.0.1:11434`.
3. Select **Ollama**, click **Find local models**, and choose the model.
4. Requests use `POST /api/chat`; discovery uses `GET /api/tags`.

## deepLocal

Official project: https://github.com/petertzy/deepLocal

1. Start deepLocal, load a GGUF model, and open deepLocal's **Server** page.
2. Copy the exact **API base URL** from the Server page. The development default is `http://127.0.0.1:14567/v1`, but packaged desktop builds use an **ephemeral loopback port** at launch.
3. Select **deepLocal** in the extension and paste the URL into **deepLocal API base URL**.
4. Click **Find local models**. The extension calls `GET /v1/models`; use the returned **model ID**, not necessarily the human-readable model name.
5. Translate. Requests use `POST /v1/chat/completions` with `use_documents: false`, `stream: false`, and no API key.

Only `http://127.0.0.1:<port>/v1` is accepted for deepLocal. If the packaged app restarts and changes its port, copy the new address from the Server page. No automatic local port scanning is implemented.

### Local API checks

Development mode:

```bash
curl http://127.0.0.1:14567/v1/models
```

For packaged apps, substitute the actual `127.0.0.1` port shown by deepLocal. Avoid binding deepLocal to `0.0.0.0` for normal personal use.

## OpenAI (optional cloud service)

1. In the extension popup, select **OpenAI (cloud, opt-in)**.
2. Enter an OpenAI API key. The key is sent from the popup to background-only `chrome.storage.session` for the browser session, and is never passed into the webpage content script. Unless you enable **Remember key on this device**, it is not written to persistent extension storage. Enabling that option additionally saves the key unencrypted in `chrome.storage.local`, which can be accessed by the extension and by anyone with sufficient local browser-profile access.
3. Enter the OpenAI model ID (default: `gpt-4.1-mini`). Model discovery is not offered for this provider.
4. Click **Translate current page**. Chrome grants access to `https://api.openai.com/*` through the extension manifest at installation.
5. The extension posts source text to `https://api.openai.com/v1/chat/completions` using Bearer token authentication. Unlike local modes, translated page content leaves your computer, subject to OpenAI's applicable API data practices and terms.

Cloud translation is never automatic fallback. The OpenAI API key is not bundled with the extension, and API calls may incur charges. Revoking site access for `api.openai.com` in Chrome extension settings prevents further cloud requests.

## Supported languages

The target-language selector supports 36 options, including English, Chinese (Simplified), Chinese (Traditional), Spanish, French, German, Portuguese, Italian, Russian, Japanese, Korean, Arabic, Hindi, Bengali, Urdu, Indonesian, Malay, Vietnamese, Thai, Turkish, Dutch, Polish, Ukrainian, Persian, Swahili, Tamil, Telugu, Hebrew, Greek, Swedish, Danish, Finnish, Norwegian, Czech, Romanian, and Hungarian. All language labels, code, UI, comments, configuration, tests, and documentation remain English-only. Chinese is offered as a translation output target; no Chinese-language resources or China-hosted translation services are bundled. Actual translation quality and script support depend on the selected model.

## Limitations

- This MVP translates up to 35 visible paragraph/list blocks, one at a time, with a maximum input of 3,500 characters per block.
- YouTube subtitle translation, PDFs, OCR, speech recognition, and auto-translation are **not yet implemented**.
- Chrome internal pages and protected browser pages cannot be scripted.
- Automatic language detection and progress reporting are not implemented.
- No live Ollama, deepLocal, or OpenAI connection has been tested in this build environment. The automated tests use local mocked API responses.

## Tests

From the project root, run:

```bash
node --test tests/*.test.js
node --check extension/background.js
node --check extension/content.js
node --check extension/popup.js
```

No npm dependency installation or build step is required.

## License

MIT. Original standalone starter code, not derived from BiRead or FluentRead.

## Progressive translation

Version 0.4.0 splits eligible page paragraphs into short sentence-sized translation jobs. Results appear next to their source paragraph as each request finishes. OpenAI uses up to three concurrent requests, and local backends use up to two. The extension processes up to 35 visible blocks and 120 sentence jobs per run. A progress indicator shows completed jobs and failures. Removing translations invalidates pending results, so they cannot reappear afterward. Translation speed depends on the selected model and network conditions; multiple OpenAI requests may incur usage charges and rate limits.

## Error reporting and viewport priority (v0.4.1)

Translation requests start with paragraphs closest to the reading viewport. OpenAI concurrency is capped at two requests. Errors from the translation API now display their HTTP status and a truncated provider message in the page progress banner; authentication, model access, invalid-request and rate-limit errors stop the remaining queue. A run is only marked complete when jobs have finished; failures are counted separately. Never share API keys or full authorization headers when reporting errors.

## Compact reading controls (v0.5.0)

The extension popup now opens in compact mode, with advanced provider settings behind the **Settings** button. Clicking **Translate page** closes the popup while translations continue asynchronously. Opening the extension action on an ordinary webpage also injects a small **T** tab at the right edge; its mini-panel provides **Translate page** and **Remove translations** actions using saved provider preferences. Successful translations no longer display progress or completion banners inside the webpage. Translation errors remain visible beside the affected text. The floating tab is installed only after the user invokes the extension, not on every visited website.

## API key isolation and deletion

This security update restricts both `chrome.storage.local` and `chrome.storage.session` to trusted extension contexts using `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` before credential access. Webpage content scripts cannot read either storage area. A remembered key is stored in plain form in Chrome's extension-local storage and is restored to session storage only when OpenAI translation is requested. It is never sent to the content script. The **Forget API Key** button removes the credential from both storage areas and disables the remember setting. This does not provide at-rest encryption, prevent a compromised extension/background script from accessing credentials, or revoke a key at OpenAI; rotate the key on the OpenAI dashboard if compromise is suspected.

## Passphrase-protected credential vault

Remembered OpenAI credentials are now encrypted in the extension popup using Web Crypto AES-256-GCM with a random 96-bit IV and PBKDF2-HMAC-SHA-256 (310,000 iterations, random 128-bit salt). The passphrase is never saved. Only ciphertext, salt, IV and KDF metadata are persisted in `chrome.storage.local`; the decrypted API key is kept in trusted-only `chrome.storage.session` after the user explicitly unlocks it. Browser restarts require unlocking again. Saving an encrypted key requires a passphrase of at least 12 characters. Existing legacy plaintext keys are migrated to session-only storage and deleted from `chrome.storage.local` when the popup opens; users must explicitly save them again with a passphrase. The **Forget API Key** button deletes both plaintext legacy and encrypted saved credentials as well as the session credential. Encryption does not protect against malware controlling the browser, compromised trusted extension code, or a weak passphrase. No passphrase recovery is available.

## Password manager autofill

The vault unlock form uses standard `username` and `current-password` autocomplete attributes so compatible password managers can offer to fill the vault passphrase. The account identifier is a non-secret, fixed label used only for matching. Chrome extension popup autofill is not supported by every password manager; manual fill or copy/paste remains available. The extension never saves the vault passphrase, and autofill does not bypass AES-GCM encryption or the 12-character minimum for creating a new vault. To use autofill, save the vault passphrase in your chosen password manager, not in the extension's local storage.

## Saving a key separately from translation

In Settings > OpenAI, enter a new API key, check **Remember encrypted key on this device**, enter a Vault passphrase of at least 12 characters, then click **Save encrypted API key**. The popup confirms when the encrypted key is saved. Reopening the popup intentionally leaves the API key input empty; the credential status indicates whether an encrypted key exists and whether it is unlocked for this session. Click **Unlock saved API key** with the passphrase after restarting the browser. **Translate page** no longer silently creates or overwrites the persistent encrypted credential; saving is an explicit action. The **Forget API Key** button removes saved and session credentials.

## Deleting OpenAI credentials

In Settings > OpenAI, select **Delete saved and active API key** to remove the encrypted credential, legacy plaintext credential, remember preference, and unlocked session key. The extension reads back both storage areas and confirms deletion only if no credential remains. Unchecking **Remember encrypted key on this device** also revokes both saved and active credentials. Browser profile backups and external password manager entries are not affected; revoke the key in your OpenAI account to invalidate it everywhere.

# Sovereign Bilingual Reader

A compact, inspectable Chrome Manifest V3 extension for bilingual webpage translation. Version 0.3 supports **two local model services (Ollama and deepLocal) plus an optional OpenAI cloud translation backend**. Original paragraphs remain visible while translated text is added below each block.

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
4. Click **Translate current page** and approve Chrome's one-time permission request for `https://api.openai.com/*`.
5. The extension posts source text to `https://api.openai.com/v1/chat/completions` using Bearer token authentication. Unlike local modes, translated page content leaves your computer, subject to OpenAI's applicable API data practices and terms.

Cloud translation is never automatic fallback. The OpenAI API key is not bundled with the extension, and API calls may incur charges. Revoking site access for `api.openai.com` in Chrome extension settings prevents further cloud requests.

## Supported languages

The current target-language selector offers English, German, French, and Spanish. The extension code, UI, comments, configuration, tests, and documentation are English-only. It does not bundle Chinese-language resources or China-hosted translation services.

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

'use strict';

const DEFAULT_DEEPLOCAL_BASE_URL = 'http://127.0.0.1:14567/v1';
const providerInput = document.getElementById('provider');
const modelInput = document.getElementById('model');
const targetInput = document.getElementById('target');
const deepLocalInput = document.getElementById('deeplocal-url');
const deepLocalSettings = document.getElementById('deeplocal-settings');
const openAiSettings = document.getElementById('openai-settings');
const apiKeyInput = document.getElementById('openai-api-key');
const rememberKeyInput = document.getElementById('remember-openai-key');
const vaultPassphraseInput = document.getElementById('vault-passphrase');
const discoverButton = document.getElementById('discover');
const modelList = document.getElementById('model-list');
const status = document.getElementById('status');
let modelsByProvider = { ollama: 'gemma3:4b', deeplocal: '', openai: 'gpt-4.1-mini' };

const storageReady = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
]);


const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KDF_ITERATIONS = 310000;
function base64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
async function deriveVaultKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptCredential(credential, passphrase) {
  if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(credential));
  return { version: 1, kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}
async function decryptCredential(record, passphrase) {
  if (!record || record.version !== 1 || record.kdf !== 'PBKDF2-SHA256' ||
      record.iterations !== KDF_ITERATIONS) throw new Error('Unsupported encrypted key format.');
  try {
    const key = await deriveVaultKey(passphrase, fromBase64(record.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) }, key, fromBase64(record.ciphertext)
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('Incorrect passphrase or damaged encrypted key.');
  }
}

function validLocalBaseUrl(raw) {
  const url = new URL(raw.trim());
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.username || url.password || url.search || url.hash ||
      !['/v1', '/v1/'].includes(url.pathname)) {
    throw new Error('deepLocal must use http://127.0.0.1:<port>/v1.');
  }
  return `${url.origin}/v1`;
}

function settings() {
  const provider = providerInput.value;
  const model = modelInput.value.trim();
  if (!model || model.length > 200 || /[\u0000-\u001f\u007f]/.test(model)) {
    throw new Error('Select or enter a valid loaded model ID.');
  }
  return {
    provider, model, target: targetInput.value,
    deepLocalBaseUrl: provider === 'deeplocal' ? validLocalBaseUrl(deepLocalInput.value) : undefined,
    apiKey: provider === 'openai' ? apiKeyInput.value.trim() : undefined
  };
}

function toggleProvider() {
  const provider = providerInput.value;
  deepLocalSettings.hidden = provider !== 'deeplocal';
  openAiSettings.hidden = provider !== 'openai';
  discoverButton.hidden = provider === 'openai';
  modelInput.value = modelsByProvider[provider] || '';
  modelInput.placeholder = provider === 'deeplocal' ? 'Find or paste a loaded model ID' : provider === 'openai' ? 'gpt-4.1-mini' : 'gemma3:4b';
  modelList.replaceChildren();
  status.textContent = '';
}

async function savePreferences() {
  await storageReady;
  modelsByProvider[providerInput.value] = modelInput.value.trim();
  const values = {
    provider: providerInput.value,
    ollamaModel: modelsByProvider.ollama,
    deepLocalModel: modelsByProvider.deeplocal,
    deepLocalBaseUrl: deepLocalInput.value.trim(),
    openAiModel: modelsByProvider.openai,
    rememberOpenAiKey: rememberKeyInput.checked,
    target: targetInput.value
  };
  // Credential persistence is managed explicitly, never by preference changes.
  await chrome.storage.local.set(values);
}

storageReady.then(async () => {
  const prefs = await chrome.storage.local.get(['provider', 'ollamaModel', 'deepLocalModel', 'openAiModel', 'openAiApiKey', 'encryptedOpenAiApiKey', 'rememberOpenAiKey', 'deepLocalBaseUrl', 'model', 'target']);
  if (prefs.openAiApiKey) {
    // Migrate old plaintext storage to session-only without writing it back to disk.
    await chrome.storage.session.set({ openAiApiKey: prefs.openAiApiKey });
    await chrome.storage.local.remove('openAiApiKey');
    await chrome.storage.local.set({ rememberOpenAiKey: false });
    prefs.rememberOpenAiKey = false;
    status.textContent = 'Previous plaintext key moved to this session. Save it with a passphrase to remember it securely.';
  }
  return prefs;
}).then(prefs => {
  modelsByProvider = {
    ollama: prefs.ollamaModel || prefs.model || 'gemma3:4b',
    deeplocal: prefs.deepLocalModel || '',
    openai: prefs.openAiModel || 'gpt-4.1-mini'
  };
  deepLocalInput.value = prefs.deepLocalBaseUrl || DEFAULT_DEEPLOCAL_BASE_URL;
  providerInput.value = ['deeplocal', 'openai'].includes(prefs.provider) ? prefs.provider : 'ollama';
  rememberKeyInput.checked = Boolean(prefs.encryptedOpenAiApiKey);
  apiKeyInput.value = '';
  if (['en', 'de', 'fr', 'es'].includes(prefs.target)) targetInput.value = prefs.target;
  toggleProvider();
}).catch(error => { status.textContent = `Unable to secure key storage: ${error.message}`; });

providerInput.addEventListener('change', async () => {
  toggleProvider();
  await savePreferences();
});
modelInput.addEventListener('change', () => { savePreferences().catch(() => {}); });
rememberKeyInput.addEventListener('change', async () => {
  try {
    if (!rememberKeyInput.checked) {
      await storageReady;
      await chrome.storage.local.remove(['encryptedOpenAiApiKey', 'openAiApiKey']);
      vaultPassphraseInput.value = '';
      status.textContent = 'Saved credential removed. Session access remains available.';
    }
    await savePreferences();
  } catch (error) { status.textContent = `Unable to update key storage: ${error.message}`; }
});

document.getElementById('discover').addEventListener('click', async () => {
  status.textContent = 'Contacting local model service...';
  try {
    const provider = providerInput.value;
    const deepLocalBaseUrl = provider === 'deeplocal' ? validLocalBaseUrl(deepLocalInput.value) : undefined;
    const result = await chrome.runtime.sendMessage({ type: 'LIST_MODELS', provider, deepLocalBaseUrl });
    if (!result?.ok) throw new Error(result?.error || 'Model discovery failed.');
    modelList.replaceChildren();
    for (const id of result.models) {
      const option = document.createElement('option');
      option.value = id;
      modelList.append(option);
    }
    if (!result.models.length) {
      status.textContent = 'No models found. Load a model in the selected local service first.';
      return;
    }
    if (!result.models.includes(modelInput.value.trim())) modelInput.value = result.models[0];
    await savePreferences();
    status.textContent = `${result.models.length} local model(s) found. Select a model ID or use the suggested one.`;
  } catch (error) {
    status.textContent = `Local connection failed: ${error.message}`;
  }
});

async function send(type) {
  status.textContent = '';
  try {
    const options = type === 'START' ? settings() : null;
    if (options) {
      const backend = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_INFO' });
      if (!backend?.ok || !backend.providers?.includes(options.provider) || backend.version !== chrome.runtime.getManifest().version) {
        throw new Error('Extension components are out of date. Reload the extension at chrome://extensions, then refresh this webpage.');
      }
    }
    if (options) {
      if (options.provider === 'openai') {
        // OpenAI access is declared in the manifest; the provider remains opt-in.
        await storageReady;
        if (options.apiKey) {
          await chrome.storage.session.set({ openAiApiKey: options.apiKey });
        } else {
          const stored = await chrome.storage.session.get('openAiApiKey');
          if (!stored.openAiApiKey) throw new Error('Enter your OpenAI API key.');
        }
      }
      if (options.provider === 'openai' && rememberKeyInput.checked && options.apiKey) {
        const passphrase = vaultPassphraseInput.value;
        const encrypted = await encryptCredential(options.apiKey, passphrase);
        await chrome.storage.local.set({ encryptedOpenAiApiKey: encrypted });
        vaultPassphraseInput.value = '';
      }
      await savePreferences();
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open a normal website before using translation.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const pageOptions = options ? {
      provider: options.provider, model: options.model, target: options.target,
      deepLocalBaseUrl: options.deepLocalBaseUrl
    } : {};
    const result = await chrome.tabs.sendMessage(tab.id, { type, ...pageOptions });
    if (!result?.ok) throw new Error('The webpage did not respond.');
    if (type === 'START') window.close();
    else status.textContent = 'Translations removed.';
  } catch (error) {
    status.textContent = `Operation failed: ${error.message}`;
    document.getElementById('advanced').hidden = false;
    document.getElementById('settings-toggle').setAttribute('aria-expanded', 'true');
  }
}

document.getElementById('unlock-api-key').addEventListener('click', async () => {
  try {
    await storageReady;
    const { encryptedOpenAiApiKey } = await chrome.storage.local.get('encryptedOpenAiApiKey');
    if (!encryptedOpenAiApiKey) throw new Error('No encrypted API key is saved.');
    const key = await decryptCredential(encryptedOpenAiApiKey, vaultPassphraseInput.value);
    await chrome.storage.session.set({ openAiApiKey: key });
    apiKeyInput.value = '';
    vaultPassphraseInput.value = '';
    status.textContent = 'API key unlocked for this browser session.';
  } catch (error) { status.textContent = `Unable to unlock key: ${error.message}`; }
});

document.getElementById('forget-api-key').addEventListener('click', async () => {
  try {
    await storageReady;
    await Promise.all([
      chrome.storage.local.remove(['openAiApiKey', 'encryptedOpenAiApiKey']),
      chrome.storage.session.remove('openAiApiKey')
    ]);
    apiKeyInput.value = '';
    vaultPassphraseInput.value = '';
    rememberKeyInput.checked = false;
    await chrome.storage.local.set({ rememberOpenAiKey: false });
    status.textContent = 'OpenAI API key forgotten on this device.';
  } catch (error) {
    status.textContent = `Unable to forget API key: ${error.message}`;
  }
});

document.getElementById('settings-toggle').addEventListener('click', () => {
  const advanced = document.getElementById('advanced');
  advanced.hidden = !advanced.hidden;
  document.getElementById('settings-toggle').setAttribute('aria-expanded', String(!advanced.hidden));
});
document.getElementById('close').addEventListener('click', () => window.close());

// Opening the extension action installs the small on-page tab on normal webpages.
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  if (tab?.id && /^https?:\/\//.test(tab.url || '')) {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); }
    catch { /* Restricted pages do not support injected controls. */ }
  }
}).catch(() => {});

document.getElementById('start').addEventListener('click', () => send('START'));
document.getElementById('clear').addEventListener('click', () => send('CLEAR'));

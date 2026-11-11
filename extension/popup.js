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
const discoverButton = document.getElementById('discover');
const modelList = document.getElementById('model-list');
const status = document.getElementById('status');
let modelsByProvider = { ollama: 'gemma3:4b', deeplocal: '', openai: 'gpt-4.1-mini' };
let openAiPermissionGranted = false;

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
  if (rememberKeyInput.checked) values.openAiApiKey = apiKeyInput.value.trim();
  else await chrome.storage.local.remove('openAiApiKey');
  await chrome.storage.local.set(values);
}

chrome.storage.local.get(['provider', 'ollamaModel', 'deepLocalModel', 'openAiModel', 'openAiApiKey', 'rememberOpenAiKey', 'deepLocalBaseUrl', 'model', 'target'], prefs => {
  modelsByProvider = {
    ollama: prefs.ollamaModel || prefs.model || 'gemma3:4b',
    deeplocal: prefs.deepLocalModel || '',
    openai: prefs.openAiModel || 'gpt-4.1-mini'
  };
  deepLocalInput.value = prefs.deepLocalBaseUrl || DEFAULT_DEEPLOCAL_BASE_URL;
  providerInput.value = ['deeplocal', 'openai'].includes(prefs.provider) ? prefs.provider : 'ollama';
  rememberKeyInput.checked = Boolean(prefs.rememberOpenAiKey);
  if (rememberKeyInput.checked) apiKeyInput.value = prefs.openAiApiKey || '';
  if (['en', 'de', 'fr', 'es'].includes(prefs.target)) targetInput.value = prefs.target;
  toggleProvider();
});

providerInput.addEventListener('change', async () => {
  toggleProvider();
  await savePreferences();
});
modelInput.addEventListener('change', () => { savePreferences().catch(() => {}); });
rememberKeyInput.addEventListener('change', () => { savePreferences().catch(() => {}); });

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
      if (options.provider === 'openai') {
        if (!options.apiKey) throw new Error('Enter your OpenAI API key.');
        const granted = await chrome.permissions.request({ origins: ['https://api.openai.com/*'] });
        if (!granted) throw new Error('OpenAI network permission was not granted.');
      }
      await savePreferences();
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open a normal website before using translation.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, { type, ...options });
    if (!result?.ok) throw new Error('The webpage did not respond.');
    status.textContent = type === 'START'
      ? (options.provider === 'openai' ? 'OpenAI translation started. Selected page text is sent to api.openai.com.' : 'Local translation started. Translations will appear gradually.')
      : 'Translations removed.';
  } catch (error) {
    status.textContent = `Operation failed: ${error.message}`;
  }
}

document.getElementById('start').addEventListener('click', () => send('START'));
document.getElementById('clear').addEventListener('click', () => send('CLEAR'));

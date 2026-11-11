'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
function createWorker(responder) {
  let handler;
  const calls = [];
  const sessionValues = {};
  const localValues = {};
  const accessLevels = [];
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    chrome: {
      runtime: { onMessage: { addListener(fn) { handler = fn; } } },
      storage: {
        session: {
          async setAccessLevel(options) { accessLevels.push(['session', options.accessLevel]); },
          async get(key) { return { [key]: sessionValues[key] }; },
          async set(values) { Object.assign(sessionValues, values); }
        },
        local: {
          async setAccessLevel(options) { accessLevels.push(['local', options.accessLevel]); },
          async get(keys) { return Object.fromEntries(keys.map(key => [key, localValues[key]])); }
        }
      }
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return { ok: true, json: async () => responder(url, options) };
    }
  };
  vm.runInNewContext(script, context, { filename: 'background.js' });
  return {
    calls,
    setSessionKey(key) { sessionValues.openAiApiKey = key; },
    setRememberedKey(key) { localValues.openAiApiKey = key; localValues.rememberOpenAiKey = true; },
    setLocalPreferences(values) { Object.assign(localValues, values); },
    accessLevels,
    message(request, fromTab = true) {
      return new Promise(resolve => {
        const isAsync = handler(request, fromTab ? { tab: { id: 1 } } : {}, resolve);
        if (isAsync === false && !['LIST_MODELS', 'TRANSLATE'].includes(request.type)) resolve(null);
      });
    }
  };
}

test('deepLocal translation uses the OpenAI-compatible endpoint and disables document retrieval', async () => {
  const worker = createWorker(() => ({ choices: [{ message: { content: 'Guten Tag' } }] }));
  const result = await worker.message({
    type: 'TRANSLATE', provider: 'deeplocal',
    deepLocalBaseUrl: 'http://127.0.0.1:61234/v1',
    model: 'my-gguf-model', target: 'de', text: 'Good day'
  });
  assert.equal(result.translation, 'Guten Tag');
  assert.equal(worker.calls[0].url, 'http://127.0.0.1:61234/v1/chat/completions');
  const body = JSON.parse(worker.calls[0].options.body);
  assert.equal(body.use_documents, false);
  assert.equal(body.stream, false);
  assert.equal(body.model, 'my-gguf-model');
});

test('Ollama keeps its own native chat API and model format', async () => {
  const worker = createWorker(() => ({ message: { content: 'Bonjour' } }));
  const result = await worker.message({
    type: 'TRANSLATE', provider: 'ollama', model: 'gemma3:4b', target: 'fr', text: 'Hello'
  });
  assert.equal(result.translation, 'Bonjour');
  assert.equal(worker.calls[0].url, 'http://127.0.0.1:11434/api/chat');
  const body = JSON.parse(worker.calls[0].options.body);
  assert.equal(body.options.temperature, 0);
});

test('model discovery reads loaded deepLocal model IDs', async () => {
  const worker = createWorker(() => ({ data: [{ id: 'local-model-id' }] }));
  const result = await worker.message({
    type: 'LIST_MODELS', provider: 'deeplocal',
    deepLocalBaseUrl: 'http://127.0.0.1:14567/v1'
  }, false);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.models), ['local-model-id']);
  assert.equal(worker.calls[0].url, 'http://127.0.0.1:14567/v1/models');
});

test('model discovery reads Ollama model names', async () => {
  const worker = createWorker(() => ({ models: [{ name: 'gemma3:4b' }] }));
  const result = await worker.message({ type: 'LIST_MODELS', provider: 'ollama' }, false);
  assert.deepEqual(Array.from(result.models), ['gemma3:4b']);
  assert.equal(worker.calls[0].url, 'http://127.0.0.1:11434/api/tags');
});

test('deepLocal URL validation rejects remote hosts, local aliases, and other paths', async () => {
  for (const url of [
    'https://127.0.0.1:14567/v1',
    'http://localhost:14567/v1',
    'http://192.168.0.4:14567/v1',
    'http://127.0.0.1:14567/runtime',
    'http://127.0.0.1:14567/v1?redirect=1',
    'http://127.0.0.1:14567@remote.example/v1'
  ]) {
    const worker = createWorker(() => ({}));
    const result = await worker.message({
      type: 'TRANSLATE', provider: 'deeplocal', deepLocalBaseUrl: url,
      model: 'local-model', target: 'en', text: 'Hello'
    });
    assert.equal(result.ok, false, url);
    assert.equal(worker.calls.length, 0, url);
  }
});

test('rejects unsupported providers and oversized text without network access', async () => {
  const worker = createWorker(() => ({}));
  const unknown = await worker.message({ type: 'TRANSLATE', provider: 'cloud', model: 'x', target: 'en', text: 'Hello' });
  assert.equal(unknown.ok, false);
  const oversized = await worker.message({ type: 'TRANSLATE', provider: 'ollama', model: 'x', target: 'en', text: 'x'.repeat(3501) });
  assert.equal(oversized.ok, false);
  assert.equal(worker.calls.length, 0);
});

test('network calls explicitly reject HTTP redirects', async () => {
  const worker = createWorker(() => ({ message: { content: 'Hello' } }));
  const result = await worker.message({ type: 'TRANSLATE', provider: 'ollama', model: 'gemma3:4b', target: 'en', text: 'Hello' });
  assert.equal(result.ok, true);
  assert.equal(worker.calls[0].options.redirect, 'error');
});

test('OpenAI uses fixed HTTPS endpoint, Bearer token, and no local document retrieval option', async () => {
  const worker = createWorker(() => ({ choices: [{ message: { content: 'Hello' } }] }));
  const result = await worker.message({type:'TRANSLATE',provider:'openai',model:'gpt-4.1-mini',target:'en',text:'Hallo'});
  assert.equal(result.ok,false);
  assert.equal(worker.calls.length,0);
  await worker.setSessionKey('sk-test');
  const translated = await worker.message({type:'TRANSLATE',provider:'openai',model:'gpt-4.1-mini',target:'en',text:'Hallo'});
  assert.equal(translated.ok,true);
  assert.equal(worker.calls[0].url,'https://api.openai.com/v1/chat/completions');
  assert.equal(worker.calls[0].options.headers.Authorization,'Bearer sk-test');
  assert.equal(worker.calls[0].options.redirect,'error');
  const body=JSON.parse(worker.calls[0].options.body);
  assert.equal(body.use_documents,undefined);
  assert.equal(body.temperature,undefined);
});

test('OpenAI missing key is rejected before network activity', async () => {
  const worker = createWorker(() => ({}));
  const result = await worker.message({type:'TRANSLATE',provider:'openai',model:'gpt-4.1-mini',target:'en',text:'Hallo'});
  assert.equal(result.ok,false);
  assert.equal(worker.calls.length,0);
});

test('OpenAI model discovery is disabled without contacting its API', async () => {
  const worker = createWorker(() => ({}));
  const result = await worker.message({type:'LIST_MODELS',provider:'openai'},false);
  assert.equal(result.ok,false);
  assert.equal(worker.calls.length,0);
});

test('content scripts cannot set or overwrite OpenAI API credentials', async () => {
  const worker=createWorker(() => ({}));
  const result=await worker.message({type:'SET_API_KEY',apiKey:'sk-injected'},true);
  assert.equal(result,null);
  assert.equal(worker.calls.length,0);
});

test('storage is restricted to trusted extension contexts on startup', async () => {
  const worker = createWorker(() => ({}));
  assert.deepEqual(worker.accessLevels, [
    ['local', 'TRUSTED_CONTEXTS'], ['session', 'TRUSTED_CONTEXTS']
  ]);
});

test('remembered OpenAI key is restored only after storage restrictions are set', async () => {
  const worker = createWorker(() => ({ choices: [{ message: { content: 'Hello' } }] }));
  worker.setRememberedKey('sk-remembered');
  const result = await worker.message({ type: 'TRANSLATE', provider: 'openai', model: 'gpt-4.1-mini', target: 'en', text: 'Hallo' });
  assert.equal(result.ok, true);
  assert.equal(worker.calls[0].options.headers.Authorization, 'Bearer sk-remembered');
});

test('quick tab receives preferences but never receives saved credentials', async () => {
  const worker = createWorker(() => ({}));
  worker.setRememberedKey('sk-private');
  worker.setLocalPreferences({ provider: 'openai', openAiModel: 'gpt-4.1-mini', target: 'de' });
  const result = await worker.message({ type: 'GET_TRANSLATION_PREFS' });
  assert.equal(result.ok, true);
  assert.equal(result.settings.provider, 'openai');
  assert.equal(result.settings.model, 'gpt-4.1-mini');
  assert.equal(JSON.stringify(result).includes('sk-private'), false);
});

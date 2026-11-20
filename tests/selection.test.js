'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const manifest = require('../extension/manifest.json');

function harness() {
  const handlers = {};
  const sent = [];
  const menus = [];
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => manifest,
      onInstalled: { addListener(fn) { handlers.install = fn; } },
      onMessage: { addListener(fn) { handlers.message = fn; } }
    },
    contextMenus: {
      create(menu, callback) { menus.push(menu); callback(); },
      onClicked: { addListener(fn) { handlers.context = fn; } }
    },
    commands: { onCommand: { addListener(fn) { handlers.command = fn; } } },
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async () => ({ provider: 'ollama', ollamaModel: 'test-model', target: 'en' })
      },
      session: { setAccessLevel: async () => {}, get: async () => ({}) }
    },
    scripting: {
      executeScript: async options => options.func
        ? [{ result: 'decorate' }]
        : [{ result: undefined }]
    },
    tabs: {
      sendMessage: async (id, message) => { sent.push(message); return { ok: true }; },
      query: async () => [{ id: 7, url: 'https://example.com' }]
    }
  };
  const script = background.replace('async function translate(message) {',
    'async function translate(message) { return "translated: " + message.text; }\nasync function unusedTranslate(message) {');
  vm.runInNewContext(script, { chrome, URL, AbortController, fetch, setTimeout, clearTimeout, console });
  return { handlers, sent, menus };
}

test('registers selection-only context menu and configurable shortcut', () => {
  const { handlers, menus } = harness();
  handlers.install();
  assert.equal(menus.length, 1);
  assert.equal(menus[0].title, 'Translate selection');
  assert.deepEqual(Array.from(menus[0].contexts), ['selection']);
  assert.equal(manifest.commands['translate-selection'].suggested_key.mac, 'Command+Shift+Y');
});

test('translates context-menu selection without translating the entire page', async () => {
  const { handlers, sent } = harness();
  handlers.context({ menuItemId: 'sovereign-translate-selection', selectionText: 'decorate' },
    { id: 7, url: 'https://example.com' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].pending, true);
  assert.equal(sent[1].translation, 'translated: decorate');
  assert.equal(sent[0].requestId, sent[1].requestId);
});

test('shortcut reads selected text and sends a translation', async () => {
  const { handlers, sent } = harness();
  await handlers.command('translate-selection', { id: 7, url: 'https://example.com' });
  assert.equal(sent[1].translation, 'translated: decorate');
});

test('ignores unrelated context menu items', () => {
  const { handlers, sent } = harness();
  handlers.context({ menuItemId: 'other', selectionText: 'decorate' },
    { id: 7, url: 'https://example.com' });
  assert.equal(sent.length, 0);
});

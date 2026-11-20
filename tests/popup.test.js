'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const popup = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');

test('popup script parses before any extension UI handlers are registered', () => {
  assert.doesNotThrow(() => new vm.Script(popup, { filename: 'popup.js' }));
});

test('floating tab toggle accepts normal HTTP and HTTPS pages', () => {
  assert.match(popup, /const \[tab\] = await chrome\.tabs\.query/);
  assert.match(popup, /type: 'TOGGLE_QUICK_TAB'/);
  assert.match(popup, /chrome\.commands\.getAll\(\)/);
  assert.match(popup, /Open a normal webpage before toggling the floating tab/);
  assert.match(popup, /tab\.url\?\.startsWith\('https:\/\/'\)/);
  assert.match(popup, /tab\.url\?\.startsWith\('http:\/\/'\)/);
});

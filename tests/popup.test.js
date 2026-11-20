'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const popup = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');

test('popup script parses before extension handlers are registered', () => {
  assert.doesNotThrow(() => new vm.Script(popup, { filename: 'popup.js' }));
});

test('floating tab and translation actions use the active tab ID, not tab.url', () => {
  assert.match(popup, /type: 'TOGGLE_QUICK_TAB'/);
  assert.match(popup, /chrome\.commands\.getAll\(\)/);
  assert.match(popup, /if \(!tab\?\.id\)/);
  assert.doesNotMatch(popup, /tab\.url\?\.startsWith/);
  assert.doesNotMatch(popup, /\.test\(tab\.url/);
});

test('injection failures surface actionable permission messages', () => {
  assert.match(popup, /This tab does not allow extension controls/);
  assert.match(popup, /Unable to access this tab/);
});

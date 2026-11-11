'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');

function selectCandidates(elements) {
  const document = {
    querySelectorAll(selector) {
      return selector.includes('div, span') ? elements : [];
    },
    getElementById() { return {}; }
  };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl,
    console
  };
  // Capture the private selection function without changing extension behavior.
  const instrumented = script.replace('  function splitText(text) {',
    '  globalThis.__selectCandidates = candidates;\n  function splitText(text) {');
  vm.runInNewContext(instrumented, context);
  return Array.from(context.__selectCandidates());
}

function element({ text, tag = 'DIV', parent = '', children = [], visible = true, directText = null }) {
  return {
    innerText: text,
    children,
    childNodes: [{ nodeType: 3, textContent: directText === null ? (children.length ? '' : text) : directText }],
    querySelector(selector) { return parent === 'interactive' && selector.includes('button') ? {} : null; },
    getClientRects() { return visible ? [{}] : []; },
    closest(selector) {
      if (selector.includes('script,style')) return parent === 'excluded' ? this : null;
      if (selector.includes('data-sovereign-bilingual')) return null;
      if (selector.includes('main, article')) return parent === 'main' ? this : null;
      return null;
    },
    hasAttribute() { return false; },
    matches(selector) {
      return tag === 'BUTTON' && selector.includes('button') ||
        /^H[1-6]$/.test(tag) && selector.includes('h1') ||
        tag === 'P' && selector.includes('p, li');
    },
    contains(other) { return children.includes(other); }
  };
}

test('includes text-only chat questions and headings', () => {
  const question = element({ text: "What's a surprising fact about your city?", parent: 'outside-main' });
  const heading = element({ text: 'An interesting article heading', tag: 'H2' });
  assert.deepEqual(selectCandidates([question, heading]), [question, heading]);
});

test('skips toolbar content, hidden text, and wrapper duplicates', () => {
  const question = element({ text: 'What is an interesting fact about your city?', parent: 'main' });
  const wrapper = element({ text: question.innerText, parent: 'main', children: [question] });
  const toolbar = element({ text: 'Copy the selected text into the clipboard', parent: 'excluded' });
  const hidden = element({ text: 'This should not be translated when invisible', parent: 'main', visible: false });
  assert.deepEqual(selectCandidates([wrapper, question, toolbar, hidden]), [question]);
});

test('includes leaf chat prompts outside main and excludes interactive wrappers', () => {
  const prompt = element({ text: 'What is a surprising fact about your city?', tag: 'SPAN', parent: 'outside-main' });
  const interactive = element({ text: 'What is a surprising fact about your city? Copy', parent: 'interactive' });
  assert.deepEqual(selectCandidates([prompt, interactive]), [prompt]);
});

test('includes chat bubble text when a Copy button is a sibling', () => {
  const copy = element({ text: 'Copy', tag: 'BUTTON' });
  const bubble = element({ text: "What's a surprising fact about your city? Copy", children: [copy], directText: "What's a surprising fact about your city?" });
  assert.deepEqual(selectCandidates([bubble]), [bubble]);
});
